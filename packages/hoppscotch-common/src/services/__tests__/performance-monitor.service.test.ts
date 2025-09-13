import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { performanceMonitorService } from "../performance-monitor.service"

// Mock performance API
Object.defineProperty(global, "performance", {
  value: {
    now: vi.fn(() => Date.now()),
    memory: {
      usedJSHeapSize: 50 * 1024 * 1024, // 50MB
    },
  },
})

describe("PerformanceMonitorService", () => {
  const mockSpec = {
    openapi: "3.0.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/users": {
        get: { summary: "Get users" },
        post: { summary: "Create user" },
      },
      "/posts": {
        get: { summary: "Get posts" },
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    performanceMonitorService.clearMetrics("test-source")
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe("sync measurement", () => {
    it("should measure sync duration", () => {
      const sourceId = "test-source"

      performanceMonitorService.startSyncMeasurement(sourceId)

      // Mock some time passing
      vi.mocked(performance.now)
        .mockReturnValueOnce(1000) // start
        .mockReturnValueOnce(1500) // end

      const metrics = performanceMonitorService.endSyncMeasurement(
        sourceId,
        mockSpec
      )

      expect(metrics).toBeDefined()
      expect(metrics!.syncDuration).toBe(500)
      expect(metrics!.sourceId).toBe(sourceId)
    })

    it("should calculate spec size correctly", () => {
      const sourceId = "test-source"

      performanceMonitorService.startSyncMeasurement(sourceId)
      const metrics = performanceMonitorService.endSyncMeasurement(
        sourceId,
        mockSpec
      )

      expect(metrics!.specSize).toBeGreaterThan(0)
      expect(typeof metrics!.specSize).toBe("number")
    })

    it("should count endpoints correctly", () => {
      const sourceId = "test-source"

      performanceMonitorService.startSyncMeasurement(sourceId)
      const metrics = performanceMonitorService.endSyncMeasurement(
        sourceId,
        mockSpec
      )

      expect(metrics!.endpointCount).toBe(3) // GET /users, POST /users, GET /posts
    })

    it("should return null if measurement not started", () => {
      const metrics = performanceMonitorService.endSyncMeasurement(
        "test-source",
        mockSpec
      )
      expect(metrics).toBeNull()
    })
  })

  describe("content hashing", () => {
    it("should detect when spec content changes", () => {
      const sourceId = "test-source"

      // First check - should return true (new spec)
      const hasChanged1 = performanceMonitorService.hasSpecChanged(
        sourceId,
        mockSpec
      )
      expect(hasChanged1).toBe(true)

      // Second check with same spec - should return false (cached)
      const hasChanged2 = performanceMonitorService.hasSpecChanged(
        sourceId,
        mockSpec
      )
      expect(hasChanged2).toBe(false)

      // Third check with modified spec - should return true
      const modifiedSpec = {
        ...mockSpec,
        info: { ...mockSpec.info, version: "2.0.0" },
      }
      const hasChanged3 = performanceMonitorService.hasSpecChanged(
        sourceId,
        modifiedSpec
      )
      expect(hasChanged3).toBe(true)
    })

    it("should return cached spec when available", () => {
      const sourceId = "test-source"

      // Cache the spec
      performanceMonitorService.hasSpecChanged(sourceId, mockSpec)

      // Retrieve cached spec
      const cached = performanceMonitorService.getCachedSpec(sourceId)
      expect(cached).toEqual(mockSpec)
    })

    it("should return null for expired cache", () => {
      const sourceId = "test-source"

      // Update config to have very short TTL
      performanceMonitorService.updateConfig({ cacheTTL: 1 })

      // Cache the spec
      performanceMonitorService.hasSpecChanged(sourceId, mockSpec)

      // Wait for cache to expire
      setTimeout(() => {
        const cached = performanceMonitorService.getCachedSpec(sourceId)
        expect(cached).toBeNull()
      }, 10)
    })

    it("should bypass hashing when disabled", () => {
      const sourceId = "test-source"

      // Disable content hashing
      performanceMonitorService.updateConfig({ enableContentHashing: false })

      // Should always return true when hashing is disabled
      const hasChanged1 = performanceMonitorService.hasSpecChanged(
        sourceId,
        mockSpec
      )
      expect(hasChanged1).toBe(true)

      const hasChanged2 = performanceMonitorService.hasSpecChanged(
        sourceId,
        mockSpec
      )
      expect(hasChanged2).toBe(true)
    })
  })

  describe("performance alerts", () => {
    it("should generate alert for slow sync", () => {
      const sourceId = "test-source"

      // Configure low threshold
      performanceMonitorService.updateConfig({ maxSyncDuration: 100 })

      performanceMonitorService.startSyncMeasurement(sourceId)

      // Mock slow sync
      vi.mocked(performance.now)
        .mockReturnValueOnce(1000) // start
        .mockReturnValueOnce(1500) // end (500ms duration)

      performanceMonitorService.endSyncMeasurement(sourceId, mockSpec)

      const alerts = performanceMonitorService.getActiveAlerts()
      expect(alerts.some((alert) => alert.type === "sync_slow")).toBe(true)
    })

    it("should generate alert for high memory usage", () => {
      const sourceId = "test-source"

      // Configure low memory threshold
      performanceMonitorService.updateConfig({ maxMemoryUsage: 10 }) // 10MB

      performanceMonitorService.startSyncMeasurement(sourceId)
      performanceMonitorService.endSyncMeasurement(sourceId, mockSpec)

      const alerts = performanceMonitorService.getActiveAlerts()
      expect(alerts.some((alert) => alert.type === "memory")).toBe(true)
    })

    it("should generate alert for large spec", () => {
      const sourceId = "test-source"

      // Configure low spec size threshold
      performanceMonitorService.updateConfig({ maxSpecSize: 100 }) // 100 bytes

      performanceMonitorService.startSyncMeasurement(sourceId)
      performanceMonitorService.endSyncMeasurement(sourceId, mockSpec)

      const alerts = performanceMonitorService.getActiveAlerts()
      expect(alerts.some((alert) => alert.type === "large_spec")).toBe(true)
    })

    it("should not generate alerts when disabled", () => {
      const sourceId = "test-source"

      // Disable alerts
      performanceMonitorService.updateConfig({
        enablePerformanceAlerts: false,
        maxSyncDuration: 100,
      })

      performanceMonitorService.startSyncMeasurement(sourceId)

      // Mock slow sync
      vi.mocked(performance.now)
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1500)

      performanceMonitorService.endSyncMeasurement(sourceId, mockSpec)

      const alerts = performanceMonitorService.getActiveAlerts()
      expect(alerts).toHaveLength(0)
    })
  })

  describe("performance summary", () => {
    it("should calculate performance summary", () => {
      const sourceId = "test-source"

      // Generate some metrics
      for (let i = 0; i < 5; i++) {
        performanceMonitorService.startSyncMeasurement(sourceId)

        vi.mocked(performance.now)
          .mockReturnValueOnce(1000 + i * 1000)
          .mockReturnValueOnce(1000 + i * 1000 + 200 + i * 50) // Increasing duration

        performanceMonitorService.endSyncMeasurement(sourceId, mockSpec)
      }

      const summary = performanceMonitorService.getPerformanceSummary(sourceId)

      expect(summary.totalSyncs).toBe(5)
      expect(summary.averageSyncTime).toBeGreaterThan(0)
      expect(summary.averageSpecSize).toBeGreaterThan(0)
      expect(summary.cacheHitRate).toBeGreaterThanOrEqual(0)
      expect(["stable", "increasing", "decreasing"]).toContain(
        summary.memoryTrend
      )
    })

    it("should return empty summary for source with no metrics", () => {
      const summary =
        performanceMonitorService.getPerformanceSummary("non-existent")

      expect(summary.totalSyncs).toBe(0)
      expect(summary.averageSyncTime).toBe(0)
      expect(summary.averageSpecSize).toBe(0)
      expect(summary.cacheHitRate).toBe(0)
      expect(summary.memoryTrend).toBe("stable")
    })
  })

  describe("metrics management", () => {
    it("should retrieve metrics with limit", () => {
      const sourceId = "test-source"

      // Generate 10 metrics
      for (let i = 0; i < 10; i++) {
        performanceMonitorService.startSyncMeasurement(sourceId)
        performanceMonitorService.endSyncMeasurement(sourceId, mockSpec)
      }

      const metrics = performanceMonitorService.getMetrics(sourceId, 5)
      expect(metrics).toHaveLength(5)
    })

    it("should clear metrics for a source", () => {
      const sourceId = "test-source"

      // Generate some metrics
      performanceMonitorService.startSyncMeasurement(sourceId)
      performanceMonitorService.endSyncMeasurement(sourceId, mockSpec)

      expect(performanceMonitorService.getMetrics(sourceId)).toHaveLength(1)

      performanceMonitorService.clearMetrics(sourceId)

      expect(performanceMonitorService.getMetrics(sourceId)).toHaveLength(0)
    })

    it("should limit metrics history", () => {
      const sourceId = "test-source"

      // Generate more than 200 metrics
      for (let i = 0; i < 250; i++) {
        performanceMonitorService.startSyncMeasurement(sourceId)
        performanceMonitorService.endSyncMeasurement(sourceId, mockSpec)
      }

      const metrics = performanceMonitorService.getMetrics(sourceId, 300)
      expect(metrics.length).toBeLessThanOrEqual(200)
    })
  })

  describe("configuration", () => {
    it("should update configuration", () => {
      const newConfig = {
        maxRetries: 5,
        enableContentHashing: false,
        maxMemoryUsage: 1000,
      }

      performanceMonitorService.updateConfig(newConfig)

      const config = performanceMonitorService.getConfig()
      expect(config.enableContentHashing).toBe(false)
      expect(config.maxMemoryUsage).toBe(1000)
    })

    it("should return current configuration", () => {
      const config = performanceMonitorService.getConfig()

      expect(config).toHaveProperty("enableContentHashing")
      expect(config).toHaveProperty("enableMemoryMonitoring")
      expect(config).toHaveProperty("maxSyncDuration")
      expect(config).toHaveProperty("cacheEnabled")
    })
  })

  describe("cleanup", () => {
    it("should perform cleanup operations", () => {
      const sourceId = "test-source"

      // Generate some data
      performanceMonitorService.startSyncMeasurement(sourceId)
      performanceMonitorService.endSyncMeasurement(sourceId, mockSpec)

      // Cache some specs
      performanceMonitorService.hasSpecChanged(sourceId, mockSpec)

      // Perform cleanup
      performanceMonitorService.performCleanup()

      // Should not throw errors
      expect(true).toBe(true)
    })
  })

  describe("debouncing", () => {
    it("should detect rapid sync attempts", () => {
      const sourceId = "test-source"

      // Configure short debounce threshold
      performanceMonitorService.updateConfig({ debounceThreshold: 1000 })

      performanceMonitorService.startSyncMeasurement(sourceId)

      // Should not skip first sync
      expect(performanceMonitorService.shouldSkipSync(sourceId)).toBe(false)

      // Should skip immediate subsequent sync
      expect(performanceMonitorService.shouldSkipSync(sourceId)).toBe(true)
    })
  })
})
