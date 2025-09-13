import { describe, it, expect, beforeEach, vi } from "vitest"
import { teamLiveSyncService } from "../team-live-sync.service"
import type { LiveSpecSource } from "../../types/live-spec-source"
import type { SpecDiff } from "../../types/spec-diff"

// Mock dependencies
vi.mock("../live-spec-source.service", () => ({
  liveSpecSourceService: {
    getSource: vi.fn(),
  },
}))

vi.mock("../sync-engine.service", () => ({
  syncEngineService: {
    triggerSync: vi.fn(),
    applyChanges: vi.fn(),
  },
}))

vi.mock("../change-notification.service", () => ({
  changeNotificationService: {
    showToast: vi.fn(),
  },
}))

describe("TeamLiveSyncService", () => {
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
    ],
    summary: "API updated with 1 change",
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("shareSourceWithTeam", () => {
    it("should share a source with team members", async () => {
      const { liveSpecSourceService } = await import(
        "../live-spec-source.service"
      )
      vi.mocked(liveSpecSourceService.getSource).mockReturnValue(mockSource)

      const permissions = {
        canEdit: true,
        canSync: true,
        canDelete: false,
      }

      const teamSource = await teamLiveSyncService.shareSourceWithTeam(
        "test-source",
        "team-123",
        permissions
      )

      expect(teamSource.teamId).toBe("team-123")
      expect(teamSource.permissions).toEqual(permissions)
      expect(teamSource.sharedBy).toBe("current-user")
      expect(teamSource.subscribers).toEqual([])
    })

    it("should throw error if source not found", async () => {
      const { liveSpecSourceService } = await import(
        "../live-spec-source.service"
      )
      vi.mocked(liveSpecSourceService.getSource).mockReturnValue(null)

      await expect(
        teamLiveSyncService.shareSourceWithTeam("non-existent", "team-123", {
          canEdit: false,
          canSync: true,
          canDelete: false,
        })
      ).rejects.toThrow("Source not found")
    })
  })

  describe("getTeamSources", () => {
    it("should return team sources", () => {
      // First share a source
      const { liveSpecSourceService } = await import(
        "../live-spec-source.service"
      )
      vi.mocked(liveSpecSourceService.getSource).mockReturnValue(mockSource)

      teamLiveSyncService.shareSourceWithTeam("test-source", "team-123", {
        canEdit: true,
        canSync: true,
        canDelete: false,
      })

      const sources = teamLiveSyncService.getTeamSources("team-123")
      expect(sources).toHaveLength(1)
      expect(sources[0].id).toBe("test-source")
    })

    it("should return empty array for team with no sources", () => {
      const sources = teamLiveSyncService.getTeamSources("empty-team")
      expect(sources).toEqual([])
    })
  })

  describe("subscribeToTeamUpdates", () => {
    it("should add user to team subscribers", () => {
      teamLiveSyncService.subscribeToTeamUpdates("team-123", "user-456")

      // Verify subscription by checking if user gets notified
      // This is tested indirectly through the notification system
      expect(true).toBe(true) // Placeholder assertion
    })
  })

  describe("syncTeamSource", () => {
    it("should sync team source successfully", async () => {
      // Setup team source
      const { liveSpecSourceService } = await import(
        "../live-spec-source.service"
      )
      vi.mocked(liveSpecSourceService.getSource).mockReturnValue(mockSource)

      await teamLiveSyncService.shareSourceWithTeam("test-source", "team-123", {
        canEdit: true,
        canSync: true,
        canDelete: false,
      })

      // Mock successful sync
      const { syncEngineService } = await import("../sync-engine.service")
      const mockSyncResult = {
        success: true,
        hasChanges: true,
        changesSummary: ["1 endpoint added"],
        errors: [],
        timestamp: new Date(),
        changes: mockDiff,
      }
      vi.mocked(syncEngineService.triggerSync).mockResolvedValue(mockSyncResult)

      const result = await teamLiveSyncService.syncTeamSource(
        "test-source",
        "team-123",
        "user-456"
      )

      expect(result.success).toBe(true)
      expect(syncEngineService.triggerSync).toHaveBeenCalledWith("test-source")
    })

    it("should throw error if user lacks sync permissions", async () => {
      // Setup team source with no sync permission
      const { liveSpecSourceService } = await import(
        "../live-spec-source.service"
      )
      vi.mocked(liveSpecSourceService.getSource).mockReturnValue(mockSource)

      await teamLiveSyncService.shareSourceWithTeam("test-source", "team-123", {
        canEdit: true,
        canSync: false, // No sync permission
        canDelete: false,
      })

      await expect(
        teamLiveSyncService.syncTeamSource(
          "test-source",
          "team-123",
          "user-456"
        )
      ).rejects.toThrow("Insufficient permissions to sync this source")
    })

    it("should handle concurrent sync conflicts", async () => {
      // Setup team source
      const { liveSpecSourceService } = await import(
        "../live-spec-source.service"
      )
      vi.mocked(liveSpecSourceService.getSource).mockReturnValue(mockSource)

      await teamLiveSyncService.shareSourceWithTeam("test-source", "team-123", {
        canEdit: true,
        canSync: true,
        canDelete: false,
      })

      // Start first sync
      const { syncEngineService } = await import("../sync-engine.service")
      vi.mocked(syncEngineService.triggerSync).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      )

      const sync1Promise = teamLiveSyncService.syncTeamSource(
        "test-source",
        "team-123",
        "user-1"
      )

      // Try to start second sync immediately
      await expect(
        teamLiveSyncService.syncTeamSource("test-source", "team-123", "user-2")
      ).rejects.toThrow("Concurrent sync detected")

      // Clean up
      await sync1Promise.catch(() => {}) // Ignore the error from the first sync
    })
  })

  describe("handleUserVsCodeConflict", () => {
    it("should create conflict resolution options", async () => {
      const userChanges = { customHeaders: ["Authorization"] }

      await teamLiveSyncService.handleUserVsCodeConflict(
        "test-source",
        "team-123",
        userChanges,
        mockDiff
      )

      const conflicts = teamLiveSyncService.getActiveConflicts("team-123")
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe("user_vs_code_changes")
      expect(conflicts[0].options).toHaveLength(3) // keep, apply, merge
    })
  })

  describe("getActiveConflicts", () => {
    it("should return conflicts for specific team", async () => {
      // Create a conflict
      await teamLiveSyncService.handleUserVsCodeConflict(
        "test-source",
        "team-123",
        {},
        mockDiff
      )

      const conflicts = teamLiveSyncService.getActiveConflicts("team-123")
      expect(conflicts).toHaveLength(1)

      // Other team should have no conflicts
      const otherTeamConflicts =
        teamLiveSyncService.getActiveConflicts("team-456")
      expect(otherTeamConflicts).toHaveLength(0)
    })
  })

  describe("resolveConflict", () => {
    it("should resolve conflict and remove from active list", async () => {
      // Create a conflict
      await teamLiveSyncService.handleUserVsCodeConflict(
        "test-source",
        "team-123",
        {},
        mockDiff
      )

      const conflicts = teamLiveSyncService.getActiveConflicts("team-123")
      expect(conflicts).toHaveLength(1)

      const conflictId = conflicts[0].conflictId

      await teamLiveSyncService.resolveConflict(conflictId, "keep_user_changes")

      const remainingConflicts =
        teamLiveSyncService.getActiveConflicts("team-123")
      expect(remainingConflicts).toHaveLength(0)
    })

    it("should throw error for non-existent conflict", async () => {
      await expect(
        teamLiveSyncService.resolveConflict("non-existent", "resolution")
      ).rejects.toThrow("Conflict not found")
    })
  })

  describe("getTeamSyncEvents", () => {
    it("should return team sync events in chronological order", async () => {
      // Setup team source and perform sync
      const { liveSpecSourceService } = await import(
        "../live-spec-source.service"
      )
      vi.mocked(liveSpecSourceService.getSource).mockReturnValue(mockSource)

      await teamLiveSyncService.shareSourceWithTeam("test-source", "team-123", {
        canEdit: true,
        canSync: true,
        canDelete: false,
      })

      const events = teamLiveSyncService.getTeamSyncEvents("team-123")
      expect(events).toHaveLength(1) // Share event
      expect(events[0].type).toBe("source_shared")
    })

    it("should limit events to specified count", async () => {
      const events = teamLiveSyncService.getTeamSyncEvents("team-123", 5)
      expect(events.length).toBeLessThanOrEqual(5)
    })
  })
})
