import { describe, it, expect, beforeEach } from "vitest"
import { SpecDiffEngine } from "../spec-diff-engine"
// Types imported but used in test assertions

describe("SpecDiffEngine", () => {
  let diffEngine: SpecDiffEngine

  beforeEach(() => {
    diffEngine = new SpecDiffEngine()
  })

  describe("Hash Generation and Basic Comparison", () => {
    it("should detect no changes when specs are identical", async () => {
      const spec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/users": {
            get: {
              summary: "Get users",
              responses: {
                "200": {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: { type: "array" },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = await diffEngine.compareSpecs(spec, spec)

      expect(result.hasChanges).toBe(false)
      expect(result.changes).toHaveLength(0)
      expect(result.oldSpecHash).toBe(result.newSpecHash)
    })

    it("should detect changes when specs are different", async () => {
      const oldSpec = {
        openapi: "3.0.0",
        paths: {
          "/users": {
            get: { summary: "Get users" },
          },
        },
      }

      const newSpec = {
        openapi: "3.0.0",
        paths: {
          "/users": {
            get: { summary: "Get users" },
          },
          "/posts": {
            get: { summary: "Get posts" },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      expect(result.hasChanges).toBe(true)
      expect(result.changes.length).toBeGreaterThan(0)
      expect(result.oldSpecHash).not.toBe(result.newSpecHash)
    })

    it("should generate different hashes for different specs", () => {
      const spec1 = { paths: { "/users": { get: {} } } }
      const spec2 = { paths: { "/posts": { get: {} } } }

      const hash1 = (diffEngine as any).generateSpecHash(spec1)
      const hash2 = (diffEngine as any).generateSpecHash(spec2)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe("Endpoint Changes", () => {
    it("should detect added endpoints", async () => {
      const oldSpec = {
        paths: {
          "/users": {
            get: { summary: "Get users" },
          },
        },
      }

      const newSpec = {
        paths: {
          "/users": {
            get: { summary: "Get users" },
          },
          "/posts": {
            get: { summary: "Get posts" },
            post: { summary: "Create post" },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      expect(result.hasChanges).toBe(true)

      const addedEndpoints = result.changes.filter(
        (c) => c.type === "endpoint-added"
      )
      expect(addedEndpoints).toHaveLength(2) // GET /posts and POST /posts

      expect(addedEndpoints[0].severity).toBe("non-breaking")
      expect(addedEndpoints[0].description).toContain("Added new endpoint")
      expect(addedEndpoints[0].affectedEndpoints).toContain("GET /posts")
    })

    it("should detect removed endpoints as breaking changes", async () => {
      const oldSpec = {
        paths: {
          "/users": {
            get: { summary: "Get users" },
            delete: { summary: "Delete user" },
          },
          "/posts": {
            get: { summary: "Get posts" },
          },
        },
      }

      const newSpec = {
        paths: {
          "/users": {
            get: { summary: "Get users" },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      const removedEndpoints = result.changes.filter(
        (c) => c.type === "endpoint-removed"
      )

      // We should find: DELETE /users (method removed) and GET /posts (entire path removed)
      expect(removedEndpoints).toHaveLength(2)

      // Check that we have the specific endpoints we expect
      const removedPaths = removedEndpoints.map((c) => c.path)
      expect(removedPaths).toContain("DELETE /users")
      expect(removedPaths).toContain("GET /posts")

      removedEndpoints.forEach((change) => {
        expect(change.severity).toBe("breaking")
        expect(change.description).toContain("Removed endpoint")
      })
    })
  })

  describe("Parameter Changes", () => {
    it("should detect added required parameters as breaking changes", async () => {
      const oldSpec = {
        paths: {
          "/users": {
            get: {
              parameters: [
                {
                  name: "limit",
                  in: "query",
                  required: false,
                  schema: { type: "integer" },
                },
              ],
            },
          },
        },
      }

      const newSpec = {
        paths: {
          "/users": {
            get: {
              parameters: [
                {
                  name: "limit",
                  in: "query",
                  required: false,
                  schema: { type: "integer" },
                },
                {
                  name: "apiKey",
                  in: "header",
                  required: true,
                  schema: { type: "string" },
                },
              ],
            },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      const parameterChanges = result.changes.filter(
        (c) => c.type === "parameter-added"
      )
      expect(parameterChanges).toHaveLength(1)
      expect(parameterChanges[0].severity).toBe("breaking") // Required parameter
      expect(parameterChanges[0].description).toContain("required parameter")
    })

    it("should detect added optional parameters as non-breaking", async () => {
      const oldSpec = {
        paths: {
          "/users": {
            get: {
              parameters: [
                {
                  name: "limit",
                  in: "query",
                  required: false,
                  schema: { type: "integer" },
                },
              ],
            },
          },
        },
      }

      const newSpec = {
        paths: {
          "/users": {
            get: {
              parameters: [
                {
                  name: "limit",
                  in: "query",
                  required: false,
                  schema: { type: "integer" },
                },
                {
                  name: "sort",
                  in: "query",
                  required: false,
                  schema: { type: "string" },
                },
              ],
            },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      const parameterChanges = result.changes.filter(
        (c) => c.type === "parameter-added"
      )
      expect(parameterChanges).toHaveLength(1)
      expect(parameterChanges[0].severity).toBe("non-breaking") // Optional parameter
      expect(parameterChanges[0].description).toContain("optional parameter")
    })

    it("should detect removed parameters as breaking changes", async () => {
      const oldSpec = {
        paths: {
          "/users": {
            get: {
              parameters: [
                {
                  name: "limit",
                  in: "query",
                  required: false,
                  schema: { type: "integer" },
                },
                {
                  name: "offset",
                  in: "query",
                  required: false,
                  schema: { type: "integer" },
                },
              ],
            },
          },
        },
      }

      const newSpec = {
        paths: {
          "/users": {
            get: {
              parameters: [
                {
                  name: "limit",
                  in: "query",
                  required: false,
                  schema: { type: "integer" },
                },
              ],
            },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      const parameterChanges = result.changes.filter(
        (c) => c.type === "parameter-removed"
      )
      expect(parameterChanges).toHaveLength(1)
      expect(parameterChanges[0].severity).toBe("breaking")
      expect(parameterChanges[0].description).toContain(
        "Removed parameter: offset"
      )
    })
  })

  describe("Schema Changes", () => {
    it("should detect added schemas as non-breaking", async () => {
      const oldSpec = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "integer" },
                name: { type: "string" },
              },
            },
          },
        },
      }

      const newSpec = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "integer" },
                name: { type: "string" },
              },
            },
            Post: {
              type: "object",
              properties: {
                id: { type: "integer" },
                title: { type: "string" },
              },
            },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      const schemaChanges = result.changes.filter(
        (c) => c.type === "schema-added"
      )
      expect(schemaChanges).toHaveLength(1)
      expect(schemaChanges[0].severity).toBe("non-breaking")
      expect(schemaChanges[0].description).toContain("Added new schema: Post")
    })

    it("should detect removed schemas as breaking changes", async () => {
      const oldSpec = {
        components: {
          schemas: {
            User: { type: "object" },
            Post: { type: "object" },
          },
        },
      }

      const newSpec = {
        components: {
          schemas: {
            User: { type: "object" },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      const schemaChanges = result.changes.filter(
        (c) => c.type === "schema-removed"
      )
      expect(schemaChanges).toHaveLength(1)
      expect(schemaChanges[0].severity).toBe("breaking")
      expect(schemaChanges[0].description).toContain("Removed schema: Post")
    })
  })

  describe("Response Changes", () => {
    it("should detect added response status codes as non-breaking", async () => {
      const oldSpec = {
        paths: {
          "/users": {
            get: {
              responses: {
                "200": { description: "Success" },
              },
            },
          },
        },
      }

      const newSpec = {
        paths: {
          "/users": {
            get: {
              responses: {
                "200": { description: "Success" },
                "404": { description: "Not Found" },
              },
            },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      const responseChanges = result.changes.filter(
        (c) =>
          c.type === "endpoint-modified" &&
          c.description.includes("Added response status")
      )
      expect(responseChanges).toHaveLength(1)
      expect(responseChanges[0].severity).toBe("non-breaking")
    })

    it("should detect removed response status codes as breaking", async () => {
      const oldSpec = {
        paths: {
          "/users": {
            get: {
              responses: {
                "200": { description: "Success" },
                "404": { description: "Not Found" },
              },
            },
          },
        },
      }

      const newSpec = {
        paths: {
          "/users": {
            get: {
              responses: {
                "200": { description: "Success" },
              },
            },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      const responseChanges = result.changes.filter(
        (c) =>
          c.type === "endpoint-modified" &&
          c.description.includes("Removed response status")
      )
      expect(responseChanges).toHaveLength(1)
      expect(responseChanges[0].severity).toBe("breaking")
    })
  })

  describe("Summary Generation", () => {
    it("should generate correct summary statistics", async () => {
      const oldSpec = {
        paths: {
          "/users": {
            get: {
              responses: { "200": { description: "Success" } },
            },
          },
        },
        components: {
          schemas: {
            User: { type: "object" },
          },
        },
      }

      const newSpec = {
        paths: {
          "/users": {
            get: {
              responses: { "200": { description: "Success" } },
            },
            post: {
              responses: { "201": { description: "Created" } },
            },
          },
          "/posts": {
            get: {
              responses: { "200": { description: "Success" } },
            },
          },
        },
        components: {
          schemas: {
            User: { type: "object" },
            Post: { type: "object" },
          },
        },
      }

      const result = await diffEngine.compareSpecs(oldSpec, newSpec)

      expect(result.summary.added).toBeGreaterThan(0) // New endpoints and schemas
      expect(result.summary.removed).toBe(0) // Nothing removed
      expect(result.summary.nonBreaking).toBeGreaterThan(0) // All additions are non-breaking
      expect(result.summary.breaking).toBe(0) // No breaking changes
    })
  })
})
