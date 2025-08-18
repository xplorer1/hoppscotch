/**
 * Integration tests for LiveSpecSourceService
 *
 * These tests demonstrate the complete workflow of registering sources,
 * syncing specifications, and managing the lifecycle of live sources.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { LiveSpecSourceServiceImpl } from "../live-spec-source.service"
import { InMemoryLiveSpecStorage } from "~/types/live-spec-storage"
import { URLSourceConfig, FileSourceConfig } from "~/types/live-spec-source"

// Mock fetch for integration tests
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("LiveSpecSourceService Integration", () => {
  let service: LiveSpecSourceServiceImpl
  let storage: InMemoryLiveSpecStorage

  beforeEach(() => {
    storage = new InMemoryLiveSpecStorage()
    service = new LiveSpecSourceServiceImpl(storage)
    mockFetch.mockReset()
  })

  it("should complete a full FastAPI integration workflow", async () => {
    // Step 1: Register a FastAPI source
    const fastapiConfig: URLSourceConfig = {
      url: "http://localhost:8000/openapi.json",
      pollInterval: 30000,
      timeout: 10000,
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

    const source = await service.registerSource({
      name: "My FastAPI Service",
      type: "url",
      status: "disconnected",
      config: fastapiConfig,
      syncStrategy: "replace-all",
    })

    expect(source.name).toBe("My FastAPI Service")
    expect(source.type).toBe("url")
    expect(source.status).toBe("disconnected")

    // Step 2: Validate the source configuration
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

    const validation = await service.validateSource(fastapiConfig, "url")
    expect(validation.isValid).toBe(true)

    // Step 3: Perform initial sync
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
          JSON.stringify({
            openapi: "3.0.0",
            info: { title: "FastAPI", version: "0.1.0" },
            paths: {
              "/users": {
                get: {
                  summary: "Get users",
                  responses: { "200": { description: "Success" } },
                },
              },
            },
          })
        ),
    })

    const syncResult = await service.syncSource(source.id)

    expect(syncResult.success).toBe(true)
    expect(syncResult.hasChanges).toBe(true)
    expect(syncResult.changesSummary).toContain(
      "Specification updated from URL"
    )

    // Step 4: Verify source status updated
    const updatedSource = service.getSource(source.id)
    expect(updatedSource?.status).toBe("connected")
    expect(updatedSource?.lastSync).toBeInstanceOf(Date)

    // Step 5: Get framework-specific guidance
    const guidance = service.getFrameworkGuidance(
      source.id,
      "Connection failed"
    )
    expect(guidance.some((g) => g.includes("port 8000"))).toBe(true)
    expect(guidance.some((g) => g.includes("FastAPI"))).toBe(true)
  })

  it("should handle Express.js workflow with error recovery", async () => {
    // Step 1: Register Express source
    const expressConfig: URLSourceConfig = {
      url: "http://localhost:3000/api-docs.json",
      headers: { Authorization: "Bearer dev-token" },
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

    const source = await service.registerSource({
      name: "Express API",
      type: "url",
      status: "disconnected",
      config: expressConfig,
      syncStrategy: "replace-all",
    })

    // Step 2: Simulate sync failure
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"))

    const failedSync = await service.syncSource(source.id)

    expect(failedSync.success).toBe(false)
    expect(failedSync.errors.some((e) => e.includes("Network error"))).toBe(
      true
    )

    // Verify source status shows error
    const errorSource = service.getSource(source.id)
    expect(errorSource?.status).toBe("error")
    expect(errorSource?.lastError).toContain("Network error")

    // Step 3: Simulate recovery with successful sync
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
          JSON.stringify({
            openapi: "3.0.0",
            info: { title: "Express API", version: "1.0.0" },
            paths: {
              "/api/health": {
                get: {
                  summary: "Health check",
                  responses: { "200": { description: "OK" } },
                },
              },
            },
          })
        ),
    })

    const recoveredSync = await service.syncSource(source.id)

    expect(recoveredSync.success).toBe(true)

    // Verify source recovered
    const recoveredSource = service.getSource(source.id)
    expect(recoveredSource?.status).toBe("connected")
    expect(recoveredSource?.lastError).toBeUndefined()
  })

  it("should manage multiple sources simultaneously", async () => {
    // Register multiple sources
    const sources = []

    // FastAPI source
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
    sources.push(
      await service.registerSource({
        name: "FastAPI Service",
        type: "url",
        status: "disconnected",
        config: { url: "http://localhost:8000/openapi.json" },
        syncStrategy: "replace-all",
      })
    )

    // Spring Boot source
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
    sources.push(
      await service.registerSource({
        name: "Spring Boot API",
        type: "url",
        status: "disconnected",
        config: { url: "http://localhost:8080/v3/api-docs" },
        syncStrategy: "replace-all",
      })
    )

    // File-based source
    sources.push(
      await service.registerSource({
        name: "Local OpenAPI Spec",
        type: "file",
        status: "disconnected",
        config: { filePath: "./api/openapi.json" },
        syncStrategy: "replace-all",
      })
    )

    // Verify all sources are registered
    const allSources = service.getSources()
    expect(allSources).toHaveLength(3)

    // Sync all sources
    const syncPromises = sources.map((source) => {
      if (source.type === "url") {
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
      }
      return service.syncSource(source.id)
    })

    const syncResults = await Promise.all(syncPromises)

    // All syncs should succeed
    syncResults.forEach((result) => {
      expect(result.success).toBe(true)
    })

    // Verify all sources are connected
    const connectedSources = service.getSources()
    connectedSources.forEach((source) => {
      expect(source.status).toBe("connected")
    })
  })

  it("should handle source lifecycle management", async () => {
    // Create source
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

    const source = await service.registerSource({
      name: "Test API",
      type: "url",
      status: "disconnected",
      config: { url: "http://localhost:3000/spec.json" },
      syncStrategy: "replace-all",
    })

    expect(service.getSources()).toHaveLength(1)

    // Update source
    const updatedSource = await service.updateSource(source.id, {
      name: "Updated Test API",
      config: {
        url: "http://localhost:3001/spec.json",
        pollInterval: 60000,
      },
    })

    expect(updatedSource.name).toBe("Updated Test API")
    expect((updatedSource.config as URLSourceConfig).url).toBe(
      "http://localhost:3001/spec.json"
    )

    // Unregister source
    await service.unregisterSource(source.id)

    expect(service.getSources()).toHaveLength(0)
    expect(service.getSource(source.id)).toBeNull()
  })

  it("should persist sources across service instances", async () => {
    // Create source with first service instance
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

    const source = await service.registerSource({
      name: "Persistent API",
      type: "url",
      status: "disconnected",
      config: { url: "http://localhost:4000/spec.json" },
      syncStrategy: "replace-all",
    })

    // Create new service instance with same storage
    const newService = new LiveSpecSourceServiceImpl(storage)

    // Wait for sources to load
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Verify source persisted
    const persistedSources = newService.getSources()
    expect(persistedSources).toHaveLength(1)
    expect(persistedSources[0].name).toBe("Persistent API")
    expect(persistedSources[0].id).toBe(source.id)
  })

  it("should handle file-based source workflow", async () => {
    const fileConfig: FileSourceConfig = {
      filePath: "./fastapi_app/openapi.json",
      watchEnabled: true,
    }

    // Register file source
    const source = await service.registerSource({
      name: "FastAPI File Source",
      type: "file",
      status: "disconnected",
      config: fileConfig,
      syncStrategy: "replace-all",
    })

    expect(source.type).toBe("file")

    // Validate file source
    const validation = await service.validateSource(fileConfig, "file")
    expect(validation.isValid).toBe(true)

    // Sync file source (simulated)
    const syncResult = await service.syncSource(source.id)

    expect(syncResult.success).toBe(true)
    expect(syncResult.changesSummary).toContain(
      "Specification updated from file"
    )

    // Get framework guidance for file source
    const guidance = service.getFrameworkGuidance(source.id, "File not found")
    expect(
      guidance.some((g) => g.includes("development server is running"))
    ).toBe(true)
  })
})
