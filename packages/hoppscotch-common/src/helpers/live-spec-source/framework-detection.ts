/**
 * Framework Detection Utilities
 *
 * This module provides utilities for detecting development frameworks
 * from various sources like package.json, requirements.txt, URLs, etc.
 */

import {
  FrameworkInfo,
  FrameworkDetectionResult,
} from "~/types/live-collection-metadata"

/**
 * Known framework definitions with detection patterns
 */
const FRAMEWORK_DEFINITIONS: FrameworkInfo[] = [
  {
    name: "FastAPI",
    icon: "python",
    setupGuide: "fastapi-setup",
    commonEndpoints: ["/openapi.json", "/docs", "/redoc"],
    detectionPatterns: {
      packageJson: [],
      requirements: ["fastapi", "uvicorn"],
      filePatterns: ["main.py", "app.py", "**/routers/*.py"],
    },
  },
  {
    name: "Express",
    icon: "nodejs",
    setupGuide: "express-setup",
    commonEndpoints: ["/api-docs", "/swagger.json", "/swagger-ui"],
    detectionPatterns: {
      packageJson: ["express", "swagger-ui-express", "swagger-jsdoc"],
      filePatterns: ["app.js", "server.js", "index.js", "**/routes/*.js"],
    },
  },
  {
    name: "NestJS",
    icon: "nodejs",
    setupGuide: "nestjs-setup",
    commonEndpoints: ["/api", "/api-json", "/api-docs"],
    detectionPatterns: {
      packageJson: ["@nestjs/core", "@nestjs/swagger"],
      filePatterns: ["main.ts", "app.module.ts", "**/modules/*.ts"],
    },
  },
  {
    name: "Spring Boot",
    icon: "java",
    setupGuide: "spring-boot-setup",
    commonEndpoints: ["/v3/api-docs", "/swagger-ui.html", "/swagger-ui/"],
    detectionPatterns: {
      gradle: ["org.springframework.boot", "springdoc-openapi"],
      maven: ["spring-boot-starter", "springdoc-openapi-ui"],
      filePatterns: [
        "Application.java",
        "**/controller/*.java",
        "pom.xml",
        "build.gradle",
      ],
    },
  },
  {
    name: "ASP.NET Core",
    icon: "dotnet",
    setupGuide: "aspnet-setup",
    commonEndpoints: ["/swagger/v1/swagger.json", "/swagger"],
    detectionPatterns: {
      filePatterns: [
        "*.csproj",
        "Program.cs",
        "Startup.cs",
        "**/Controllers/*.cs",
      ],
    },
  },
  {
    name: "Django",
    icon: "python",
    setupGuide: "django-setup",
    commonEndpoints: ["/swagger/", "/redoc/", "/schema/"],
    detectionPatterns: {
      requirements: ["django", "djangorestframework", "drf-yasg"],
      filePatterns: [
        "manage.py",
        "settings.py",
        "**/views.py",
        "**/serializers.py",
      ],
    },
  },
  {
    name: "Flask",
    icon: "python",
    setupGuide: "flask-setup",
    commonEndpoints: ["/swagger/", "/apidocs/", "/swagger.json"],
    detectionPatterns: {
      requirements: ["flask", "flask-restx", "flasgger"],
      filePatterns: ["app.py", "run.py", "**/routes/*.py"],
    },
  },
]

/**
 * Detect framework from package.json content
 */
export function detectFrameworkFromPackageJson(
  packageJsonContent: string
): FrameworkDetectionResult {
  try {
    const packageJson = JSON.parse(packageJsonContent)
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    }
    const dependencyNames = Object.keys(dependencies)

    const detectedFrameworks: FrameworkInfo[] = []

    for (const framework of FRAMEWORK_DEFINITIONS) {
      if (!framework.detectionPatterns?.packageJson) continue

      const matches = framework.detectionPatterns.packageJson.filter(
        (pattern) => dependencyNames.some((dep) => dep.includes(pattern))
      )

      if (matches.length > 0) {
        const version = dependencies[matches[0]] || undefined
        detectedFrameworks.push({
          ...framework,
          version: version?.replace(/[\^~]/, ""), // Remove version prefixes
        })
      }
    }

    return {
      detected: detectedFrameworks.length > 0,
      frameworks: detectedFrameworks,
      confidence: detectedFrameworks.length > 0 ? 0.9 : 0,
      detectionMethod: "package-analysis",
    }
  } catch (error) {
    return {
      detected: false,
      frameworks: [],
      confidence: 0,
      detectionMethod: "package-analysis",
    }
  }
}

/**
 * Detect framework from requirements.txt content
 */
export function detectFrameworkFromRequirements(
  requirementsContent: string
): FrameworkDetectionResult {
  const lines = requirementsContent
    .split("\n")
    .map((line) => line.trim().toLowerCase())
  const detectedFrameworks: FrameworkInfo[] = []

  for (const framework of FRAMEWORK_DEFINITIONS) {
    if (!framework.detectionPatterns?.requirements) continue

    const matches = framework.detectionPatterns.requirements.filter((pattern) =>
      lines.some((line) => line.includes(pattern))
    )

    if (matches.length > 0) {
      // Try to extract version from requirements
      const versionLine = lines.find((line) => line.includes(matches[0]))
      const version = versionLine?.match(/==(.+)$/)?.[1] || undefined

      detectedFrameworks.push({
        ...framework,
        version,
      })
    }
  }

  return {
    detected: detectedFrameworks.length > 0,
    frameworks: detectedFrameworks,
    confidence: detectedFrameworks.length > 0 ? 0.8 : 0,
    detectionMethod: "package-analysis",
  }
}

/**
 * Detect framework from URL patterns
 */
export function detectFrameworkFromUrl(url: string): FrameworkDetectionResult {
  const detectedFrameworks: FrameworkInfo[] = []

  for (const framework of FRAMEWORK_DEFINITIONS) {
    if (!framework.commonEndpoints) continue

    const matches = framework.commonEndpoints.filter((endpoint) =>
      url.includes(endpoint)
    )

    if (matches.length > 0) {
      detectedFrameworks.push(framework)
    }
  }

  // Sort by number of matches (more specific frameworks first)
  detectedFrameworks.sort(
    (a, b) =>
      (b.commonEndpoints?.length || 0) - (a.commonEndpoints?.length || 0)
  )

  return {
    detected: detectedFrameworks.length > 0,
    frameworks: detectedFrameworks,
    confidence: detectedFrameworks.length > 0 ? 0.6 : 0, // Lower confidence for URL-based detection
    detectionMethod: "url-analysis",
    suggestions:
      detectedFrameworks.length > 0
        ? [`Detected ${detectedFrameworks[0].name} from URL pattern`]
        : [
            "Could not detect framework from URL. Try specifying the framework manually.",
          ],
  }
}

/**
 * Detect framework from file patterns in a directory listing
 */
export function detectFrameworkFromFilePatterns(
  filePaths: string[]
): FrameworkDetectionResult {
  const detectedFrameworks: FrameworkInfo[] = []
  const normalizedPaths = filePaths.map((path) => path.toLowerCase())

  for (const framework of FRAMEWORK_DEFINITIONS) {
    if (!framework.detectionPatterns?.filePatterns) continue

    let matchCount = 0
    for (const pattern of framework.detectionPatterns.filePatterns) {
      // Simple pattern matching - could be enhanced with glob patterns
      const simplePattern = pattern.replace("**/", "").replace("*", "")

      if (
        normalizedPaths.some((path) =>
          path.includes(simplePattern.toLowerCase())
        )
      ) {
        matchCount++
      }
    }

    if (matchCount > 0) {
      detectedFrameworks.push({
        ...framework,
        // Add confidence based on number of pattern matches
        confidence:
          matchCount / framework.detectionPatterns.filePatterns.length,
      })
    }
  }

  // Sort by confidence
  detectedFrameworks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))

  return {
    detected: detectedFrameworks.length > 0,
    frameworks: detectedFrameworks,
    confidence:
      detectedFrameworks.length > 0
        ? detectedFrameworks[0].confidence || 0.5
        : 0,
    detectionMethod: "file-pattern",
  }
}

/**
 * Get framework by name (for manual selection)
 */
export function getFrameworkByName(name: string): FrameworkInfo | null {
  return (
    FRAMEWORK_DEFINITIONS.find(
      (f) => f.name.toLowerCase() === name.toLowerCase()
    ) || null
  )
}

/**
 * Get all available frameworks
 */
export function getAllFrameworks(): FrameworkInfo[] {
  return [...FRAMEWORK_DEFINITIONS]
}

/**
 * Get setup suggestions for a detected framework
 */
export function getFrameworkSetupSuggestions(
  framework: FrameworkInfo
): string[] {
  const suggestions: string[] = []

  switch (framework.name) {
    case "FastAPI":
      suggestions.push(
        "Install FastAPI: pip install fastapi uvicorn",
        "Add OpenAPI generation to your FastAPI app",
        "Common endpoint: http://localhost:8000/openapi.json"
      )
      break
    case "Express":
      suggestions.push(
        "Install Swagger packages: npm install swagger-ui-express swagger-jsdoc",
        "Set up Swagger middleware in your Express app",
        "Common endpoint: http://localhost:3000/api-docs"
      )
      break
    case "Spring Boot":
      suggestions.push(
        "Add springdoc-openapi dependency to your pom.xml or build.gradle",
        "Enable OpenAPI documentation in your application",
        "Common endpoint: http://localhost:8080/v3/api-docs"
      )
      break
    case "NestJS":
      suggestions.push(
        "Install Swagger module: npm install @nestjs/swagger",
        "Set up Swagger in your main.ts file",
        "Common endpoint: http://localhost:3000/api"
      )
      break
    default:
      suggestions.push(
        `Set up OpenAPI documentation for ${framework.name}`,
        "Ensure your development server exposes an OpenAPI/Swagger endpoint"
      )
  }

  return suggestions
}

/**
 * Comprehensive framework detection from multiple sources
 */
export function detectFrameworkComprehensive(sources: {
  packageJson?: string
  requirements?: string
  url?: string
  filePaths?: string[]
}): FrameworkDetectionResult {
  const results: FrameworkDetectionResult[] = []

  if (sources.packageJson) {
    results.push(detectFrameworkFromPackageJson(sources.packageJson))
  }

  if (sources.requirements) {
    results.push(detectFrameworkFromRequirements(sources.requirements))
  }

  if (sources.url) {
    results.push(detectFrameworkFromUrl(sources.url))
  }

  if (sources.filePaths) {
    results.push(detectFrameworkFromFilePatterns(sources.filePaths))
  }

  // Combine results and find the most confident detection
  const allFrameworks = results.flatMap((r) => r.frameworks)
  const frameworkCounts = new Map<
    string,
    { framework: FrameworkInfo; count: number; totalConfidence: number }
  >()

  for (const framework of allFrameworks) {
    const key = framework.name
    const existing = frameworkCounts.get(key)

    if (existing) {
      existing.count++
      existing.totalConfidence += framework.confidence || 0.5
    } else {
      frameworkCounts.set(key, {
        framework,
        count: 1,
        totalConfidence: framework.confidence || 0.5,
      })
    }
  }

  // Sort by count and confidence
  const sortedFrameworks = Array.from(frameworkCounts.values())
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count
      return b.totalConfidence - a.totalConfidence
    })
    .map((item) => ({
      ...item.framework,
      confidence: item.totalConfidence / item.count,
    }))

  const hasDetection = sortedFrameworks.length > 0
  const topFramework = sortedFrameworks[0]

  return {
    detected: hasDetection,
    frameworks: sortedFrameworks,
    confidence: hasDetection ? topFramework.confidence || 0.5 : 0,
    detectionMethod: "package-analysis", // Primary method
    suggestions: hasDetection
      ? getFrameworkSetupSuggestions(topFramework)
      : [
          "No framework detected. Please specify your framework manually for better integration.",
        ],
  }
}
