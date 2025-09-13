/**
 * End-to-End Integration Tests for Live Sync
 * Tests complete workflows from setup to sync completion
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { liveSpecSourceService } from "../services/live-spec-source.service"
import { syncEngineService } from "../services/sync-engine.service"
import { changeNotificationService } from "../services/change-notification.service"
import { teamLiveSyncService } from "../services/team-live-sync.service"
import { frameworkOptimizationService } from "../services/framework-optimization.service"
import { errorRecoveryService } from "../services/error-recovery.service"
import { performanceMonitorService } from "../services/performance-monitor.service"
import { platformIntegrationService } from "../services/platform-integration.service"
import { liveSyncCollectionsIntegration } from "../helpers/live-sync-collections-integration"
// import type { LiveSpecSource } from "../types/live-spec-source"

// Mock fetch for OpenAPI specs
global.fetch = vi.fn()

// Mock platform APIs
const mockPlatformAPI = {
  auth: { getCurrentUser: vi.fn() },
  workspace: { getCurrent: vi.fn() },
  storage: {
    set: vi.fn().mockResolvedValue(true),
    get: vi.fn(),
    getByPattern: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(true),
  },
  analytics: { track: vi.fn() },
  events: { on: vi.fn() },
}

describe("Live Sync End-to-End Integration", () => {
  const mockOpenAPISpec = {
    openapi: "3.0.0",
    info: {
      title: "Test API",
      version: "1.0.0",
      description: "A test API for live sync",
    },
    servers: [{ url: "http://localhost:3000" }],
    paths: {
      "/users": {
        get: {
          summary: "Get all users",
          responses: {
            "200": {
              description: "List of users",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: "Create a user",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateUser" },
              },
            },
          },
          responses: {
            "201": {
              description: "User created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/User" },
                },
              },
            },
          },
        },
      },
      "/users/{id}": {
        get: {
          summary: "Get user by ID",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "User details",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/User" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
          },
        },
        CreateUser: {
          type: "object",
          required: ["name", "email"],
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
          },
        },
      },
    },
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    // Initialize platform integration
    await platformIntegrationService.initialize(mockPlatformAPI)

    // Initialize collections integration
    await liveSyncCollectionsIntegration.initialize({
      addCollection: vi.fn(),
      updateCollection: vi.fn(),
      removeCollection: vi.fn(),
      getCollections: vi.fn().mockResolvedValue([]),
    })

    // Clear all services
    liveSpecSourceService.getSources().forEach((source) => {
      liveSpecSourceService.unregisterSource(source.id)
    })

    changeNotificationService.clearNotifications()
    performanceMonitorService.clearMetrics("test-source")
    errorRecoveryService.clearErrorHistory("test-source")
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe("Complete FastAPI Workflow", () => {
    it("should complete full FastAPI live sync setup and operation", async () => {
      // Step 1: Setup FastAPI source
      const sourceConfig = {
        name: "FastAPI Test API",
        type: "url" as const,
        url: "http://localhost:8000/openapi.json",
        framework: "fastapi" as const,
        syncStrategy: "incremental" as const,
      }

      // Mock successful OpenAPI fetch
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenAPISpec),
        headers: new Headers({ "content-type": "application/json" }),
      } as Response)

      // Step 2: Register source
      const source = await liveSpecSourceService.registerSource(sourceConfig)
      expect(source.id).toBeDefined()
      expect(source.framework).toBe("fastapi")

      // Step 3: Verify framework detection and optimization
      const frameworkConfig =
        frameworkOptimizationService.getFrameworkConfig("fastapi")
      expect(frameworkConfig).toBeDefined()
      expect(frameworkConfig!.defaultEndpoints).toContain("/openapi.json")

      // Step 4: Start sync monitoring
      performanceMonitorService.startSyncMeasurement(source.id)

      // Step 5: Trigger initial sync
      const syncResult = await syncEngineService.triggerSync(source.id)
      expect(syncResult.success).toBe(true)

      // Step 6: Verify performance monitoring
      const metrics = performanceMonitorService.endSyncMeasurement(
        source.id,
        mockOpenAPISpec
      )
      expect(metrics).toBeDefined()
      expect(metrics!.endpointCount).toBe(3) // GET /users, POST /users, GET /users/{id}

      // Step 7: Verify collection creation
      const liveCollections =
        liveSyncCollectionsIntegration.getLiveCollections()
      expect(liveCollections.length).toBeGreaterThan(0)

      // Step 8: Test change detection
      const modifiedSpec = {
        ...mockOpenAPISpec,
        paths: {
          ...mockOpenAPISpec.paths,
          "/posts": {
            get: {
              summary: "Get all posts",
              responses: {
                "200": {
                  description: "List of posts",
                },
              },
            },
          },
        },
      }

      // Mock updated spec fetch
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(modifiedSpec),
        headers: new Headers({ "content-type": "application/json" }),
      } as Response)

      // Step 9: Trigger sync with changes
      const updateResult = await syncEngineService.triggerSync(source.id)
      expect(updateResult.success).toBe(true)
      expect(updateResult.hasChanges).toBe(true)

      // Step 10: Verify notifications were sent
      const notifications = changeNotificationService.getNotifications()
      expect(notifications.length).toBeGreaterThan(0)

      // Step 11: Verify analytics tracking
      expect(mockPlatformAPI.analytics.track).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          platform: expect.any(String),
        })
      )
    })

    it("should handle FastAPI server connection errors gracefully", async () => {
      const sourceConfig = {
        name: "Failing FastAPI API",
        type: "url" as const,
        url: "http://localhost:8000/openapi.json",
        framework: "fastapi" as const,
        syncStrategy: "incremental" as const,
      }

      // Mock connection failure
      vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"))

      const source = await liveSpecSourceService.registerSource(sourceConfig)

      // Trigger sync that will fail
      const syncResult = await syncEngineService.triggerSync(source.id)
      expect(syncResult.success).toBe(false)

      // Verify error recovery was triggered
      const errorHistory = errorRecoveryService.getErrorHistory(source.id)
      expect(errorHistory.length).toBeGreaterThan(0)
      expect(errorHistory[0].errorType).toBe("connection_failed")

      // Verify framework-specific error message
      const errorMessage =
        frameworkOptimizationService.getFrameworkErrorMessage(
          "fastapi",
          "connection_failed"
        )
      expect(errorMessage).toContain("uvicorn")
    })
  })

  describe("Team Collaboration Workflow", () => {
    it("should handle team collaboration with conflict resolution", async () => {
      // Step 1: Setup source
      const sourceConfig = {
        name: "Team API",
        type: "url" as const,
        url: "http://localhost:3000/openapi.json",
        framework: "express" as const,
        syncStrategy: "incremental" as const,
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenAPISpec),
      } as Response)

      const source = await liveSpecSourceService.registerSource(sourceConfig)

      // Step 2: Share with team
      const teamSource = await teamLiveSyncService.shareSourceWithTeam(
        source.id,
        "team-123",
        {
          canEdit: true,
          canSync: true,
          canDelete: false,
        }
      )

      expect(teamSource.teamId).toBe("team-123")
      expect(teamSource.permissions.canSync).toBe(true)

      // Step 3: Subscribe team members
      teamLiveSyncService.subscribeToTeamUpdates("team-123", "user-1")
      teamLiveSyncService.subscribeToTeamUpdates("team-123", "user-2")

      // Step 4: Simulate concurrent sync attempt
      const sync1Promise = teamLiveSyncService.syncTeamSource(
        source.id,
        "team-123",
        "user-1"
      )

      // This should detect concurrent sync and create conflict
      await expect(
        teamLiveSyncService.syncTeamSource(source.id, "team-123", "user-2")
      ).rejects.toThrow("Concurrent sync detected")

      // Wait for first sync to complete
      await sync1Promise

      // Step 5: Verify team events were recorded
      const teamEvents = teamLiveSyncService.getTeamSyncEvents("team-123")
      expect(teamEvents.length).toBeGreaterThan(0)
      expect(teamEvents.some((e) => e.type === "source_shared")).toBe(true)
    })

    it("should handle user vs code change conflicts", async () => {
      const sourceConfig = {
        name: "Conflict API",
        type: "url" as const,
        url: "http://localhost:3000/openapi.json",
        framework: "express" as const,
        syncStrategy: "incremental" as const,
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenAPISpec),
      } as Response)

      const source = await liveSpecSourceService.registerSource(sourceConfig)

      await teamLiveSyncService.shareSourceWithTeam(source.id, "team-123", {
        canEdit: true,
        canSync: true,
        canDelete: false,
      })

      // Simulate user modifications vs code changes conflict
      const userChanges = { customHeaders: ["Authorization"] }
      const codeChanges = {
        hasChanges: true,
        endpoints: [
          {
            path: "/users",
            method: "GET",
            type: "modified" as const,
            isBreaking: true,
            summary: "Breaking change in response format",
          },
        ],
        summary: "Breaking changes detected",
      }

      await teamLiveSyncService.handleUserVsCodeConflict(
        source.id,
        "team-123",
        userChanges,
        codeChanges
      )

      // Verify conflict was created
      const conflicts = teamLiveSyncService.getActiveConflicts("team-123")
      expect(conflicts.length).toBe(1)
      expect(conflicts[0].conflictType).toBe("user_vs_code_changes")
      expect(conflicts[0].options.length).toBe(3) // keep, apply, merge
    })
  })

  describe("Framework-Specific Workflows", () => {
    const frameworks = [
      {
        name: "express" as const,
        url: "http://localhost:3000/api-docs",
        port: 3000,
      },
      {
        name: "spring" as const,
        url: "http://localhost:8080/v3/api-docs",
        port: 8080,
      },
      {
        name: "aspnet" as const,
        url: "http://localhost:5000/swagger/v1/swagger.json",
        port: 5000,
      },
    ]

    frameworks.forEach(({ name, url, port }) => {
      it(`should handle ${name} framework workflow`, async () => {
        const sourceConfig = {
          name: `${name} API`,
          type: "url" as const,
          url,
          framework: name,
          syncStrategy: "incremental" as const,
        }

        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockOpenAPISpec),
        } as Response)

        const source = await liveSpecSourceService.registerSource(sourceConfig)

        // Verify framework-specific configuration
        const config = frameworkOptimizationService.getFrameworkConfig(name)
        expect(config).toBeDefined()
        expect(config!.commonPorts).toContain(port)

        // Test framework-specific error recovery
        vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"))

        const recovery =
          await frameworkOptimizationService.performErrorRecovery(
            source,
            "ECONNREFUSED"
          )

        // Should attempt port scanning for connection errors
        expect(recovery.message).toBeDefined()
      })
    })
  })

  describe("Performance and Optimization", () => {
    it("should optimize sync performance with content hashing", async () => {
      const sourceConfig = {
        name: "Performance Test API",
        type: "url" as const,
        url: "http://localhost:3000/openapi.json",
        framework: "express" as const,
        syncStrategy: "incremental" as const,
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenAPISpec),
      } as Response)

      const source = await liveSpecSourceService.registerSource(sourceConfig)

      // First sync - should process normally
      performanceMonitorService.startSyncMeasurement(source.id)
      await syncEngineService.triggerSync(source.id)
      const metrics1 = performanceMonitorService.endSyncMeasurement(
        source.id,
        mockOpenAPISpec
      )

      // Second sync with same spec - should use cache
      const hasChanged = performanceMonitorService.hasSpecChanged(
        source.id,
        mockOpenAPISpec
      )
      expect(hasChanged).toBe(false) // Should be cached

      // Third sync with modified spec - should detect change
      const modifiedSpec = {
        ...mockOpenAPISpec,
        info: { ...mockOpenAPISpec.info, version: "2.0.0" },
      }
      const hasChanged2 = performanceMonitorService.hasSpecChanged(
        source.id,
        modifiedSpec
      )
      expect(hasChanged2).toBe(true) // Should detect change

      // Verify performance metrics
      expect(metrics1).toBeDefined()
      expect(metrics1!.syncDuration).toBeGreaterThan(0)
      expect(metrics1!.specSize).toBeGreaterThan(0)
    })

    it("should generate performance alerts for slow syncs", async () => {
      // Configure low threshold for testing
      performanceMonitorService.updateConfig({
        maxSyncDuration: 100,
        enablePerformanceAlerts: true,
      })

      const sourceConfig = {
        name: "Slow API",
        type: "url" as const,
        url: "http://localhost:3000/openapi.json",
        framework: "express" as const,
        syncStrategy: "incremental" as const,
      }

      // Mock slow response
      vi.mocked(fetch).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve(mockOpenAPISpec),
                } as Response),
              200
            )
          )
      )

      const source = await liveSpecSourceService.registerSource(sourceConfig)

      performanceMonitorService.startSyncMeasurement(source.id)
      await syncEngineService.triggerSync(source.id)
      performanceMonitorService.endSyncMeasurement(source.id, mockOpenAPISpec)

      // Should generate slow sync alert
      const alerts = performanceMonitorService.getActiveAlerts()
      expect(alerts.some((alert) => alert.type === "sync_slow")).toBe(true)
    })
  })

  describe("Error Scenarios and Recovery", () => {
    it("should handle complete service failure gracefully", async () => {
      const sourceConfig = {
        name: "Failing API",
        type: "url" as const,
        url: "http://localhost:3000/openapi.json",
        framework: "express" as const,
        syncStrategy: "incremental" as const,
      }

      // Mock complete service failure
      vi.mocked(fetch).mockRejectedValue(new Error("Service unavailable"))

      const source = await liveSpecSourceService.registerSource(sourceConfig)

      // Attempt sync
      const syncResult = await syncEngineService.triggerSync(source.id)
      expect(syncResult.success).toBe(false)

      // Verify error was handled
      const errorHistory = errorRecoveryService.getErrorHistory(source.id)
      expect(errorHistory.length).toBeGreaterThan(0)

      // Verify graceful degradation
      const config = errorRecoveryService.getConfig()
      expect(config.gracefulDegradation).toBe(true)
    })

    it("should recover from temporary network issues", async () => {
      const sourceConfig = {
        name: "Intermittent API",
        type: "url" as const,
        url: "http://localhost:3000/openapi.json",
        framework: "express" as const,
        syncStrategy: "incremental" as const,
      }

      const source = await liveSpecSourceService.registerSource(sourceConfig)

      // First attempt fails
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network timeout"))

      const syncResult1 = await syncEngineService.triggerSync(source.id)
      expect(syncResult1.success).toBe(false)

      // Second attempt succeeds
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOpenAPISpec),
      } as Response)

      const syncResult2 = await syncEngineService.triggerSync(source.id)
      expect(syncResult2.success).toBe(true)

      // Verify error history shows recovery
      const errorHistory = errorRecoveryService.getErrorHistory(source.id)
      expect(errorHistory.length).toBeGreaterThan(0)
    })
  })

  describe("Platform Integration", () => {
    it("should integrate with platform storage and analytics", async () => {
      const sourceConfig = {
        name: "Platform Test API",
        type: "url" as const,
        url: "http://localhost:3000/openapi.json",
        framework: "express" as const,
        syncStrategy: "incremental" as const,
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenAPISpec),
      } as Response)

      const source = await liveSpecSourceService.registerSource(sourceConfig)

      // Verify platform storage integration
      expect(mockPlatformAPI.storage.set).toHaveBeenCalled()

      // Trigger sync and verify analytics
      await syncEngineService.triggerSync(source.id)

      expect(mockPlatformAPI.analytics.track).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          platform: expect.any(String),
        })
      )
    })
  })
})
