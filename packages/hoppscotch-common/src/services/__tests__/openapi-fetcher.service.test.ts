import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { OpenAPIFetcherImpl } from "../openapi-fetcher.service"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("OpenAPIFetcherImpl", () => {
  let fetcher: OpenAPIFetcherImpl

  beforeEach(() => {
    fetcher = new OpenAPIFetcherImpl()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe("fetchSpec", () => {
    it("should fetch OpenAPI spec successfully", async () => {
      // Mock successful response with proper Headers
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

      const result = await fetcher.fetchSpec(
        "http://localhost:8000/openapi.json"
      )

      expect(result.success).toBe(true)
      expect(result.content).toContain("openapi")
      expect(result.contentType).toBe("application/json")
      expect(result.errors).toHaveLength(0)
      expect(result.metadata.statusCode).toBe(200)
    })

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await fetcher.fetchSpec(
        "http://localhost:8000/openapi.json"
      )

      expect(result.success).toBe(false)
      expect(result.errors).toContain("HTTP 404: Not Found")
      expect(result.metadata.statusCode).toBe(404)
    })

    it("should handle network errors", async () => {
      // Use retries: 0 to test immediate failure
      const options = { retries: 0 }

      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"))

      const result = await fetcher.fetchSpec(
        "http://localhost:8000/openapi.json",
        options
      )

      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.includes("Connection refused"))).toBe(
        true
      )
    })

    it("should handle timeout errors", async () => {
      const timeoutError = new Error("Timeout")
      timeoutError.name = "AbortError"
      mockFetch.mockRejectedValueOnce(timeoutError)

      const result = await fetcher.fetchSpec(
        "http://localhost:8000/openapi.json"
      )

      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.includes("timeout"))).toBe(true)
    })

    it("should retry on network failures", async () => {
      console.log("=== Starting retry test ===")

      const options = { retries: 1, timeout: 1000 }

      // Mock the validation to always pass
      const originalValidate = (fetcher as any).validateOpenAPIContent
      ;(fetcher as any).validateOpenAPIContent = vi.fn().mockReturnValue([])

      // Mock the delay to avoid waiting
      const originalDelay = (fetcher as any).delay
      ;(fetcher as any).delay = vi.fn().mockResolvedValue(undefined)

      let callCount = 0
      mockFetch.mockImplementation(() => {
        callCount++
        console.log(`Mock fetch call #${callCount}`)

        if (callCount === 1) {
          console.log("First call - rejecting with error")
          return Promise.reject(new Error("Network error"))
        }
        console.log("Second call - resolving with success")
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: vi.fn((key: string) => {
              console.log(`Headers.get called with: ${key}`)
              if (key === "content-type") return "application/json"
              return null
            }),
          },
          text: () => {
            console.log("text() called")
            return Promise.resolve('{"openapi": "3.0.0"}')
          },
        })
      })

      console.log("About to call fetchSpec")
      const result = await fetcher.fetchSpec(
        "http://localhost:8000/openapi.json",
        options
      )

      console.log("=== Final Result ===")
      console.log("Success:", result.success)
      console.log("Errors:", result.errors)
      console.log("Content:", result.content)
      console.log("Status Code:", result.metadata.statusCode)
      console.log("Total mock calls:", mockFetch.mock.calls.length)
      console.log(
        "Validation mock calls:",
        (fetcher as any).validateOpenAPIContent.mock.calls.length
      )
      console.log("Delay mock calls:", (fetcher as any).delay.mock.calls.length)

      // Restore mocks
      ;(fetcher as any).validateOpenAPIContent = originalValidate
      ;(fetcher as any).delay = originalDelay

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("should not retry on HTTP 4xx errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await fetcher.fetchSpec(
        "http://localhost:8000/openapi.json"
      )

      expect(result.success).toBe(false)
      expect(result.errors).toContain("HTTP 404: Not Found")
      expect(result.metadata.statusCode).toBe(404)
      expect(mockFetch).toHaveBeenCalledTimes(1) // No retries for 4xx errors
    })

    it("should not retry on timeout errors", async () => {
      const timeoutError = new Error("Timeout")
      timeoutError.name = "AbortError"
      mockFetch.mockRejectedValue(timeoutError)

      const result = await fetcher.fetchSpec(
        "http://localhost:8000/openapi.json"
      )

      expect(result.success).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(1) // No retries
    })

    it("should validate OpenAPI content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            return null
          }),
        },
        text: () => Promise.resolve('{"not": "openapi"}'), // Invalid OpenAPI
      })

      const result = await fetcher.fetchSpec(
        "http://localhost:8000/openapi.json"
      )

      expect(result.success).toBe(false)
      expect(
        result.errors.some((e) => e.includes("OpenAPI specification"))
      ).toBe(true)
    })
  })

  describe("testConnection", () => {
    it("should test connection successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            const headers: Record<string, string> = {
              "content-type": "application/json",
              "access-control-allow-origin": "*",
            }
            return headers[key] || null
          }),
        },
      })

      const result = await fetcher.testConnection(
        "http://localhost:8000/openapi.json"
      )

      expect(result.isReachable).toBe(true)
      expect(result.statusCode).toBe(200)
      expect(result.corsEnabled).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should detect CORS issues", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((key: string) => {
            if (key === "content-type") return "application/json"
            // No CORS header
            return null
          }),
        },
      })

      const result = await fetcher.testConnection(
        "http://localhost:8000/openapi.json"
      )

      expect(result.corsEnabled).toBe(false)
      expect(result.suggestions.some((s) => s.includes("CORS"))).toBe(true)
    })

    it("should provide framework-specific suggestions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: {
          get: vi.fn(() => null),
        },
      })

      const result = await fetcher.testConnection(
        "http://localhost:8000/openapi.json"
      )

      expect(result.suggestions.some((s) => s.includes("FastAPI"))).toBe(true)
      expect(result.suggestions.some((s) => s.includes("uvicorn"))).toBe(true)
    })

    it("should handle connection failures", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"))

      const result = await fetcher.testConnection(
        "http://localhost:8000/openapi.json"
      )

      expect(result.isReachable).toBe(false)
      expect(result.statusCode).toBe(0)
      expect(result.errors.some((e) => e.includes("Connection refused"))).toBe(
        true
      )
    })
  })
})
