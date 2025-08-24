/**
 * Tests for Sync Engine Service
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { SyncEngineService, SyncEngineConfig } from "../sync-engine.service"
import { FileWatcherImpl } from "../file-watcher.service"
import { SpecDiffEngine } from "~/helpers/live-spec-source/spec-diff-engine"

// Mock dependencies
vi.mock("../file-watcher.service")
vi.mock("~/helpers/live-spec-source/spec-diff-engine")
vi.mock("~/helpers/live-spec-source/framework-detection")
vi.mock("~/newstore/collections")

const mockFileWatcher = {
  on: vi.fn(),
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
  destroy: vi.fn(),
}

const mockDiffEngine = {
  compareSpecs: vi.fn(),
  generateSpecHash: vi.fn(),
}

const mockFrameworkDetection = {
  detectFrameworkComprehensive: vi.fn(),
}

const mockCollections = {
  createCodeFirstCollection: vi.fn(),
  updateCollectionSyncStatus: vi.fn(),
  findCollectionBySourceId: vi.fn(),
  isLiveSyncCollection: vi.fn(),
}

// Mock fetch globally
global.fetch = vi.fn()

describe("SyncEngineService", () => {
  let syncEngine: SyncEngineService
  let config: SyncEngineConfig

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mocks
    vi.mocked(FileWatcherImpl).mockImplementation(() => mockFileWatcher as any)
    vi.mocked(SpecDiffEngine).mockImplementation(() => mockDiffEngine as any)

    config = {
      autoSync: true,
      conflictResolution: "prompt",
      debounceMs: 100,
      maxRetries: 2,
    }

    syncEngine = new SyncEngineService(config)
  })

  afterEach(() => {
    syncEngine.destroy()
  })

  describe("constructor", () => {
    it("should initialize with default config", () => {
      const defaultEngine = new SyncEngineService()
      expect(defaultEngine).toBeDefined()
    })

    it("should merge provided config with defaults", () => {
      const customConfig = { autoSync: false, debounceMs: 1000 }
      const customEngine = new SyncEngineService(customConfig)
      expect(customEngine).toBeDefined()
    })

    it("should set up file watcher events", () => {
      expect(mockFileWatcher.on).toHaveBeenCalledWith(
        "fileChanged",
        expect.any(Function)
      )
    })
  })

  describe("startWatching", () => {
    const sourceConfig = {
      sourceId: "test-source",
      type: "url" as const,
      path: "http://localhost:3000/openapi.json",
      collectionName: "Test API",
    }

    beforeEach(() => {
      mockDiffEngine.generateSpecHash.mockReturnValue("spec-hash-123")
      mockFrameworkDetection.detectFrameworkComprehensive.mockResolvedValue({
        frameworks: [{ name: "fastapi", confidence: 0.9 }],
      })
    })

    it("should successfully start watching a new source", async () => {
      const mockSpec = {
        info: { title: "Test API", version: "1.0.0" },
        paths: {},
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSpec),
      } as Response)

      mockCollections.findCollectionBySourceId.mockReturnValue(null)

      const result = await syncEngine.startWatching(sourceConfig)

      expect(result.success).toBe(true)
      expect(result.collectionId).toBe("test-source")
      expect(mockCollections.createCodeFirstCollection).toHaveBeenCalled()
    })

    it("should handle fetch errors gracefully", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response)

      const result = await syncEngine.startWatching(sourceConfig)

      expect(result.success).toBe(false)
      expect(result.errors).toContain(
        "Failed to fetch initial spec from http://localhost:3000/openapi.json"
      )
    })

    it("should sync existing collection when found", async () => {
      const mockSpec = { info: { title: "Test API" }, paths: {} }
      const existingCollection = {
        liveMetadata: { sourceId: "test-source" },
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSpec),
      } as Response)

      mockCollections.findCollectionBySourceId.mockReturnValue(
        existingCollection
      )
      mockDiffEngine.compareSpecs.mockResolvedValue({
        hasChanges: false,
        changes: [],
        summary: {
          added: 0,
          modified: 0,
          removed: 0,
          breaking: 0,
          nonBreaking: 0,
        },
        oldSpecHash: "old-hash",
        newSpecHash: "new-hash",
        comparedAt: new Date(),
      })

      const result = await syncEngine.startWatching(sourceConfig)

      expect(result.success).toBe(true)
      expect(mockDiffEngine.compareSpecs).toHaveBeenCalled()
    })

    it("should detect framework when not provided", async () => {
      const mockSpec = { info: { title: "Test API" }, paths: {} }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSpec),
      } as Response)

      mockCollections.findCollectionBySourceId.mockReturnValue(null)

      await syncEngine.startWatching({
        ...sourceConfig,
        framework: undefined,
      })

      expect(
        mockFrameworkDetection.detectFrameworkComprehensive
      ).toHaveBeenCalledWith({
        url: sourceConfig.path,
      })
    })
  })

  describe("stopWatching", () => {
    it("should stop watching a source with file path", async () => {
      const collection = {
        liveMetadata: { filePath: "/path/to/spec.json" },
      }

      mockCollections.findCollectionBySourceId.mockReturnValue(collection)

      await syncEngine.stopWatching("test-source")

      expect(mockFileWatcher.unwatchFile).toHaveBeenCalledWith(
        "/path/to/spec.json"
      )
    })

    it("should handle missing collection gracefully", async () => {
      mockCollections.findCollectionBySourceId.mockReturnValue(null)

      await expect(
        syncEngine.stopWatching("nonexistent-source")
      ).resolves.not.toThrow()
    })
  })

  describe("triggerSync", () => {
    it("should prevent concurrent syncs for the same source", async () => {
      const collection = {
        liveMetadata: {
          sourceId: "test-source",
          sourceUrl: "http://localhost:3000/openapi.json",
        },
      }

      mockCollections.findCollectionBySourceId.mockReturnValue(collection)
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ info: { title: "Test" }, paths: {} }),
      } as Response)

      mockDiffEngine.compareSpecs.mockResolvedValue({
        hasChanges: false,
        changes: [],
        summary: {
          added: 0,
          modified: 0,
          removed: 0,
          breaking: 0,
          nonBreaking: 0,
        },
        oldSpecHash: "hash",
        newSpecHash: "hash",
        comparedAt: new Date(),
      })

      // Start two concurrent syncs
      const sync1 = syncEngine.triggerSync("test-source")
      const sync2 = syncEngine.triggerSync("test-source")

      const [result1, result2] = await Promise.all([sync1, sync2])

      // Both should succeed and be the same result (second one waits for first)
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
    })

    it("should handle collection not found", async () => {
      mockCollections.findCollectionBySourceId.mockReturnValue(null)

      const result = await syncEngine.triggerSync("nonexistent-source")

      expect(result.success).toBe(false)
      expect(result.errors).toContain("Collection not found")
    })
  })

  describe("file watcher integration", () => {
    it("should trigger sync when file changes (with debouncing)", async () => {
      // Get the file change handler
      const fileChangeHandler = mockFileWatcher.on.mock.calls.find(
        (call) => call[0] === "fileChanged"
      )?.[1]

      expect(fileChangeHandler).toBeDefined()

      // Mock finding collection by file path
      const mockFindByFilePath = vi.spyOn(
        syncEngine as any,
        "findCollectionByFilePath"
      )
      mockFindByFilePath.mockReturnValue({
        liveMetadata: { sourceId: "test-source" },
      })

      // Mock triggerSync
      const mockTriggerSync = vi.spyOn(syncEngine, "triggerSync")
      mockTriggerSync.mockResolvedValue({ success: true })

      // Simulate file change
      fileChangeHandler({ filePath: "/path/to/spec.json" })

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(mockTriggerSync).toHaveBeenCalledWith("test-source")
    })

    it("should not trigger sync when autoSync is disabled", async () => {
      const noAutoSyncEngine = new SyncEngineService({ autoSync: false })

      const fileChangeHandler = mockFileWatcher.on.mock.calls.find(
        (call) => call[0] === "fileChanged"
      )?.[1]

      const mockTriggerSync = vi.spyOn(noAutoSyncEngine, "triggerSync")

      // Simulate file change
      fileChangeHandler({ filePath: "/path/to/spec.json" })

      // Wait for potential debounce
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(mockTriggerSync).not.toHaveBeenCalled()

      noAutoSyncEngine.destroy()
    })
  })

  describe("destroy", () => {
    it("should clean up file watcher", () => {
      syncEngine.destroy()
      expect(mockFileWatcher.destroy).toHaveBeenCalled()
    })
  })
})
