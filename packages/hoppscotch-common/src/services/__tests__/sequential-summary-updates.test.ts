/**
 * Test for sequential summary updates to reproduce the user's issue
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { SyncEngineService } from "../sync-engine.service"
import { SpecDiffEngine } from "~/helpers/live-spec-source/spec-diff-engine"

// Mock the collections store
vi.mock("~/newstore/collections", () => ({
  restCollectionStore: {
    value: {
      state: [],
    },
  },
  editRESTRequest: vi.fn(),
  findCollectionBySourceId: vi.fn(),
}))

describe("Sequential Summary Updates", () => {
  let syncEngine: SyncEngineService
  let diffEngine: SpecDiffEngine

  beforeEach(() => {
    vi.clearAllMocks()
    syncEngine = new SyncEngineService()
    diffEngine = new SpecDiffEngine()
  })

  it("should handle multiple sequential summary changes correctly", async () => {
    const sourceId = "test-source"

    // Initial spec
    const initialSpec = {
      paths: {
        "/health-maker": {
          put: {
            summary: "Initial Summary",
          },
        },
      },
    }

    // Store the initial spec
    syncEngine.storeSpec(
      sourceId,
      initialSpec,
      "http://localhost:3001/api/openapi.json"
    )

    // First change: URL + Method + Summary (this should work)
    const firstChangeSpec = {
      paths: {
        "/health-maker": {
          delete: {
            // Method changed from PUT to DELETE
            summary: "First Change Summary", // Summary changed
          },
        },
      },
    }

    const result1 = await diffEngine.compareSpecs(initialSpec, firstChangeSpec)

    expect(result1.hasChanges).toBe(true)
    expect(result1.changes.length).toBeGreaterThan(0)

    // Store the result of first change
    syncEngine.storeSpec(
      sourceId,
      firstChangeSpec,
      "http://localhost:3001/api/openapi.json"
    )

    // Second change: Method + Summary (this is where the issue occurs)
    const secondChangeSpec = {
      paths: {
        "/health-maker": {
          post: {
            // Method changed from DELETE to POST
            summary: "Second Change Summary", // Summary changed
          },
        },
      },
    }

    const result2 = await diffEngine.compareSpecs(
      firstChangeSpec,
      secondChangeSpec
    )

    expect(result2.hasChanges).toBe(true)
    expect(result2.changes.length).toBeGreaterThan(0)

    // Store the result of second change
    syncEngine.storeSpec(
      sourceId,
      secondChangeSpec,
      "http://localhost:3001/api/openapi.json"
    )

    // Third change: Summary only (this should work but user reports it doesn't)
    const thirdChangeSpec = {
      paths: {
        "/health-maker": {
          post: {
            // Method same
            summary: "Third Change Summary", // Only summary changed
          },
        },
      },
    }

    const result3 = await diffEngine.compareSpecs(
      secondChangeSpec,
      thirdChangeSpec
    )

    expect(result3.hasChanges).toBe(true)
    expect(result3.changes.length).toBeGreaterThan(0)

    // Should be detected as endpoint-modified, not removal+addition
    const modification = result3.changes.find(
      (c) => c.type === "endpoint-modified"
    )
    expect(modification).toBeDefined()
    expect(modification?.description).toContain("Summary changed")
  })

  it("should maintain consistent operationIds across changes", async () => {
    // Initial spec
    const initialSpec = {
      paths: {
        "/test-endpoint": {
          get: {
            summary: "Get Test Data",
          },
        },
      },
    }

    // Changed spec (only summary changed)
    const changedSpec = {
      paths: {
        "/test-endpoint": {
          get: {
            summary: "Get Updated Test Data", // Only summary changed
          },
        },
      },
    }

    // Compare the specs to see how operationIds are handled
    const result = await diffEngine.compareSpecs(initialSpec, changedSpec)

    // Should detect the summary change
    expect(result.hasChanges).toBe(true)
    expect(result.changes.length).toBe(1)

    // Should be detected as endpoint-modified, not removal+addition
    const modification = result.changes.find(
      (c) => c.type === "endpoint-modified"
    )
    expect(modification).toBeDefined()
    expect(modification?.description).toContain("Summary changed")
  })
})
