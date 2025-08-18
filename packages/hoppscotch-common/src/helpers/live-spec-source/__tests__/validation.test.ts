/**
 * Tests for live specification source validation utilities
 */

import { describe, it, expect } from "vitest"
import {
  validateURLSource,
  validateFileSource,
  validateSourceConfig,
  validateSourceName,
} from "../validation"
import { URLSourceConfig, FileSourceConfig } from "~/types/live-spec-source"

describe("validateURLSource", () => {
  it("should validate a valid HTTP URL", () => {
    const config: URLSourceConfig = {
      url: "http://localhost:3000/api/spec.json",
    }

    const result = validateURLSource(config)
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("should validate a valid HTTPS URL", () => {
    const config: URLSourceConfig = {
      url: "https://api.example.com/openapi.json",
    }

    const result = validateURLSource(config)
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("should reject invalid URL format", () => {
    const config: URLSourceConfig = {
      url: "not-a-url",
    }

    const result = validateURLSource(config)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain("Invalid URL format")
  })

  it("should reject non-HTTP protocols", () => {
    const config: URLSourceConfig = {
      url: "ftp://example.com/spec.json",
    }

    const result = validateURLSource(config)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain("URL must use HTTP or HTTPS protocol")
  })

  it("should warn about HTTP URLs for non-localhost", () => {
    const config: URLSourceConfig = {
      url: "http://api.example.com/spec.json",
    }

    const result = validateURLSource(config)
    expect(result.isValid).toBe(true)
    expect(result.warnings).toContain(
      "HTTP URLs are not secure. Consider using HTTPS."
    )
  })

  it("should reject poll interval less than 5 seconds", () => {
    const config: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
      pollInterval: 1000,
    }

    const result = validateURLSource(config)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain(
      "Poll interval must be at least 5 seconds (5000ms)"
    )
  })

  it("should reject timeout less than 1 second", () => {
    const config: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
      timeout: 500,
    }

    const result = validateURLSource(config)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain(
      "Timeout must be at least 1 second (1000ms)"
    )
  })

  it("should validate headers", () => {
    const config: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
    }

    const result = validateURLSource(config)
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("should reject empty header names", () => {
    const config: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
      headers: {
        "": "value",
      },
    }

    const result = validateURLSource(config)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain("Header names cannot be empty")
  })
})

describe("validateFileSource", () => {
  it("should validate a valid JSON file path", () => {
    const config: FileSourceConfig = {
      filePath: "./api/openapi.json",
    }

    const result = validateFileSource(config)
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("should validate a valid YAML file path", () => {
    const config: FileSourceConfig = {
      filePath: "./api/openapi.yaml",
    }

    const result = validateFileSource(config)
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("should validate a valid YML file path", () => {
    const config: FileSourceConfig = {
      filePath: "./api/openapi.yml",
    }

    const result = validateFileSource(config)
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("should reject empty file path", () => {
    const config: FileSourceConfig = {
      filePath: "",
    }

    const result = validateFileSource(config)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain("File path is required")
  })

  it("should reject invalid file extensions", () => {
    const config: FileSourceConfig = {
      filePath: "./api/spec.txt",
    }

    const result = validateFileSource(config)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain(
      "File must have a .json, .yaml, or .yml extension"
    )
  })

  it("should reject directory traversal attempts", () => {
    const config: FileSourceConfig = {
      filePath: "../../../etc/passwd",
    }

    const result = validateFileSource(config)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain(
      "File path cannot contain directory traversal sequences"
    )
  })

  it("should warn about absolute paths", () => {
    const config: FileSourceConfig = {
      filePath: "/absolute/path/to/spec.json",
    }

    const result = validateFileSource(config)
    expect(result.isValid).toBe(true)
    expect(result.warnings).toContain(
      "Absolute file paths may not work across different environments"
    )
  })
})

describe("validateSourceConfig", () => {
  it("should validate URL source config", () => {
    const config: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
    }

    const result = validateSourceConfig(config, "url")
    expect(result.isValid).toBe(true)
  })

  it("should validate file source config", () => {
    const config: FileSourceConfig = {
      filePath: "./spec.json",
    }

    const result = validateSourceConfig(config, "file")
    expect(result.isValid).toBe(true)
  })

  it("should reject unknown source type", () => {
    const config: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
    }

    const result = validateSourceConfig(config, "unknown" as any)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain("Unknown source type: unknown")
  })
})

describe("validateSourceName", () => {
  it("should validate a valid name", () => {
    const result = validateSourceName("My API Spec")
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("should reject empty name", () => {
    const result = validateSourceName("")
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain("Source name is required")
  })

  it("should reject name that is too short", () => {
    const result = validateSourceName("A")
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain(
      "Source name must be at least 2 characters long"
    )
  })

  it("should reject name that is too long", () => {
    const longName = "A".repeat(101)
    const result = validateSourceName(longName)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain(
      "Source name must be less than 100 characters"
    )
  })

  it("should warn about special characters", () => {
    const result = validateSourceName("My API Spec @#$%")
    expect(result.isValid).toBe(true)
    expect(result.warnings).toContain(
      "Source name contains special characters that may cause display issues"
    )
  })
})
