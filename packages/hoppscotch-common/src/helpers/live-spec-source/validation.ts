/**
 * Validation utilities for live specification sources
 */

import {
  URLSourceConfig,
  FileSourceConfig,
  LiveSpecSourceType,
  SourceValidationResult,
} from "~/types/live-spec-source"

/**
 * Validates a URL source configuration
 */
export function validateURLSource(
  config: URLSourceConfig
): SourceValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate URL format
  try {
    const url = new URL(config.url)

    // Check protocol
    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push("URL must use HTTP or HTTPS protocol")
    }

    // Warn about HTTP in production
    if (url.protocol === "http:" && !isLocalhost(url.hostname)) {
      warnings.push("HTTP URLs are not secure. Consider using HTTPS.")
    }

    // Check for localhost/private IPs to prevent SSRF
    if (isPrivateIP(url.hostname)) {
      warnings.push(
        "Private IP addresses may not be accessible from all environments"
      )
    }
  } catch (error) {
    errors.push("Invalid URL format")
  }

  // Validate poll interval
  if (config.pollInterval !== undefined) {
    if (config.pollInterval < 5000) {
      errors.push("Poll interval must be at least 5 seconds (5000ms)")
    }
    if (config.pollInterval > 3600000) {
      warnings.push("Poll interval longer than 1 hour may not be practical")
    }
  }

  // Validate timeout
  if (config.timeout !== undefined) {
    if (config.timeout < 1000) {
      errors.push("Timeout must be at least 1 second (1000ms)")
    }
    if (config.timeout > 60000) {
      warnings.push(
        "Timeout longer than 60 seconds may cause poor user experience"
      )
    }
  }

  // Validate headers
  if (config.headers) {
    for (const [key, value] of Object.entries(config.headers)) {
      if (!key.trim()) {
        errors.push("Header names cannot be empty")
      }
      if (typeof value !== "string") {
        errors.push(`Header value for "${key}" must be a string`)
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validates a file source configuration
 */
export function validateFileSource(
  config: FileSourceConfig
): SourceValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate file path
  if (!config.filePath || !config.filePath.trim()) {
    errors.push("File path is required")
  } else {
    const filePath = config.filePath.trim()

    // Check file extension
    const validExtensions = [".json", ".yaml", ".yml"]
    const hasValidExtension = validExtensions.some((ext) =>
      filePath.toLowerCase().endsWith(ext)
    )

    if (!hasValidExtension) {
      errors.push("File must have a .json, .yaml, or .yml extension")
    }

    // Check for directory traversal attempts
    if (filePath.includes("..") || filePath.includes("~")) {
      errors.push("File path cannot contain directory traversal sequences")
    }

    // Warn about absolute paths
    if (isAbsolutePath(filePath)) {
      warnings.push(
        "Absolute file paths may not work across different environments"
      )
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validates source configuration based on type
 */
export function validateSourceConfig(
  config: URLSourceConfig | FileSourceConfig,
  type: LiveSpecSourceType
): SourceValidationResult {
  switch (type) {
    case "url":
      return validateURLSource(config as URLSourceConfig)
    case "file":
      return validateFileSource(config as FileSourceConfig)
    default:
      return {
        isValid: false,
        errors: [`Unknown source type: ${type}`],
        warnings: [],
      }
  }
}

/**
 * Helper function to check if hostname is localhost
 */
function isLocalhost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase())
}

/**
 * Helper function to check if hostname is a private IP
 */
function isPrivateIP(hostname: string): boolean {
  // Basic check for private IP ranges
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
  ]

  return privateRanges.some((range) => range.test(hostname))
}

/**
 * Helper function to check if path is absolute
 */
function isAbsolutePath(path: string): boolean {
  // Windows: C:\ or \\
  // Unix: /
  return /^([a-zA-Z]:[\\/]|[\\/])/.test(path)
}

/**
 * Validates source name
 */
export function validateSourceName(name: string): SourceValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!name || !name.trim()) {
    errors.push("Source name is required")
  } else {
    const trimmedName = name.trim()

    if (trimmedName.length < 2) {
      errors.push("Source name must be at least 2 characters long")
    }

    if (trimmedName.length > 100) {
      errors.push("Source name must be less than 100 characters")
    }

    // Check for special characters that might cause issues
    if (!/^[a-zA-Z0-9\s\-_\.]+$/.test(trimmedName)) {
      warnings.push(
        "Source name contains special characters that may cause display issues"
      )
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}
