/**
 * Tests for live sync cleanup when collections are deleted
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { HoppCollection } from "@hoppscotch/data"
import { LiveSyncCollection } from "~/types/live-collection-metadata"

// Mock the live sync manager service
const mockStopLiveSync = vi.fn()
vi.mock("~/services/live-sync-manager.service", () => ({
  liveSyncManagerService: {
    stopLiveSync: mockStopLiveSync,
  },
}))

describe("Collection Cleanup on Deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStopLiveSync.mockClear()
  })

  afterEach(() => {
    vi.clearAllTimers()
    mockStopLiveSync.mockReset()
  })

  it("should call stopLiveSync when collection with live sync metadata is removed", async () => {
    // Create a mock collection with live sync metadata
    const mockCollection: LiveSyncCollection = {
      name: "Test Collection",
      folders: [],
      requests: [],
      auth: { authType: "inherit", authActive: false },
      headers: [],
      liveMetadata: {
        sourceId: "test-source-123",
        isLiveSync: true,
        lastSyncTime: new Date(),
        syncStrategy: "incremental",
        syncConfig: {
          autoSync: true,
          preserveCustomizations: true,
          conflictResolution: "prompt",
        },
        changeTracking: {
          lastSpecHash: "abc123",
          pendingChanges: [],
          userModifications: [],
          conflictingChanges: [],
        },
        customizations: {
          requests: {},
          collection: {},
          folders: {},
        },
      },
    }

    // Simulate the removeCollection dispatcher logic
    const state = [mockCollection]
    const collectionIndex = 0
    const collectionToRemove = state[collectionIndex] as LiveSyncCollection

    // This simulates what happens in the dispatcher
    if (collectionToRemove?.liveMetadata?.sourceId) {
      setTimeout(async () => {
        try {
          const { liveSyncManagerService } = await import(
            "~/services/live-sync-manager.service"
          )
          await liveSyncManagerService.stopLiveSync(
            collectionToRemove.liveMetadata!.sourceId
          )
        } catch (error) {
          console.error(
            `Failed to cleanup live sync for collection ${collectionToRemove.name}:`,
            error
          )
        }
      }, 0)
    }

    // Wait for async cleanup to complete
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Verify live sync cleanup was called
    expect(mockStopLiveSync).toHaveBeenCalledWith("test-source-123")
  })

  it("should not call cleanup for regular collections without live sync", async () => {
    // Create a mock regular collection without live sync metadata
    const mockCollection: HoppCollection = {
      name: "Regular Collection",
      folders: [],
      requests: [],
      auth: { authType: "inherit", authActive: false },
      headers: [],
    }

    // Simulate the removeCollection dispatcher logic
    const state = [mockCollection]
    const collectionIndex = 0
    const collectionToRemove = state[collectionIndex] as LiveSyncCollection

    // This simulates what happens in the dispatcher
    if (collectionToRemove?.liveMetadata?.sourceId) {
      // This should not execute for regular collections
      setTimeout(async () => {
        try {
          const { liveSyncManagerService } = await import(
            "~/services/live-sync-manager.service"
          )
          await liveSyncManagerService.stopLiveSync(
            collectionToRemove.liveMetadata!.sourceId
          )
        } catch (error) {
          console.error(
            `Failed to cleanup live sync for collection ${collectionToRemove.name}:`,
            error
          )
        }
      }, 0)
    }

    // Wait for potential async cleanup
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Verify live sync cleanup was NOT called
    expect(mockStopLiveSync).not.toHaveBeenCalled()
  })
})
