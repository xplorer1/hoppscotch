/**
 * Test for the summary update bug fix in combined changes
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { SyncEngineService } from "../sync-engine.service"
import { SpecDiffEngine } from "~/helpers/live-spec-source/spec-diff-engine"

// Mock the collections store
vi.mock("~/newstore/collections", () => ({
  restCollectionStore: {
    value: {
      state: []
    }
  },
  editRESTRequest: vi.fn(),
  findCollectionBySourceId: vi.fn(),
}))

describe("Summary Update Bug Fix", () => {
  let syncEngine: SyncEngineService
  let diffEngine: SpecDiffEngine

  beforeEach(() => {
    vi.clearAllMocks()
    syncEngine = new SyncEngineService()
    diffEngine = new SpecDiffEngine()
  })

  it("should detect URL + method + summary changes correctly", async () => {
    const oldSpec = {
      paths: {
        "/transactions": {
          get: {
            summary: "Old Summary"
          }
        }
      }
    }

    const newSpec = {
      paths: {
        "/account-transactions": {  // URL changed
          post: {                   // Method changed
            summary: "New Summary"  // Summary changed
          }
        }
      }
    }

    const result = await diffEngine.compareSpecs(oldSpec, newSpec)
    
    // Should detect changes
    expect(result.hasChanges).toBe(true)
    expect(result.changes.length).toBeGreaterThan(0)

    // Should have removal and addition
    const removal = result.changes.find(c => c.type === "endpoint-removed")
    const addition = result.changes.find(c => c.type === "endpoint-added")
    
    expect(removal).toBeDefined()
    expect(addition).toBeDefined()
    
    // Both should have auto-generated operationId based on summary
    expect(removal?.oldValue?.operationId).toBe("oldSummary")
    expect(addition?.newValue?.operationId).toBe("newSummary")
  })

  it("should detect URL + summary changes with same method", async () => {
    const oldSpec = {
      paths: {
        "/transactions": {
          get: {
            summary: "Get Transactions"
          }
        }
      }
    }

    const newSpec = {
      paths: {
        "/account-transactions": {  // URL changed
          get: {                    // Method same
            summary: "Get Account Transactions"  // Summary changed
          }
        }
      }
    }

    const result = await diffEngine.compareSpecs(oldSpec, newSpec)
    
    // Should detect changes
    expect(result.hasChanges).toBe(true)
    
    // Should have removal and addition with different operationIds
    const removal = result.changes.find(c => c.type === "endpoint-removed")
    const addition = result.changes.find(c => c.type === "endpoint-added")
    
    expect(removal?.oldValue?.operationId).toBe("getTransactions")
    expect(addition?.newValue?.operationId).toBe("getAccountTransactions")
  })

  it("should detect method + summary changes with same URL", async () => {
    const oldSpec = {
      paths: {
        "/transactions": {
          get: {
            summary: "Get Transactions"
          }
        }
      }
    }

    const newSpec = {
      paths: {
        "/transactions": {         // URL same
          post: {                  // Method changed
            summary: "Create Transaction"  // Summary changed
          }
        }
      }
    }

    const result = await diffEngine.compareSpecs(oldSpec, newSpec)
    
    // Should detect changes
    expect(result.hasChanges).toBe(true)
    
    // Should have removal and addition with different operationIds
    const removal = result.changes.find(c => c.type === "endpoint-removed")
    const addition = result.changes.find(c => c.type === "endpoint-added")
    
    expect(removal?.oldValue?.operationId).toBe("getTransactions")
    expect(addition?.newValue?.operationId).toBe("createTransaction")
  })

  it("should preserve same operationId when only summary changes", async () => {
    const oldSpec = {
      paths: {
        "/transactions": {
          get: {
            summary: "Old Summary",
            operationId: "getTransactions"  // Explicit operationId
          }
        }
      }
    }

    const newSpec = {
      paths: {
        "/transactions": {
          get: {
            summary: "New Summary",        // Summary changed
            operationId: "getTransactions" // Same operationId
          }
        }
      }
    }

    const result = await diffEngine.compareSpecs(oldSpec, newSpec)
    
    // Should detect summary change
    expect(result.hasChanges).toBe(true)
    
    // Should be detected as endpoint-modified, not removal+addition
    const modification = result.changes.find(c => c.type === "endpoint-modified")
    expect(modification).toBeDefined()
    expect(modification?.description).toContain("Summary changed")
  })
})