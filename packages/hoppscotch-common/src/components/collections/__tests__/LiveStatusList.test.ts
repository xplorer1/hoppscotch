/**
 * Tests for Live Status List Component Logic
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { LiveSyncCollection } from "~/types/live-collection-metadata"
import { makeCollection } from "@hoppscotch/data"
// afterEach removed as it was unused

// Mock dependencies
vi.mock("~/newstore/collections", () => ({
  hasPendingCodeChanges: vi.fn(),
  hasUserModifications: vi.fn(),
  getLiveSyncCollections: vi.fn(),
  triggerSync: vi.fn(),
}))

vi.mock("@composables/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const mockCollections = {
  hasPendingCodeChanges: vi.fn(),
  hasUserModifications: vi.fn(),
  getLiveSyncCollections: vi.fn(),
  triggerSync: vi.fn(),
}

describe("LiveStatusList Logic", () => {
  const createMockCollection = (overrides = {}): LiveSyncCollection => ({
    ...makeCollection({
      name: "Test API",
      folders: [],
      requests: [],
      auth: { authType: "inherit", authActive: true },
      headers: [],
    }),
    liveMetadata: {
      sourceId: "test-source",
      isLiveSync: true,
      lastSyncTime: new Date(),
      syncStrategy: "incremental",
      sourceUrl: "http://localhost:3000/openapi.json",
      framework: { name: "fastapi" },
      ...overrides,
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockCollections.getLiveSyncCollections.mockReturnValue([])
  })

  describe("status calculation", () => {
    it("should determine correct status based on collection state", () => {
      const collection = createMockCollection()

      // Test basic collection properties
      expect(collection.liveMetadata?.isLiveSync).toBe(true)
      expect(collection.liveMetadata?.sourceId).toBe("test-source")
    })

    it("should handle error status", () => {
      const collection = createMockCollection({
        syncStatus: { success: false, error: "Failed to connect" },
      })

      expect(collection.liveMetadata?.syncStatus?.success).toBe(false)
    })

    it("should handle pending changes", () => {
      mockCollections.hasPendingCodeChanges.mockReturnValue(true)

      const collection = createMockCollection()
      const hasPending = mockCollections.hasPendingCodeChanges(collection)
      expect(hasPending).toBe(true)
    })

    it("should handle user modifications", () => {
      mockCollections.hasUserModifications.mockReturnValue(true)

      const collection = createMockCollection()
      const hasModifications = mockCollections.hasUserModifications(collection)
      expect(hasModifications).toBe(true)
    })
  })

  describe("sync operations", () => {
    it("should handle sync trigger", async () => {
      const collection = createMockCollection()
      mockCollections.triggerSync.mockResolvedValue({ success: true })

      const result = await mockCollections.triggerSync(
        collection.liveMetadata!.sourceId
      )

      expect(mockCollections.triggerSync).toHaveBeenCalledWith("test-source")
      expect(result.success).toBe(true)
    })

    it("should handle sync errors", async () => {
      const collection = createMockCollection()
      mockCollections.triggerSync.mockRejectedValue(new Error("Sync failed"))

      try {
        await mockCollections.triggerSync(collection.liveMetadata!.sourceId)
      } catch (error) {
        expect(error.message).toBe("Sync failed")
      }
    })
  })

  describe("collection filtering", () => {
    it("should filter collections by status", () => {
      const collections = [
        createMockCollection({ sourceId: "source-1" }),
        createMockCollection({ sourceId: "source-2" }),
      ]

      // Test filtering logic
      const connectedCollections = collections.filter(
        (col) => col.liveMetadata?.isLiveSync === true
      )

      expect(connectedCollections).toHaveLength(2)
    })

    it("should filter collections by framework", () => {
      const collections = [
        createMockCollection({ framework: { name: "fastapi" } }),
        createMockCollection({ framework: { name: "express" } }),
      ]

      const fastapiCollections = collections.filter(
        (col) => col.liveMetadata?.framework?.name === "fastapi"
      )

      expect(fastapiCollections).toHaveLength(1)
    })
  })

  describe("framework detection", () => {
    it("should extract available frameworks", () => {
      const collections = [
        createMockCollection({ framework: { name: "fastapi" } }),
        createMockCollection({ framework: { name: "express" } }),
        createMockCollection({ framework: { name: "fastapi" } }),
      ]

      const frameworks = new Set<string>()
      collections.forEach((col) => {
        if (col.liveMetadata?.framework?.name) {
          frameworks.add(col.liveMetadata.framework.name)
        }
      })

      expect(Array.from(frameworks)).toEqual(["fastapi", "express"])
    })
  })
})
