/**
 * Integration tests for the complete live sync system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { liveSyncOrchestratorService } from "../live-sync-orchestrator.service"
import { liveSyncManagerService } from "../live-sync-manager.service"
import { liveSyncPollingService } from "../live-sync-polling.service"
import { smartCollectionUpdaterService } from "../smart-collection-updater.service"

// Mock dependencies
vi.mock("../live-spec-source.service", () => ({
  liveSpecSourceService: {
    getSource: vi.fn(),
    fetchSpec: vi.fn(),
    registerSource: vi.fn(),
  },
}))

vi.mock("../sync-engine.service", () => ({
  syncEngineService: {
    triggerSync: vi.fn(),
  },
}))

vi.mock("../change-notification.service", () => ({
  changeNotificationService: {
    showToast: vi.fn(),
    showBreakingChangeNotification: vi.fn(),
  },
}))

vi.mock("../performance-monitor.service", () => ({
  performanceMonitorService: {
    startSyncMeasurement: vi.fn(),
    endSyncMeasurement: vi.fn(),
  },
}))

vi.mock("../error-recovery.service", () => ({
  errorRecoveryService: {
    handleSyncError: vi.fn(),
  },
}))

vi.mock("~/newstore/collections", () => ({
  getLiveSyncCollections: vi.fn().mockReturnValue([]),
  findCollectionBySourceId: vi.fn().mockReturnValue(-1),
  updateCollectionSyncStatus: vi.fn(),
}))

vi.mock("~/helpers/live-sync-collections-integration", () => ({
  liveSyncCollectionsIntegration: {
    addRequestToCollection: vi.fn(),
    removeRequestFromCollection: vi.fn(),
  },
}))

describe("Live Sync Integration", () => {
  const mockSource = {
    id: "test-source-1",
    name: "Test API",
    type: "url" as const,
    config: {
      url: "https://api.example.com/openapi.json",
      pollInterval: 30000,
    },
    framework: {
      name: "Express",
      version: "4.18.0",
      detectedAt: new Date(),
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSpec = {
    openapi: "3.0.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/users": {
        get: {
          summary: "Get users",
          responses: { "200": { description: "Success" } },
        },
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mocks
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { liveSpecSourceService } = require("../live-spec-source.service")
    liveSpecSourceService.getSource.mockResolvedValue(mockSource)
    liveSpecSourceService.fetchSpec.mockResolvedValue({
      success: true,
      spec: mockSpec,
    })
  })

  afterEach(() => {
    // Cleanup any active polling/sessions
    liveSyncManagerService.destroy()
  })

  describe("Complete Live Sync Workflow", () => {
    it("should start complete live sync successfully", async () => {
      // Start complete live sync
      await liveSyncOrchestratorService.startCompleteLiveSync("test-source-1", {
        pollInterval: 10000, // 10 seconds for testing
        autoUpdateCollections: true,
      })

      // Verify manager started the session
      const session = liveSyncManagerService.getSession("test-source-1")
      expect(session).toBeTruthy()
      expect(session?.isActive).toBe(true)
      expect(session?.pollInterval).toBe(10000)

      // Verify polling is active
      const pollingStatus =
        liveSyncPollingService.getPollingStatus("test-source-1")
      expect(pollingStatus).toBeTruthy()
      expect(pollingStatus?.isPolling).toBe(true)
    })

    it("should stop complete live sync successfully", async () => {
      // Start then stop
      await liveSyncOrchestratorService.startCompleteLiveSync("test-source-1")
      await liveSyncOrchestratorService.stopCompleteLiveSync("test-source-1")

      // Verify session is stopped
      const session = liveSyncManagerService.getSession("test-source-1")
      expect(session).toBeNull()

      // Verify polling is stopped
      const pollingStatus =
        liveSyncPollingService.getPollingStatus("test-source-1")
      expect(pollingStatus).toBeNull()
    })

    it("should handle multiple sources simultaneously", async () => {
      const source2 = { ...mockSource, id: "test-source-2", name: "Test API 2" }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { liveSpecSourceService } = require("../live-spec-source.service")
      liveSpecSourceService.getSource.mockImplementation((id: string) => {
        if (id === "test-source-1") return Promise.resolve(mockSource)
        if (id === "test-source-2") return Promise.resolve(source2)
        return Promise.resolve(null)
      })

      // Start multiple sources
      await liveSyncOrchestratorService.startCompleteLiveSync("test-source-1")
      await liveSyncOrchestratorService.startCompleteLiveSync("test-source-2")

      // Verify both are active
      const activeSources = liveSyncOrchestratorService.getActiveSources()
      expect(activeSources).toContain("test-source-1")
      expect(activeSources).toContain("test-source-2")

      // Verify comprehensive status
      const status = liveSyncOrchestratorService.getComprehensiveStatus()
      expect(status.manager.globalStats.activeSessions).toBe(2)
      expect(status.polling.stats.totalActivePolls).toBe(2)
    })
  })

  describe("Polling Service", () => {
    it("should detect spec changes and trigger updates", async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { liveSpecSourceService } = require("../live-spec-source.service")
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { syncEngineService } = require("../sync-engine.service")

      // Setup changing spec
      let callCount = 0
      liveSpecSourceService.fetchSpec.mockImplementation(() => {
        callCount++
        const spec =
          callCount === 1
            ? mockSpec
            : {
                ...mockSpec,
                paths: {
                  ...mockSpec.paths,
                  "/posts": {
                    get: {
                      summary: "Get posts",
                      responses: { "200": { description: "Success" } },
                    },
                  },
                },
              }
        return Promise.resolve({ success: true, spec })
      })

      // Start polling with short interval
      await liveSyncPollingService.startPolling("test-source-1", 100) // 100ms

      // Wait for a few polls
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Verify sync was triggered due to changes
      expect(syncEngineService.triggerSync).toHaveBeenCalledWith(
        "test-source-1"
      )

      // Cleanup
      liveSyncPollingService.stopPolling("test-source-1")
    })

    it("should handle polling errors gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { liveSpecSourceService } = require("../live-spec-source.service")
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { errorRecoveryService } = require("../error-recovery.service")

      // Setup failing fetch
      liveSpecSourceService.fetchSpec.mockRejectedValue(
        new Error("Network error")
      )

      // Start polling
      await liveSyncPollingService.startPolling("test-source-1", 100)

      // Wait for error to occur
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Verify error handling was called
      expect(errorRecoveryService.handleSyncError).toHaveBeenCalled()

      // Cleanup
      liveSyncPollingService.stopPolling("test-source-1")
    })
  })

  describe("Smart Collection Updater", () => {
    it("should update collections while preserving user customizations", async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        getLiveSyncCollections,
        findCollectionBySourceId,
        // eslint-disable-next-line @typescript-eslint/no-var-requires
      } = require("~/newstore/collections")

      const mockCollection = {
        id: "collection-1",
        name: "Test Collection",
        requests: [
          {
            id: "req-1",
            name: "Get Users",
            method: "GET",
            endpoint: "/users",
            headers: [{ key: "Authorization", value: "Bearer token" }], // User customization
            auth: { authType: "none", authActive: true },
            params: [],
            preRequestScript: "",
            testScript: "",
            body: { contentType: null, body: null },
            requestVariables: [],
          },
        ],
        folders: [],
        liveMetadata: {
          sourceId: "test-source-1",
          framework: mockSource.framework,
        },
      }

      getLiveSyncCollections.mockReturnValue([mockCollection])
      findCollectionBySourceId.mockReturnValue(0)

      const specDiff = {
        hasChanges: true,
        summary: "1 modified",
        endpoints: [
          {
            path: "/users",
            method: "GET",
            type: "modified" as const,
            isBreaking: false,
            summary: "Updated user endpoint",
            details: [
              {
                field: "description",
                oldValue: "Get users",
                newValue: "Get all users",
                isBreaking: false,
              },
            ],
          },
        ],
      }

      // Update collection
      const result = await smartCollectionUpdaterService.updateCollection(
        "test-source-1",
        specDiff,
        { preserveUserCustomizations: true }
      )

      // Verify update was successful
      expect(result.success).toBe(true)
      expect(result.updatedRequests).toBe(1)
      expect(result.conflicts).toHaveLength(0) // No conflicts since we preserved customizations
    })

    it("should handle conflicts when both user and API changed", async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        getLiveSyncCollections,
        findCollectionBySourceId,
        // eslint-disable-next-line @typescript-eslint/no-var-requires
      } = require("~/newstore/collections")

      const mockCollection = {
        id: "collection-1",
        name: "Test Collection",
        requests: [
          {
            id: "req-1",
            name: "Custom User Endpoint Name", // User customized name
            method: "GET",
            endpoint: "/users",
            headers: [{ key: "Custom-Header", value: "custom-value" }],
            auth: { authType: "bearer", token: "user-token" }, // User customization
            params: [],
            preRequestScript: 'console.log("custom script")', // User customization
            testScript: "",
            body: { contentType: null, body: null },
            requestVariables: [],
          },
        ],
        folders: [],
        liveMetadata: {
          sourceId: "test-source-1",
          framework: mockSource.framework,
        },
      }

      getLiveSyncCollections.mockReturnValue([mockCollection])
      findCollectionBySourceId.mockReturnValue(0)

      const specDiff = {
        hasChanges: true,
        summary: "1 modified",
        endpoints: [
          {
            path: "/users",
            method: "GET",
            type: "modified" as const,
            isBreaking: true, // Breaking change
            summary: "Breaking change in user endpoint",
            details: [
              {
                field: "parameters",
                oldValue: [],
                newValue: [{ name: "limit", type: "integer", required: true }],
                isBreaking: true,
              },
            ],
          },
        ],
      }

      // Update with conflict resolution
      const result = await smartCollectionUpdaterService.updateCollection(
        "test-source-1",
        specDiff,
        {
          preserveUserCustomizations: true,
          conflictResolution: "prompt", // This should create conflicts
        }
      )

      // Verify conflicts were detected
      expect(result.conflicts.length).toBeGreaterThan(0)
      expect(result.conflicts[0].conflictType).toBe("both-modified")
    })
  })

  describe("Manager Service", () => {
    it("should manage session lifecycle correctly", async () => {
      // Start session
      await liveSyncManagerService.startLiveSync("test-source-1", {
        pollInterval: 5000,
        autoSync: true,
      })

      let session = liveSyncManagerService.getSession("test-source-1")
      expect(session?.status).toBe("active")
      expect(session?.isActive).toBe(true)

      // Pause session
      await liveSyncManagerService.pauseLiveSync("test-source-1")
      session = liveSyncManagerService.getSession("test-source-1")
      expect(session?.status).toBe("paused")
      expect(session?.isActive).toBe(false)

      // Resume session
      await liveSyncManagerService.resumeLiveSync("test-source-1")
      session = liveSyncManagerService.getSession("test-source-1")
      expect(session?.status).toBe("active")
      expect(session?.isActive).toBe(true)

      // Stop session
      await liveSyncManagerService.stopLiveSync("test-source-1")
      session = liveSyncManagerService.getSession("test-source-1")
      expect(session).toBeNull()
    })

    it("should handle manual sync triggers", async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { syncEngineService } = require("../sync-engine.service")

      await liveSyncManagerService.startLiveSync("test-source-1")
      await liveSyncManagerService.triggerManualSync("test-source-1")

      expect(syncEngineService.triggerSync).toHaveBeenCalledWith(
        "test-source-1"
      )

      const session = liveSyncManagerService.getSession("test-source-1")
      expect(session?.lastSyncAt).toBeTruthy()
    })

    it("should update poll intervals dynamically", async () => {
      await liveSyncManagerService.startLiveSync("test-source-1", {
        pollInterval: 30000,
      })

      let session = liveSyncManagerService.getSession("test-source-1")
      expect(session?.pollInterval).toBe(30000)

      // Update interval
      await liveSyncManagerService.updatePollInterval("test-source-1", 10000)

      session = liveSyncManagerService.getSession("test-source-1")
      expect(session?.pollInterval).toBe(10000)
    })
  })

  describe("Error Handling", () => {
    it("should handle source not found errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { liveSpecSourceService } = require("../live-spec-source.service")
      liveSpecSourceService.getSource.mockResolvedValue(null)

      await expect(
        liveSyncOrchestratorService.startCompleteLiveSync("non-existent-source")
      ).rejects.toThrow("Source not found")
    })

    it("should handle fetch failures gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { liveSpecSourceService } = require("../live-spec-source.service")
      liveSpecSourceService.fetchSpec.mockResolvedValue({
        success: false,
        error: "Network error",
      })

      await liveSyncPollingService.startPolling("test-source-1", 100)

      // Wait for polling attempt
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Should handle error without crashing
      const pollingStatus =
        liveSyncPollingService.getPollingStatus("test-source-1")
      expect(pollingStatus?.consecutiveErrors).toBeGreaterThan(0)

      liveSyncPollingService.stopPolling("test-source-1")
    })
  })

  describe("Performance", () => {
    it("should handle multiple rapid polls efficiently", async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { liveSpecSourceService } = require("../live-spec-source.service")
      let fetchCount = 0
      liveSpecSourceService.fetchSpec.mockImplementation(() => {
        fetchCount++
        return Promise.resolve({ success: true, spec: mockSpec })
      })

      // Start polling with very short interval
      await liveSyncPollingService.startPolling("test-source-1", 50) // 50ms

      // Wait for multiple polls
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Should have made multiple fetch calls
      expect(fetchCount).toBeGreaterThan(3)

      liveSyncPollingService.stopPolling("test-source-1")
    })

    it("should cleanup resources properly", async () => {
      // Start multiple sessions
      await liveSyncOrchestratorService.startCompleteLiveSync("test-source-1")

      const status = liveSyncOrchestratorService.getComprehensiveStatus()
      expect(status.manager.globalStats.activeSessions).toBe(1)

      // Destroy orchestrator
      liveSyncOrchestratorService.destroy()

      // Verify cleanup
      const finalStatus = liveSyncOrchestratorService.getComprehensiveStatus()
      expect(finalStatus.manager.globalStats.activeSessions).toBe(0)
    })
  })
})
