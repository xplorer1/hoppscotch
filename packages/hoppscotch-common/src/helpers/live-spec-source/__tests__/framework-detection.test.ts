/**
 * Tests for framework detection utilities
 */

import { describe, it, expect } from "vitest"
import {
  detectFrameworkFromURL,
  detectFrameworkFromFile,
  getFrameworkSetupInstructions,
  getFrameworkErrorGuidance,
} from "../framework-detection"
import { URLSourceConfig, FileSourceConfig } from "~/types/live-spec-source"

describe("detectFrameworkFromURL", () => {
  it("should detect FastAPI from URL patterns", () => {
    const config: URLSourceConfig = {
      url: "http://localhost:8000/openapi.json",
    }

    const result = detectFrameworkFromURL(config)

    expect(result.framework).toBe("fastapi")
    expect(result.confidence).toBeGreaterThan(0.5)
    expect(result.indicators).toContain(
      "URL matches fastapi pattern: /openapi.json"
    )
  })

  it("should detect Express from URL patterns", () => {
    const config: URLSourceConfig = {
      url: "http://localhost:3000/api-docs.json",
    }

    const result = detectFrameworkFromURL(config)

    expect(result.framework).toBe("express")
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should detect Spring Boot from URL patterns", () => {
    const config: URLSourceConfig = {
      url: "http://localhost:8080/v3/api-docs",
    }

    const result = detectFrameworkFromURL(config)

    expect(result.framework).toBe("spring")
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should detect NestJS from URL patterns", () => {
    const config: URLSourceConfig = {
      url: "http://localhost:3000/api-json",
    }

    const result = detectFrameworkFromURL(config)

    expect(result.framework).toBe("nestjs")
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should use port-based heuristics for Express", () => {
    const config: URLSourceConfig = {
      url: "http://localhost:3000/custom-docs",
    }

    const result = detectFrameworkFromURL(config)

    expect(result.framework).toBe("express")
    expect(result.indicators.some((i) => i.includes("port 3000"))).toBe(true)
  })

  it("should use port-based heuristics for FastAPI", () => {
    const config: URLSourceConfig = {
      url: "http://localhost:8000/docs",
    }

    const result = detectFrameworkFromURL(config)

    expect(result.framework).toBe("fastapi")
    expect(result.indicators.some((i) => i.includes("port 8000"))).toBe(true)
  })

  it("should use port-based heuristics for Spring", () => {
    const config: URLSourceConfig = {
      url: "http://localhost:8080/custom-api-docs",
    }

    const result = detectFrameworkFromURL(config)

    expect(result.framework).toBe("spring")
    expect(result.indicators.some((i) => i.includes("port 8080"))).toBe(true)
  })

  it("should return unknown for unrecognized patterns", () => {
    const config: URLSourceConfig = {
      url: "http://localhost:9999/unknown-endpoint",
    }

    const result = detectFrameworkFromURL(config)

    expect(result.framework).toBe("unknown")
    expect(result.confidence).toBe(0)
  })

  it("should handle case insensitive matching", () => {
    const config: URLSourceConfig = {
      url: "HTTP://LOCALHOST:8000/OPENAPI.JSON",
    }

    const result = detectFrameworkFromURL(config)

    expect(result.framework).toBe("fastapi")
    expect(result.confidence).toBeGreaterThan(0.5)
  })
})

describe("detectFrameworkFromFile", () => {
  it("should detect FastAPI from file path", () => {
    const config: FileSourceConfig = {
      filePath: "./fastapi_app/openapi.json",
    }

    const result = detectFrameworkFromFile(config)

    expect(result.framework).toBe("fastapi")
    expect(result.confidence).toBeGreaterThan(0.5)
    expect(result.indicators).toContain("FastAPI detected in file path")
  })

  it("should detect Express from file path", () => {
    const config: FileSourceConfig = {
      filePath: "./express-api/swagger.json",
    }

    const result = detectFrameworkFromFile(config)

    expect(result.framework).toBe("express")
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should detect Spring from file path", () => {
    const config: FileSourceConfig = {
      filePath: "./spring-boot-app/api-docs.json",
    }

    const result = detectFrameworkFromFile(config)

    expect(result.framework).toBe("spring")
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should detect Flask from file path", () => {
    const config: FileSourceConfig = {
      filePath: "./flask_app/swagger.json",
    }

    const result = detectFrameworkFromFile(config)

    expect(result.framework).toBe("flask")
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should detect Django from file path", () => {
    const config: FileSourceConfig = {
      filePath: "./django_project/openapi.json",
    }

    const result = detectFrameworkFromFile(config)

    expect(result.framework).toBe("django")
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should detect ASP.NET from file path", () => {
    const config: FileSourceConfig = {
      filePath: "./aspnet-api/swagger.json",
    }

    const result = detectFrameworkFromFile(config)

    expect(result.framework).toBe("aspnet")
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should provide basic detection for generic OpenAPI files", () => {
    const config: FileSourceConfig = {
      filePath: "./api/openapi.json",
    }

    const result = detectFrameworkFromFile(config)

    expect(result.indicators).toContain("OpenAPI JSON file detected")
    expect(result.confidence).toBeGreaterThan(0)
  })

  it("should detect swagger files", () => {
    const config: FileSourceConfig = {
      filePath: "./docs/swagger.yaml",
    }

    const result = detectFrameworkFromFile(config)

    expect(result.indicators).toContain("Swagger file detected")
    expect(result.confidence).toBeGreaterThan(0)
  })

  it("should return unknown for unrecognized patterns", () => {
    const config: FileSourceConfig = {
      filePath: "./random/file.json",
    }

    const result = detectFrameworkFromFile(config)

    expect(result.framework).toBe("unknown")
  })

  it("should handle case insensitive matching", () => {
    const config: FileSourceConfig = {
      filePath: "./FASTAPI_APP/OPENAPI.JSON",
    }

    const result = detectFrameworkFromFile(config)

    expect(result.framework).toBe("fastapi")
    expect(result.confidence).toBeGreaterThan(0.5)
  })
})

describe("getFrameworkSetupInstructions", () => {
  it("should provide FastAPI setup instructions", () => {
    const instructions = getFrameworkSetupInstructions("fastapi")

    expect(instructions).toContain(
      "FastAPI automatically generates OpenAPI specs"
    )
    expect(
      instructions.some((i) => i.includes("http://localhost:8000/openapi.json"))
    ).toBe(true)
  })

  it("should provide Express setup instructions", () => {
    const instructions = getFrameworkSetupInstructions("express")

    expect(instructions.some((i) => i.includes("swagger-jsdoc"))).toBe(true)
    expect(instructions.some((i) => i.includes("JSDoc comments"))).toBe(true)
  })

  it("should provide NestJS setup instructions", () => {
    const instructions = getFrameworkSetupInstructions("nestjs")

    expect(instructions.some((i) => i.includes("@nestjs/swagger"))).toBe(true)
    expect(instructions.some((i) => i.includes("SwaggerModule"))).toBe(true)
  })

  it("should provide Spring setup instructions", () => {
    const instructions = getFrameworkSetupInstructions("spring")

    expect(instructions.some((i) => i.includes("springdoc-openapi"))).toBe(true)
    expect(instructions.some((i) => i.includes("@Operation"))).toBe(true)
  })

  it("should provide generic instructions for unknown frameworks", () => {
    const instructions = getFrameworkSetupInstructions("unknown")

    expect(instructions.some((i) => i.includes("OpenAPI 3.0+"))).toBe(true)
    expect(instructions.some((i) => i.includes("CORS"))).toBe(true)
  })
})

describe("getFrameworkErrorGuidance", () => {
  it("should provide FastAPI-specific error guidance", () => {
    const guidance = getFrameworkErrorGuidance("fastapi", "Connection failed")

    expect(guidance.some((g) => g.includes("port 8000"))).toBe(true)
    expect(guidance.some((g) => g.includes("/openapi.json"))).toBe(true)
    expect(
      guidance.some((g) => g.includes("development server is running"))
    ).toBe(true)
  })

  it("should provide Express-specific error guidance", () => {
    const guidance = getFrameworkErrorGuidance("express", "Not found")

    expect(guidance.some((g) => g.includes("swagger-jsdoc"))).toBe(true)
    expect(guidance.some((g) => g.includes("JSDoc comments"))).toBe(true)
  })

  it("should provide Spring-specific error guidance", () => {
    const guidance = getFrameworkErrorGuidance("spring", "Server error")

    expect(guidance.some((g) => g.includes("springdoc-openapi"))).toBe(true)
    expect(guidance.some((g) => g.includes("port 8080"))).toBe(true)
  })

  it("should provide common guidance for all frameworks", () => {
    const guidance = getFrameworkErrorGuidance("fastapi", "Network error")

    expect(
      guidance.some((g) => g.includes("development server is running"))
    ).toBe(true)
    expect(guidance.some((g) => g.includes("CORS"))).toBe(true)
  })

  it("should provide only common guidance for unknown frameworks", () => {
    const guidance = getFrameworkErrorGuidance("unknown", "Error")

    expect(
      guidance.some((g) => g.includes("development server is running"))
    ).toBe(true)
    expect(guidance.length).toBeGreaterThan(0)
  })
})
