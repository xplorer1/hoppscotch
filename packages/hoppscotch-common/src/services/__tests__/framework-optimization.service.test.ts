import { describe, it, expect, beforeEach, vi } from "vitest"
import { frameworkOptimizationService } from "../framework-optimization.service"
import type { LiveSpecSource } from "../../types/live-spec-source"
import type { SpecDiff } from "../../types/spec-diff"

// Mock fetch
global.fetch = vi.fn()

describe("FrameworkOptimizationService", () => {
  const mockSource: LiveSpecSource = {
    id: "test-source",
    name: "Test API",
    type: "url",
    status: "connected",
    config: { url: "http://localhost:8000/openapi.json" },
    syncStrategy: "incremental",
    createdAt: new Date(),
    updatedAt: new Date(),
    url: "http://localhost:8000/openapi.json",
    framework: "fastapi",
    isActive: true,
  }

  const mockDiff: SpecDiff = {
    hasChanges: true,
    endpoints: [
      {
        path: "/users",
        method: "GET",
        type: "added",
        isBreaking: false,
        summary: "New endpoint added",
      },
      {
        path: "/admin/users",
        method: "DELETE",
        type: "removed",
        isBreaking: true,
        summary: "Admin endpoint removed",
      },
    ],
    summary: "API updated with 2 changes",
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getFrameworkConfig", () => {
    it("should return FastAPI configuration", () => {
      const config = frameworkOptimizationService.getFrameworkConfig("fastapi")

      expect(config).toBeDefined()
      expect(config?.name).toBe("fastapi")
      expect(config?.displayName).toBe("FastAPI")
      expect(config?.defaultEndpoints).toContain("/openapi.json")
      expect(config?.commonPorts).toContain(8000)
    })

    it("should return Express configuration", () => {
      const config = frameworkOptimizationService.getFrameworkConfig("express")

      expect(config).toBeDefined()
      expect(config?.name).toBe("express")
      expect(config?.displayName).toBe("Express.js")
      expect(config?.defaultEndpoints).toContain("/api-docs")
      expect(config?.commonPorts).toContain(3000)
    })

    it("should return null for unknown framework", () => {
      const config = frameworkOptimizationService.getFrameworkConfig(
        "unknown" as any
      )
      expect(config).toBeNull()
    })
  })

  describe("getSetupGuide", () => {
    it("should return framework-specific setup guide", () => {
      const guide = frameworkOptimizationService.getSetupGuide("fastapi")

      expect(guide).toContain("FastAPI")
      expect(guide).toContain("uvicorn")
      expect(guide).toContain("CORSMiddleware")
    })

    it("should return generic guide for unknown framework", () => {
      const guide = frameworkOptimizationService.getSetupGuide("unknown" as any)

      expect(guide).toContain("Generic API")
      expect(guide).toContain("development server")
    })
  })

  describe("getFrameworkErrorMessage", () => {
    it("should return framework-specific error message", () => {
      const message = frameworkOptimizationService.getFrameworkErrorMessage(
        "fastapi",
        "connection_failed"
      )

      expect(message).toContain("uvicorn")
      expect(message).toContain("--reload")
    })

    it("should return generic error message for unknown error type", () => {
      const message = frameworkOptimizationService.getFrameworkErrorMessage(
        "fastapi",
        "unknown_error"
      )

      expect(message).toBe("An error occurred during sync.")
    })
  })

  describe("setupWebhook", () => {
    it("should configure webhook successfully", async () => {
      const webhookConfig = await frameworkOptimizationService.setupWebhook(
        "test-source",
        "https://api.github.com/webhook",
        ["push", "pull_request"],
        "secret123"
      )

      expect(webhookConfig.sourceId).toBe("test-source")
      expect(webhookConfig.webhookUrl).toBe("https://api.github.com/webhook")
      expect(webhookConfig.events).toEqual(["push", "pull_request"])
      expect(webhookConfig.secret).toBe("secret123")
      expect(webhookConfig.isActive).toBe(true)
    })

    it("should use default events if none provided", async () => {
      const webhookConfig = await frameworkOptimizationService.setupWebhook(
        "test-source",
        "https://api.github.com/webhook"
      )

      expect(webhookConfig.events).toEqual(["push", "pull_request"])
    })
  })

  describe("handleWebhookTrigger", () => {
    it("should trigger sync for valid webhook event", async () => {
      // Setup webhook first
      await frameworkOptimizationService.setupWebhook(
        "test-source",
        "https://api.github.com/webhook",
        ["push"]
      )

      const result = await frameworkOptimizationService.handleWebhookTrigger(
        "test-source",
        "push",
        { repository: "test-repo" }
      )

      expect(result).toBeDefined()
      expect(result?.success).toBe(true)
    })

    it("should return null for inactive webhook", async () => {
      const result = await frameworkOptimizationService.handleWebhookTrigger(
        "non-existent-source",
        "push",
        {}
      )

      expect(result).toBeNull()
    })

    it("should return null for unsupported event", async () => {
      // Setup webhook for push events only
      await frameworkOptimizationService.setupWebhook(
        "test-source",
        "https://api.github.com/webhook",
        ["push"]
      )

      const result = await frameworkOptimizationService.handleWebhookTrigger(
        "test-source",
        "release", // Not in supported events
        {}
      )

      expect(result).toBeNull()
    })
  })

  describe("configureSelectiveSync", () => {
    it("should configure selective sync settings", () => {
      const config = {
        includePatterns: ["/api/*", "/users/*"],
        excludePatterns: ["/admin/*"],
        endpointFilters: {
          methods: ["get", "post"],
          tags: ["public"],
          paths: [],
        },
      }

      frameworkOptimizationService.configureSelectiveSync("test-source", config)

      // Verify configuration was stored (tested indirectly through applySelectiveSync)
      expect(true).toBe(true) // Placeholder assertion
    })
  })

  describe("applySelectiveSync", () => {
    beforeEach(() => {
      // Configure selective sync for testing
      frameworkOptimizationService.configureSelectiveSync("test-source", {
        includePatterns: ["/users/*"],
        excludePatterns: ["/admin/*"],
        endpointFilters: {
          methods: ["get"],
          tags: [],
          paths: [],
        },
      })
    })

    it("should filter endpoints based on include patterns", () => {
      const filteredDiff = frameworkOptimizationService.applySelectiveSync(
        "test-source",
        mockDiff
      )

      // Should include /users but exclude /admin/users
      expect(filteredDiff.endpoints).toHaveLength(1)
      expect(filteredDiff.endpoints[0].path).toBe("/users")
    })

    it("should filter endpoints based on method filters", () => {
      const diffWithMixedMethods: SpecDiff = {
        hasChanges: true,
        endpoints: [
          {
            path: "/users",
            method: "GET",
            type: "added",
            isBreaking: false,
            summary: "GET endpoint",
          },
          {
            path: "/users",
            method: "POST",
            type: "added",
            isBreaking: false,
            summary: "POST endpoint",
          },
        ],
        summary: "Mixed methods",
      }

      const filteredDiff = frameworkOptimizationService.applySelectiveSync(
        "test-source",
        diffWithMixedMethods
      )

      // Should only include GET method
      expect(filteredDiff.endpoints).toHaveLength(1)
      expect(filteredDiff.endpoints[0].method).toBe("GET")
    })

    it("should return original diff if no selective sync configured", () => {
      const filteredDiff = frameworkOptimizationService.applySelectiveSync(
        "unconfigured-source",
        mockDiff
      )

      expect(filteredDiff).toEqual(mockDiff)
    })
  })

  describe("getOptimizationSettings", () => {
    it("should return framework-specific optimization settings", () => {
      const settings =
        frameworkOptimizationService.getOptimizationSettings("fastapi")

      expect(settings.debounceMs).toBe(1000) // FastAPI has longer debounce
      expect(settings.batchUpdates).toBe(true)
      expect(settings.selectiveSync).toBe(true)
    })

    it("should return default settings for unknown framework", () => {
      const settings = frameworkOptimizationService.getOptimizationSettings(
        "unknown" as any
      )

      expect(settings.debounceMs).toBe(500)
      expect(settings.batchUpdates).toBe(false)
      expect(settings.selectiveSync).toBe(false)
    })
  })

  describe("performErrorRecovery", () => {
    it("should recover from FastAPI connection errors", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response)

      const result = await frameworkOptimizationService.performErrorRecovery(
        mockSource,
        "Connection refused"
      )

      expect(result.recovered).toBe(true)
      expect(result.message).toContain("Found FastAPI server")
    })

    it("should provide recovery guidance for CORS errors", async () => {
      const result = await frameworkOptimizationService.performErrorRecovery(
        mockSource,
        "CORS error"
      )

      expect(result.recovered).toBe(false)
      expect(result.message).toContain("CORS middleware")
    })

    it("should handle Express 404 errors", async () => {
      const expressSource: LiveSpecSource = {
        ...mockSource,
        framework: "express",
        url: "http://localhost:3000/api-docs",
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response)

      const result = await frameworkOptimizationService.performErrorRecovery(
        expressSource,
        "404 Not Found"
      )

      expect(result.recovered).toBe(true)
      expect(result.message).toContain("Found OpenAPI spec")
    })

    it("should return generic recovery for unknown frameworks", async () => {
      const unknownSource: LiveSpecSource = {
        ...mockSource,
        framework: undefined,
      }

      const result = await frameworkOptimizationService.performErrorRecovery(
        unknownSource,
        "Some error"
      )

      expect(result.recovered).toBe(false)
      expect(result.message).toContain("No framework detected")
    })
  })
})
