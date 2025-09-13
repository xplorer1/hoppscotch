import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { errorRecoveryService } from "../error-recovery.service"
import type { LiveSpecSource } from "../../types/live-spec-source"

// Mock dependencies
vi.mock("../framework-optimization.service", () => ({
  frameworkOptimizationService: {
    getFrameworkConfig: vi.fn(),
    getFrameworkErrorMessage: vi.fn(),
  },
}))

vi.mock("../change-notification.service", () => ({
  changeNotificationService: {
    showToast: vi.fn(),
  },
}))

// Mock fetch
global.fetch = vi.fn()

describe("ErrorRecoveryService", () => {
  const mockSource: LiveSpecSource = {
    id: "test-source",
    name: "Test API",
    type: "url",
    status: "connected",
    config: { url: "http://localhost:3000/openapi.json" },
    syncStrategy: "incremental",
    createdAt: new Date(),
    updatedAt: new Date(),
    url: "http://localhost:3000/openapi.json",
    framework: "fastapi",
    isActive: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    errorRecoveryService.clearErrorHistory(mockSource.id)
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe("handleError", () => {
    it("should handle recoverable connection errors", async () => {
      const error = new Error("ECONNREFUSED")

      const result = await errorRecoveryService.handleError(
        mockSource,
        error,
        "connection_failed"
      )

      expect(result).toBe(false) // Auto-recovery failed, but error was handled

      const history = errorRecoveryService.getErrorHistory(mockSource.id)
      expect(history).toHaveLength(1)
      expect(history[0].errorType).toBe("connection_failed")
      expect(history[0].isRecoverable).toBe(true)
    })

    it("should handle non-recoverable authentication errors", async () => {
      const error = new Error("authentication failed")

      await errorRecoveryService.handleError(
        mockSource,
        error,
        "authentication_failed"
      )

      const history = errorRecoveryService.getErrorHistory(mockSource.id)
      expect(history[0].isRecoverable).toBe(false)
    })

    it("should attempt automatic recovery for recoverable errors", async () => {
      // Mock successful recovery
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response)

      const error = new Error("Connection refused")

      const result = await errorRecoveryService.handleError(
        mockSource,
        error,
        "connection_failed"
      )

      expect(result).toBe(true) // Auto-recovery succeeded
    })

    it("should provide framework-specific error messages", async () => {
      const { frameworkOptimizationService } = await import(
        "../framework-optimization.service"
      )
      vi.mocked(
        frameworkOptimizationService.getFrameworkErrorMessage
      ).mockReturnValue(
        "FastAPI server not running. Start with: uvicorn main:app --reload"
      )

      await errorRecoveryService.handleError(
        mockSource,
        "Connection failed",
        "connection_failed"
      )

      const history = errorRecoveryService.getErrorHistory(mockSource.id)
      expect(history[0].suggestedActions).toContain(
        "FastAPI server not running. Start with: uvicorn main:app --reload"
      )
    })
  })

  describe("triggerManualRecovery", () => {
    it("should attempt manual recovery", async () => {
      // First create an error
      await errorRecoveryService.handleError(
        mockSource,
        "Connection failed",
        "connection_failed"
      )

      const history = errorRecoveryService.getErrorHistory(mockSource.id)
      const error = history[0]

      // Mock successful recovery
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response)

      const result = await errorRecoveryService.triggerManualRecovery(
        mockSource,
        error
      )
      expect(result).toBe(true)
    })

    it("should handle failed manual recovery", async () => {
      await errorRecoveryService.handleError(
        mockSource,
        "Connection failed",
        "connection_failed"
      )

      const history = errorRecoveryService.getErrorHistory(mockSource.id)
      const error = history[0]

      // Mock failed recovery
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Still failing"))

      const result = await errorRecoveryService.triggerManualRecovery(
        mockSource,
        error
      )
      expect(result).toBe(false)
    })
  })

  describe("recovery strategies", () => {
    it("should try port scanning for connection failures", async () => {
      const { frameworkOptimizationService } = await import(
        "../framework-optimization.service"
      )
      vi.mocked(
        frameworkOptimizationService.getFrameworkConfig
      ).mockReturnValue({
        name: "fastapi",
        displayName: "FastAPI",
        defaultEndpoints: ["/openapi.json"],
        commonPorts: [8000, 8080, 3000],
        setupGuide: "",
        errorMessages: {},
        syncTriggers: {
          webhookSupport: false,
          fileWatchPatterns: [],
          customTriggers: [],
        },
        optimizations: {
          debounceMs: 500,
          batchUpdates: false,
          selectiveSync: false,
        },
      })

      // Mock first port fails, second succeeds
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValueOnce({ ok: true } as Response)

      await errorRecoveryService.handleError(
        mockSource,
        "ECONNREFUSED",
        "connection_failed"
      )

      expect(fetch).toHaveBeenCalledWith("http://localhost:8000/openapi.json", {
        method: "HEAD",
      })
      expect(fetch).toHaveBeenCalledWith("http://localhost:8080/openapi.json", {
        method: "HEAD",
      })
    })

    it("should try endpoint discovery for 404 errors", async () => {
      const { frameworkOptimizationService } = await import(
        "../framework-optimization.service"
      )
      vi.mocked(
        frameworkOptimizationService.getFrameworkConfig
      ).mockReturnValue({
        name: "express",
        displayName: "Express.js",
        defaultEndpoints: ["/api-docs", "/swagger.json"],
        commonPorts: [3000],
        setupGuide: "",
        errorMessages: {},
        syncTriggers: {
          webhookSupport: false,
          fileWatchPatterns: [],
          customTriggers: [],
        },
        optimizations: {
          debounceMs: 500,
          batchUpdates: false,
          selectiveSync: false,
        },
      })

      // Mock successful discovery
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ openapi: "3.0.0" }),
      } as Response)

      await errorRecoveryService.handleError(
        mockSource,
        "404 Not Found",
        "spec_not_found"
      )

      expect(fetch).toHaveBeenCalledWith("http://localhost:3000/api-docs")
    })

    it("should provide CORS guidance for CORS errors", async () => {
      const { frameworkOptimizationService } = await import(
        "../framework-optimization.service"
      )
      vi.mocked(
        frameworkOptimizationService.getFrameworkErrorMessage
      ).mockReturnValue(
        "CORS not configured. Add CORSMiddleware to your FastAPI app"
      )

      await errorRecoveryService.handleError(
        mockSource,
        "CORS policy error",
        "cors_error"
      )

      const { changeNotificationService } = await import(
        "../change-notification.service"
      )
      expect(changeNotificationService.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "warning",
          title: "CORS Configuration Needed",
        })
      )
    })
  })

  describe("error history management", () => {
    it("should track error history", async () => {
      await errorRecoveryService.handleError(
        mockSource,
        "Error 1",
        "connection_failed"
      )
      await errorRecoveryService.handleError(mockSource, "Error 2", "timeout")

      const history = errorRecoveryService.getErrorHistory(mockSource.id)
      expect(history).toHaveLength(2)
      expect(history[0].errorMessage).toBe("Error 2") // Most recent first
      expect(history[1].errorMessage).toBe("Error 1")
    })

    it("should clear error history", async () => {
      await errorRecoveryService.handleError(
        mockSource,
        "Error 1",
        "connection_failed"
      )
      await errorRecoveryService.handleError(mockSource, "Error 2", "timeout")

      errorRecoveryService.clearErrorHistory(mockSource.id, "connection_failed")

      const history = errorRecoveryService.getErrorHistory(mockSource.id)
      expect(history).toHaveLength(1)
      expect(history[0].errorType).toBe("timeout")
    })

    it("should limit error history size", async () => {
      // Add more than 50 errors
      for (let i = 0; i < 55; i++) {
        await errorRecoveryService.handleError(
          mockSource,
          `Error ${i}`,
          "connection_failed"
        )
      }

      const history = errorRecoveryService.getErrorHistory(mockSource.id)
      expect(history.length).toBeLessThanOrEqual(50)
    })
  })

  describe("configuration management", () => {
    it("should update configuration", () => {
      const newConfig = {
        maxRetries: 5,
        retryDelay: 10000,
        autoRecovery: false,
      }

      errorRecoveryService.updateConfig(newConfig)

      const config = errorRecoveryService.getConfig()
      expect(config.maxRetries).toBe(5)
      expect(config.retryDelay).toBe(10000)
      expect(config.autoRecovery).toBe(false)
    })

    it("should return current configuration", () => {
      const config = errorRecoveryService.getConfig()

      expect(config).toHaveProperty("maxRetries")
      expect(config).toHaveProperty("retryDelay")
      expect(config).toHaveProperty("autoRecovery")
      expect(config).toHaveProperty("gracefulDegradation")
    })
  })

  describe("retry logic", () => {
    it("should track retry count", async () => {
      // Simulate multiple failures
      await errorRecoveryService.handleError(
        mockSource,
        "Error 1",
        "connection_failed"
      )
      await errorRecoveryService.handleError(
        mockSource,
        "Error 2",
        "connection_failed"
      )
      await errorRecoveryService.handleError(
        mockSource,
        "Error 3",
        "connection_failed"
      )

      const history = errorRecoveryService.getErrorHistory(mockSource.id)
      expect(history[0].retryCount).toBe(2) // Third occurrence = 2 retries
      expect(history[1].retryCount).toBe(1) // Second occurrence = 1 retry
      expect(history[2].retryCount).toBe(0) // First occurrence = 0 retries
    })

    it("should identify recoverable vs non-recoverable errors", async () => {
      await errorRecoveryService.handleError(
        mockSource,
        "ECONNREFUSED",
        "connection_failed"
      )
      await errorRecoveryService.handleError(
        mockSource,
        "authentication failed",
        "authentication_failed"
      )

      const history = errorRecoveryService.getErrorHistory(mockSource.id)
      expect(history[1].isRecoverable).toBe(true) // Connection error is recoverable
      expect(history[0].isRecoverable).toBe(false) // Auth error is not recoverable
    })
  })
})
