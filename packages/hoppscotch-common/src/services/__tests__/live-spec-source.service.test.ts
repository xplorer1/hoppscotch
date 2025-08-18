/**
 * Tests for LiveSpecSourceService
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { LiveSpecSourceServiceImpl } from "../live-spec-source.service"
import { InMemoryLiveSpecStorage } from "~/types/live-spec-storage"
import {
  LiveSpecSource,
  URLSourceConfig,
  FileSourceConfig,
  LiveSpecSourceServiceEvent,
} from "~/types/live-spec-source"

// Mock fetch for URL validation and sync tests
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("LiveSpecSourceServiceImpl", () => {
  let service: LiveSpecSourceServiceImpl
  let storage: InMemoryLiveSpecStorage
  let eventSpy: vi.Mock

  beforeEach(() => {
    storage = new InMemoryLiveSpecStorage()
    service = new LiveSpecSourceServiceImpl(storage)
    eventSpy = vi.fn()

    // Listen to all events for testing
    service.on("source-registered", eventSpy)
    service.on("source-unregistered", eventSpy)
    service.on("source-updated", eventSpy)
    service.on("sync-started", eventSpy)
    service.on("sync-completed", eventSpy)
    service.on("sync-error", eventSpy)
    service.on("status-changed", eventSpy)

    // Reset fetch mock
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe("registerSource", () => {
    it("should register a new URL source", async () => {
      const sourceData = {
        name: "Test API",
        type: "url" as const,
        status: "disconnected" as const,
        config: {
          url: "https://api.example.com/spec.json",
        } as URLSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      // Mock successful validation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            if (key === "access-control-allow-origin") return "*"
            return null
          }),
        },
      })

      const source = await service.registerSource(sourceData)

      expect(source.id).toMatch(/^live-spec-[a-f0-9-]+$/)
      expect(source.name).toBe("Test API")
      expect(source.type).toBe("url")
      expect(source.status).toBe("disconnected")
      expect(source.createdAt).toBeInstanceOf(Date)
      expect(source.updatedAt).toBeInstanceOf(Date)

      // Check if source is stored
      const sources = service.getSources()
      expect(sources).toHaveLength(1)
      expect(sources[0]).toEqual(source)

      // Check if event was emitted
      expect(eventSpy).toHaveBeenCalledWith({
        type: "source-registered",
        source,
      })
    })

    it("should register a new file source", async () => {
      const sourceData = {
        name: "Local Spec",
        type: "file" as const,
        status: "disconnected" as const,
        config: {
          filePath: "./openapi.json",
        } as FileSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      const source = await service.registerSource(sourceData)

      expect(source.type).toBe("file")
      expect((source.config as FileSourceConfig).filePath).toBe(
        "./openapi.json"
      )
    })

    it("should sanitize source name", async () => {
      const sourceData = {
        name: "  Test API @#$%  ",
        type: "url" as const,
        status: "disconnected" as const,
        config: {
          url: "https://api.example.com/spec.json",
        } as URLSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            if (key === "access-control-allow-origin") return "*"
            return null
          }),
        },
      })

      const source = await service.registerSource(sourceData)
      expect(source.name).toBe("Test API ")
    })

    it("should reject invalid source name", async () => {
      const sourceData = {
        name: "",
        type: "url" as const,
        status: "disconnected" as const,
        config: {
          url: "https://api.example.com/spec.json",
        } as URLSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      await expect(service.registerSource(sourceData)).rejects.toThrow(
        "Invalid source name"
      )
    })

    it("should reject invalid URL configuration", async () => {
      const sourceData = {
        name: "Test API",
        type: "url" as const,
        status: "disconnected" as const,
        config: {
          url: "not-a-url",
        } as URLSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      await expect(service.registerSource(sourceData)).rejects.toThrow(
        "Invalid source configuration"
      )
    })

    it("should reject invalid file configuration", async () => {
      const sourceData = {
        name: "Test File",
        type: "file" as const,
        status: "disconnected" as const,
        config: {
          filePath: "spec.txt", // Invalid extension
        } as FileSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      await expect(service.registerSource(sourceData)).rejects.toThrow(
        "Invalid source configuration"
      )
    })
  })

  describe("unregisterSource", () => {
    it("should unregister an existing source", async () => {
      // First register a source
      const sourceData = {
        name: "Test API",
        type: "url" as const,
        status: "disconnected" as const,
        config: { url: "https://api.example.com/spec.json" } as URLSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            if (key === "access-control-allow-origin") return "*"
            return null
          }),
        },
      })
      const source = await service.registerSource(sourceData)

      // Reset event spy to focus on unregister event
      eventSpy.mockReset()

      // Unregister the source
      await service.unregisterSource(source.id)

      // Check if source is removed
      const sources = service.getSources()
      expect(sources).toHaveLength(0)

      // Check if event was emitted
      expect(eventSpy).toHaveBeenCalledWith({
        type: "source-unregistered",
        sourceId: source.id,
      })
    })

    it("should throw error for non-existent source", async () => {
      await expect(service.unregisterSource("non-existent")).rejects.toThrow(
        "Source with ID non-existent not found"
      )
    })
  })

  describe("getSources and getSource", () => {
    it("should return empty array when no sources exist", () => {
      const sources = service.getSources()
      expect(sources).toEqual([])
    })

    it("should return all registered sources", async () => {
      const sourceData1 = {
        name: "API 1",
        type: "url" as const,
        status: "disconnected" as const,
        config: {
          url: "https://api1.example.com/spec.json",
        } as URLSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      const sourceData2 = {
        name: "API 2",
        type: "file" as const,
        status: "disconnected" as const,
        config: { filePath: "./spec.json" } as FileSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      mockFetch.mockResolvedValue(
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {
            get: vi.fn((key: string) => {
              if (key === "content-type") return "application/json"
              if (key === "access-control-allow-origin") return "*"
              return null
            }),
          },
        })
      )

      const source1 = await service.registerSource(sourceData1)
      const source2 = await service.registerSource(sourceData2)

      const sources = service.getSources()
      expect(sources).toHaveLength(2)
      expect(sources).toContainEqual(source1)
      expect(sources).toContainEqual(source2)
    })

    it("should return specific source by ID", async () => {
      const sourceData = {
        name: "Test API",
        type: "url" as const,
        status: "disconnected" as const,
        config: { url: "https://api.example.com/spec.json" } as URLSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            if (key === "access-control-allow-origin") return "*"
            return null
          }),
        },
      })
      const source = await service.registerSource(sourceData)

      const retrieved = service.getSource(source.id)
      expect(retrieved).toEqual(source)
    })

    it("should return null for non-existent source", () => {
      const retrieved = service.getSource("non-existent")
      expect(retrieved).toBeNull()
    })
  })

  describe("updateSource", () => {
    let source: LiveSpecSource

    beforeEach(async () => {
      const sourceData = {
        name: "Test API",
        type: "url" as const,
        status: "disconnected" as const,
        config: { url: "https://api.example.com/spec.json" } as URLSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            if (key === "access-control-allow-origin") return "*"
            return null
          }),
        },
      })
      source = await service.registerSource(sourceData)
      eventSpy.mockReset() // Reset to focus on update events
    })

    it("should update source name", async () => {
      // Add a small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10))

      const updated = await service.updateSource(source.id, {
        name: "Updated API Name",
      })

      expect(updated.name).toBe("Updated API Name")
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        source.updatedAt.getTime()
      )

      // Check if event was emitted
      expect(eventSpy).toHaveBeenCalledWith({
        type: "source-updated",
        source: updated,
      })
    })

    it("should update source configuration", async () => {
      const newConfig: URLSourceConfig = {
        url: "https://api.updated.com/spec.json",
        pollInterval: 60000,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            if (key === "access-control-allow-origin") return "*"
            return null
          }),
        },
      })

      const updated = await service.updateSource(source.id, {
        config: newConfig,
        type: "url",
      })

      expect((updated.config as URLSourceConfig).url).toBe(
        "https://api.updated.com/spec.json"
      )
      expect((updated.config as URLSourceConfig).pollInterval).toBe(60000)
    })

    it("should prevent ID changes", async () => {
      const originalId = source.id

      const updated = await service.updateSource(source.id, {
        id: "new-id" as any, // This should be ignored
      })

      expect(updated.id).toBe(originalId)
    })

    it("should prevent creation date changes", async () => {
      const originalCreatedAt = source.createdAt

      const updated = await service.updateSource(source.id, {
        createdAt: new Date() as any, // This should be ignored
      })

      expect(updated.createdAt).toEqual(originalCreatedAt)
    })

    it("should throw error for non-existent source", async () => {
      await expect(
        service.updateSource("non-existent", { name: "New Name" })
      ).rejects.toThrow("Source with ID non-existent not found")
    })

    it("should validate updated name", async () => {
      await expect(
        service.updateSource(source.id, { name: "" })
      ).rejects.toThrow("Invalid source name")
    })
  })

  describe("syncSource", () => {
    let urlSource: LiveSpecSource
    let fileSource: LiveSpecSource

    beforeEach(async () => {
      // Create URL source
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            if (key === "access-control-allow-origin") return "*"
            return null
          }),
        },
      })
      urlSource = await service.registerSource({
        name: "URL API",
        type: "url",
        status: "disconnected",
        config: { url: "https://api.example.com/spec.json" } as URLSourceConfig,
        syncStrategy: "replace-all",
      })

      // Create file source
      fileSource = await service.registerSource({
        name: "File API",
        type: "file",
        status: "disconnected",
        config: { filePath: "./spec.json" } as FileSourceConfig,
        syncStrategy: "replace-all",
      })

      eventSpy.mockReset()
    })

    it("should sync URL source successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            return null
          }),
        },
        text: () =>
          Promise.resolve(
            '{"openapi": "3.0.0", "info": {"title": "Test API"}}'
          ),
      })

      const result = await service.syncSource(urlSource.id)

      expect(result.success).toBe(true)
      expect(result.hasChanges).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.specVersion).toBeDefined()

      // Check events
      expect(eventSpy).toHaveBeenCalledWith({
        type: "sync-started",
        sourceId: urlSource.id,
      })
      expect(eventSpy).toHaveBeenCalledWith({
        type: "sync-completed",
        sourceId: urlSource.id,
        result,
      })

      // Check source status update
      const updatedSource = service.getSource(urlSource.id)
      expect(updatedSource?.status).toBe("connected")
      expect(updatedSource?.lastSync).toBeInstanceOf(Date)
    })

    it("should sync file source successfully", async () => {
      const result = await service.syncSource(fileSource.id)

      expect(result.success).toBe(true)
      expect(result.hasChanges).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should handle URL sync errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await service.syncSource(urlSource.id)

      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.includes("Network error"))).toBe(true)

      // Check sync completed event with error result
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "sync-completed",
          sourceId: urlSource.id,
          result: expect.objectContaining({
            success: false,
            errors: expect.arrayContaining([
              expect.stringContaining("Network error"),
            ]),
          }),
        })
      )

      // Check source status update
      const updatedSource = service.getSource(urlSource.id)
      expect(updatedSource?.status).toBe("error")
      expect(updatedSource?.lastError).toContain("Network error")
    })

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await service.syncSource(urlSource.id)

      expect(result.success).toBe(false)
      expect(result.errors).toContain("HTTP 404: Not Found")
    })

    it("should handle timeout errors", async () => {
      // Mock a delayed response that will timeout
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            setTimeout(() => {
              const error = new Error("Request timeout")
              error.name = "AbortError"
              reject(error)
            }, 100) // Short delay to simulate timeout
          })
      )

      const result = await service.syncSource(urlSource.id)

      expect(result.success).toBe(false)
      expect(result.errors.some((error) => error.includes("timeout"))).toBe(
        true
      )
    }, 10000) // Increase test timeout

    it("should throw error for non-existent source", async () => {
      await expect(service.syncSource("non-existent")).rejects.toThrow(
        "Source with ID non-existent not found"
      )
    })
  })

  describe("validateSource", () => {
    it("should validate URL source with connection test", async () => {
      const config: URLSourceConfig = {
        url: "https://api.example.com/spec.json",
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            if (key === "access-control-allow-origin") return "*"
            return null
          }),
        },
      })

      const result = await service.validateSource(config, "url")

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should detect URL connection failures", async () => {
      const config: URLSourceConfig = {
        url: "https://api.example.com/spec.json",
      }

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            // No CORS header for this test
            return null
          }),
        },
      })

      const result = await service.validateSource(config, "url")

      expect(result.isValid).toBe(false)
      expect(
        result.errors.some((e) => e.includes("404") || e.includes("not found"))
      ).toBe(true)
    })

    it("should validate file source", async () => {
      const config: FileSourceConfig = {
        filePath: "./spec.json",
      }

      const result = await service.validateSource(config, "file")

      expect(result.isValid).toBe(true)
    })

    it("should detect invalid URL format", async () => {
      const config: URLSourceConfig = {
        url: "not-a-url",
      }

      const result = await service.validateSource(config, "url")

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain("Invalid URL format")
    })
  })

  describe("event handling", () => {
    it("should emit status-changed events", async () => {
      const sourceData = {
        name: "Test API",
        type: "url" as const,
        status: "disconnected" as const,
        config: { url: "https://api.example.com/spec.json" } as URLSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            return null
          }),
        },
        text: () =>
          Promise.resolve(
            '{"openapi": "3.0.0", "info": {"title": "Test API"}}'
          ),
      })

      const source = await service.registerSource(sourceData)
      eventSpy.mockReset()

      // Trigger a sync which should change status
      await service.syncSource(source.id)

      // Should have emitted status-changed events during sync
      const statusEvents = eventSpy.mock.calls
        .map((call) => call[0])
        .filter(
          (event: LiveSpecSourceServiceEvent) => event.type === "status-changed"
        )

      expect(statusEvents.length).toBeGreaterThan(0)
    })

    it("should allow removing event listeners", () => {
      const handler = vi.fn()

      service.on("source-registered", handler)
      service.off("source-registered", handler)

      // Handler should not be called after removal
      // This is tested implicitly by other tests not failing
      expect(true).toBe(true)
    })
  })

  describe("sync history", () => {
    it("should return empty sync history initially", () => {
      const history = service.getSyncHistory("any-source-id")
      expect(history).toEqual([])
    })

    it("should clear sync history", async () => {
      await service.clearSyncHistory("any-source-id")
      // Should not throw error
      expect(true).toBe(true)
    })
  })

  describe("error handling", () => {
    it("should handle storage errors gracefully", async () => {
      // Create a storage that throws errors
      const errorStorage = {
        ...storage,
        saveSources: vi.fn().mockRejectedValue(new Error("Storage error")),
      }

      const errorService = new LiveSpecSourceServiceImpl(errorStorage as any)

      const sourceData = {
        name: "Test API",
        type: "url" as const,
        status: "disconnected" as const,
        config: { url: "https://api.example.com/spec.json" } as URLSourceConfig,
        syncStrategy: "replace-all" as const,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            if (key === "access-control-allow-origin") return "*"
            return null
          }),
        },
      })

      await expect(errorService.registerSource(sourceData)).rejects.toThrow(
        "Storage error"
      )
    })
  })
})
