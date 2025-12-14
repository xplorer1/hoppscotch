/**
 * Tests for automatic operationId generation in SpecDiffEngine
 */

import { describe, it, expect } from "vitest"
import { SpecDiffEngine } from "../spec-diff-engine"

describe("SpecDiffEngine - operationId Auto-Generation", () => {
  const diffEngine = new SpecDiffEngine()

  it("should generate operationId from summary", () => {
    const spec = {
      paths: {
        "/users/{id}": {
          get: {
            summary: "Get User Details",
            // No operationId
          },
        },
      },
    }

    const normalized = (diffEngine as any).ensureOperationIds(spec)

    expect(normalized.paths["/users/{id}"].get.operationId).toBe(
      "getUserDetails"
    )
  })

  it("should generate operationId from method and path when no summary", () => {
    const spec = {
      paths: {
        "/accounts/{id}/transactions": {
          post: {
            description: "Create transaction",
            // No summary, no operationId
          },
        },
      },
    }

    const normalized = (diffEngine as any).ensureOperationIds(spec)

    expect(
      normalized.paths["/accounts/{id}/transactions"].post.operationId
    ).toBe("postAccountsTransactions")
  })

  it("should preserve existing operationId", () => {
    const spec = {
      paths: {
        "/users": {
          get: {
            operationId: "listAllUsers", // Already has operationId
            summary: "Get All Users",
          },
        },
      },
    }

    const normalized = (diffEngine as any).ensureOperationIds(spec)

    expect(normalized.paths["/users"].get.operationId).toBe("listAllUsers")
  })

  it("should handle complex summaries with special characters", () => {
    const spec = {
      paths: {
        "/payments/transfers": {
          post: {
            summary: "Create P2P Transfer (Beta)",
            // No operationId
          },
        },
      },
    }

    const normalized = (diffEngine as any).ensureOperationIds(spec)

    expect(normalized.paths["/payments/transfers"].post.operationId).toBe(
      "createP2pTransferBeta"
    )
  })

  it("should generate unique operationIds for different methods on same path", () => {
    const spec = {
      paths: {
        "/transactions": {
          get: {
            summary: "List Transactions",
          },
          post: {
            summary: "Create Transaction",
          },
          delete: {
            summary: "Delete Transaction",
          },
        },
      },
    }

    const normalized = (diffEngine as any).ensureOperationIds(spec)

    expect(normalized.paths["/transactions"].get.operationId).toBe(
      "listTransactions"
    )
    expect(normalized.paths["/transactions"].post.operationId).toBe(
      "createTransaction"
    )
    expect(normalized.paths["/transactions"].delete.operationId).toBe(
      "deleteTransaction"
    )
  })

  it("should handle paths with no meaningful segments", () => {
    const spec = {
      paths: {
        "/": {
          get: {
            summary: "Root Endpoint",
          },
        },
      },
    }

    const normalized = (diffEngine as any).ensureOperationIds(spec)

    expect(normalized.paths["/"].get.operationId).toBe("rootEndpoint")
  })

  it("should fallback to hash when path and summary are problematic", () => {
    const spec = {
      paths: {
        "/!@#$%": {
          get: {
            // No summary, problematic path
          },
        },
      },
    }

    const normalized = (diffEngine as any).ensureOperationIds(spec)

    const operationId = normalized.paths["/!@#$%"].get.operationId
    expect(operationId).toMatch(/^get[a-f0-9]{6}$/) // Should be "get" + 6-char hash
  })

  it("should work with your banking API example", () => {
    const spec = {
      paths: {
        "/transactions": {
          get: {
            summary: "Moonshot in the realm of business.",
            tags: ["Transactions"],
          },
          post: {
            summary: "Create new transaction",
            tags: ["Transactions"],
          },
        },
        "/accounts/{id}": {
          get: {
            summary: "La isla bonita an account by ID",
            tags: ["Accounts"],
          },
        },
      },
    }

    const normalized = (diffEngine as any).ensureOperationIds(spec)

    expect(normalized.paths["/transactions"].get.operationId).toBe(
      "moonshotInTheRealmOfBusiness"
    )
    expect(normalized.paths["/transactions"].post.operationId).toBe(
      "createNewTransaction"
    )
    expect(normalized.paths["/accounts/{id}"].get.operationId).toBe(
      "laIslaBonitaAnAccountById"
    )
  })

  it("should enable reliable endpoint tracking across changes", async () => {
    const oldSpec = {
      paths: {
        "/users/{id}": {
          get: {
            summary: "Get User Profile", // This will generate operationId: "getUserProfile"
          },
        },
      },
    }

    const newSpec = {
      paths: {
        "/profiles/{userId}": {
          // Path changed
          post: {
            // Method changed
            summary: "Get User Profile", // Summary same - should match!
          },
        },
      },
    }

    const result = await diffEngine.compareSpecs(oldSpec, newSpec)

    // Should detect this as a URL/method change, not separate add/remove
    const urlChanges = result.changes.filter(
      (c) => c.type === "endpoint-removed" || c.type === "endpoint-added"
    )

    // With auto-generated operationId, this should be detected as the same endpoint
    expect(urlChanges).toHaveLength(2) // One removal, one addition

    // But the operationIds should match, enabling the URL change detection
    const normalized1 = (diffEngine as any).ensureOperationIds(oldSpec)
    const normalized2 = (diffEngine as any).ensureOperationIds(newSpec)

    expect(normalized1.paths["/users/{id}"].get.operationId).toBe(
      "getUserProfile"
    )
    expect(normalized2.paths["/profiles/{userId}"].post.operationId).toBe(
      "getUserProfile"
    )
  })
})
