/**
 * Utility functions for live specification sources
 */

import { v4 as uuidv4 } from "uuid"
import {
  LiveSpecSource,
  LiveSpecSourceType,
  URLSourceConfig,
  FileSourceConfig,
  SyncHistoryEntry,
} from "~/types/live-spec-source"

/**
 * Generates a unique ID for a live specification source
 */
export function generateSourceId(): string {
  return `live-spec-${uuidv4()}`
}

/**
 * Generates a unique ID for a sync history entry
 */
export function generateSyncHistoryId(): string {
  return `sync-${uuidv4()}`
}

/**
 * Creates a default URL source configuration
 */
export function createDefaultURLConfig(url: string): URLSourceConfig {
  return {
    url,
    pollInterval: 30000, // 30 seconds
    timeout: 10000, // 10 seconds
    headers: {},
  }
}

/**
 * Creates a default file source configuration
 */
export function createDefaultFileConfig(filePath: string): FileSourceConfig {
  return {
    filePath,
    watchEnabled: true,
  }
}

/**
 * Creates a new live specification source with default values
 */
export function createLiveSpecSource(
  name: string,
  type: LiveSpecSourceType,
  config: URLSourceConfig | FileSourceConfig
): Omit<LiveSpecSource, "id" | "createdAt" | "updatedAt"> {
  return {
    name: name.trim(),
    type,
    status: "disconnected",
    config,
    syncStrategy: "replace-all", // Default to replace-all for Phase 1
    lastSync: undefined,
    lastError: undefined,
  }
}

/**
 * Extracts the source URL or file path for display purposes
 */
export function getSourceDisplayPath(source: LiveSpecSource): string {
  switch (source.type) {
    case "url":
      return (source.config as URLSourceConfig).url
    case "file":
      return (source.config as FileSourceConfig).filePath
    default:
      return "Unknown source"
  }
}

/**
 * Checks if a source is URL-based
 */
export function isURLSource(
  source: LiveSpecSource
): source is LiveSpecSource & { config: URLSourceConfig } {
  return source.type === "url"
}

/**
 * Checks if a source is file-based
 */
export function isFileSource(
  source: LiveSpecSource
): source is LiveSpecSource & { config: FileSourceConfig } {
  return source.type === "file"
}

/**
 * Gets the poll interval for a URL source, with fallback to default
 */
export function getPollInterval(source: LiveSpecSource): number {
  if (isURLSource(source)) {
    return source.config.pollInterval ?? 30000
  }
  return 0 // File sources don't poll
}

/**
 * Gets the timeout for a URL source, with fallback to default
 */
export function getTimeout(source: LiveSpecSource): number {
  if (isURLSource(source)) {
    return source.config.timeout ?? 10000
  }
  return 0 // File sources don't have timeouts
}

/**
 * Checks if a source should be actively monitored (polling or watching)
 */
export function shouldMonitorSource(source: LiveSpecSource): boolean {
  if (source.status === "error" || source.status === "disconnected") {
    return false
  }

  if (isURLSource(source)) {
    return (
      source.config.pollInterval !== undefined && source.config.pollInterval > 0
    )
  }

  if (isFileSource(source)) {
    return source.config.watchEnabled === true
  }

  return false
}

/**
 * Creates a sync history entry
 */
export function createSyncHistoryEntry(
  sourceId: string,
  status: "success" | "error" | "partial",
  options: {
    changesSummary?: string[]
    errorMessage?: string
    specVersion?: string
  } = {}
): SyncHistoryEntry {
  return {
    id: generateSyncHistoryId(),
    sourceId,
    timestamp: new Date(),
    status,
    changesSummary: options.changesSummary,
    errorMessage: options.errorMessage,
    specVersion: options.specVersion,
  }
}

/**
 * Formats a timestamp for display
 */
export function formatSyncTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) {
    return "Just now"
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
  }
  return date.toLocaleDateString()
}

/**
 * Generates a simple hash for content comparison
 */
export function generateContentHash(content: string): string {
  let hash = 0
  if (content.length === 0) return hash.toString()

  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36)
}

/**
 * Sanitizes a source name for safe usage
 */
export function sanitizeSourceName(name: string): string {
  return name
    .trim()
    .replace(/[^\w\s\-_.]/g, "") // Remove special characters except basic ones
    .replace(/\s+/g, " ") // Normalize whitespace
    .substring(0, 100) // Limit length
}

/**
 * Checks if two source configurations are equivalent
 */
export function areConfigsEqual(
  config1: URLSourceConfig | FileSourceConfig,
  config2: URLSourceConfig | FileSourceConfig,
  type: LiveSpecSourceType
): boolean {
  if (type === "url") {
    const url1 = config1 as URLSourceConfig
    const url2 = config2 as URLSourceConfig

    return (
      url1.url === url2.url &&
      url1.pollInterval === url2.pollInterval &&
      url1.timeout === url2.timeout &&
      JSON.stringify(url1.headers || {}) === JSON.stringify(url2.headers || {})
    )
  } else if (type === "file") {
    const file1 = config1 as FileSourceConfig
    const file2 = config2 as FileSourceConfig

    return (
      file1.filePath === file2.filePath &&
      file1.watchEnabled === file2.watchEnabled
    )
  }

  return false
}
