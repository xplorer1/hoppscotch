/**
 * Live Specification Source Service
 *
 * This service manages live specification sources for the API Studio feature.
 * It provides CRUD operations for sources, handles synchronization, and manages
 * local storage persistence.
 */

import {
  LiveSpecSource,
  LiveSpecSourceService,
  LiveSpecSourceType,
  URLSourceConfig,
  FileSourceConfig,
  SyncResult,
  SourceValidationResult,
  SyncHistoryEntry,
  LiveSpecSourceServiceEvent,
} from "~/types/live-spec-source"
import {
  LiveSpecStorage,
  LocalStorageLiveSpecStorage,
} from "~/types/live-spec-storage"
import {
  generateSourceId,
  sanitizeSourceName,
  createSyncHistoryEntry,
  generateContentHash,
} from "~/helpers/live-spec-source/utils"
import {
  validateSourceConfig,
  validateSourceName,
} from "~/helpers/live-spec-source/validation"
import {
  detectFrameworkFromUrl,
  detectFrameworkFromFilePatterns,
  getFrameworkErrorGuidance,
} from "~/helpers/live-spec-source/framework-detection"
import { OpenAPIFetcherImpl, OpenAPIFetcher } from "./openapi-fetcher.service"

/**
 * Event emitter interface for service events
 */
interface EventEmitter {
  emit(event: LiveSpecSourceServiceEvent): void
  on(
    eventType: string,
    handler: (event: LiveSpecSourceServiceEvent) => void
  ): void
  off(
    eventType: string,
    handler: (event: LiveSpecSourceServiceEvent) => void
  ): void
}

/**
 * Simple event emitter implementation
 */
class SimpleEventEmitter implements EventEmitter {
  private handlers = new Map<
    string,
    Array<(event: LiveSpecSourceServiceEvent) => void>
  >()

  emit(event: LiveSpecSourceServiceEvent): void {
    const handlers = this.handlers.get(event.type) || []
    handlers.forEach((handler) => {
      try {
        handler(event)
      } catch (error) {
        console.error("Error in event handler:", error)
      }
    })
  }

  on(
    eventType: string,
    handler: (event: LiveSpecSourceServiceEvent) => void
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    this.handlers.get(eventType)!.push(handler)
  }

  off(
    eventType: string,
    handler: (event: LiveSpecSourceServiceEvent) => void
  ): void {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }
}

/**
 * Implementation of the LiveSpecSourceService
 */
export class LiveSpecSourceServiceImpl implements LiveSpecSourceService {
  private sources: Map<string, LiveSpecSource> = new Map()
  private storage: LiveSpecStorage
  private eventEmitter: EventEmitter = new SimpleEventEmitter()
  private fetcher: OpenAPIFetcher = new OpenAPIFetcherImpl()

  constructor(storage?: LiveSpecStorage) {
    this.storage = storage || new LocalStorageLiveSpecStorage()
    this.loadSourcesFromStorage()
  }

  /**
   * Load sources from storage on initialization
   */
  private async loadSourcesFromStorage(): Promise<void> {
    try {
      const sources = await this.storage.loadSources()
      this.sources.clear()
      sources.forEach((source) => {
        this.sources.set(source.id, source)
      })
    } catch (error) {
      console.error("Failed to load sources from storage:", error)
    }
  }

  /**
   * Save sources to storage
   */
  private async saveSourcesToStorage(): Promise<void> {
    try {
      const sources = Array.from(this.sources.values())
      await this.storage.saveSources(sources)
    } catch (error) {
      console.error("Failed to save sources to storage:", error)
      throw error
    }
  }

  /**
   * Register a new live specification source
   */
  async registerSource(
    source: Omit<LiveSpecSource, "id" | "createdAt" | "updatedAt">
  ): Promise<LiveSpecSource> {
    // Validate source name
    const nameValidation = validateSourceName(source.name)
    if (!nameValidation.isValid) {
      throw new Error(
        `Invalid source name: ${nameValidation.errors.join(", ")}`
      )
    }

    // Validate source configuration
    const configValidation = await this.validateSource(
      source.config,
      source.type
    )
    if (!configValidation.isValid) {
      throw new Error(
        `Invalid source configuration: ${configValidation.errors.join(", ")}`
      )
    }

    // Detect framework for better UX
    // const framework = this.detectFramework(source.config, source.type)

    // Create the new source
    const now = new Date()
    const newSource: LiveSpecSource = {
      id: generateSourceId(),
      name: sanitizeSourceName(source.name),
      type: source.type,
      status: source.status,
      config: source.config,
      syncStrategy: source.syncStrategy,
      lastSync: source.lastSync,
      lastError: source.lastError,
      createdAt: now,
      updatedAt: now,
    }

    // Store the source
    this.sources.set(newSource.id, newSource)
    await this.saveSourcesToStorage()

    // Emit event
    this.eventEmitter.emit({
      type: "source-registered",
      source: newSource,
    })

    return newSource
  }

  /**
   * Unregister and remove a live specification source
   */
  async unregisterSource(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId)
    if (!source) {
      throw new Error(`Source with ID ${sourceId} not found`)
    }

    // Remove from memory
    this.sources.delete(sourceId)

    // Clear sync history
    await this.clearSyncHistory(sourceId)

    // Save to storage
    await this.saveSourcesToStorage()

    // Emit event
    this.eventEmitter.emit({
      type: "source-unregistered",
      sourceId,
    })
  }

  /**
   * Get all registered sources
   */
  getSources(): LiveSpecSource[] {
    return Array.from(this.sources.values())
  }

  /**
   * Get a specific source by ID
   */
  getSource(sourceId: string): LiveSpecSource | null {
    return this.sources.get(sourceId) || null
  }

  /**
   * Update source configuration
   */
  async updateSource(
    sourceId: string,
    updates: Partial<LiveSpecSource>
  ): Promise<LiveSpecSource> {
    const existingSource = this.sources.get(sourceId)
    if (!existingSource) {
      throw new Error(`Source with ID ${sourceId} not found`)
    }

    // Validate name if being updated
    if (updates.name !== undefined) {
      const nameValidation = validateSourceName(updates.name)
      if (!nameValidation.isValid) {
        throw new Error(
          `Invalid source name: ${nameValidation.errors.join(", ")}`
        )
      }
      updates.name = sanitizeSourceName(updates.name)
    }

    // Validate config if being updated
    if (updates.config !== undefined && updates.type !== undefined) {
      const configValidation = await this.validateSource(
        updates.config,
        updates.type
      )
      if (!configValidation.isValid) {
        throw new Error(
          `Invalid source configuration: ${configValidation.errors.join(", ")}`
        )
      }
    }

    // Create updated source
    const updatedSource: LiveSpecSource = {
      ...existingSource,
      ...updates,
      id: existingSource.id, // Prevent ID changes
      createdAt: existingSource.createdAt, // Prevent creation date changes
      updatedAt: new Date(),
    }

    // Store the updated source
    this.sources.set(sourceId, updatedSource)
    await this.saveSourcesToStorage()

    // Emit event
    this.eventEmitter.emit({
      type: "source-updated",
      source: updatedSource,
    })

    return updatedSource
  }

  /**
   * Manually trigger synchronization for a source
   */
  async syncSource(sourceId: string): Promise<SyncResult> {
    const source = this.sources.get(sourceId)
    if (!source) {
      throw new Error(`Source with ID ${sourceId} not found`)
    }

    // Update source status to syncing
    await this.updateSourceStatus(sourceId, "syncing")

    // Emit sync started event
    this.eventEmitter.emit({
      type: "sync-started",
      sourceId,
    })

    try {
      // Perform the actual sync based on source type
      const result = await this.performSync(source)

      // Update source with sync results
      const updates: Partial<LiveSpecSource> = {
        lastSync: result.timestamp,
        status: result.success ? "connected" : "error",
        lastError: result.success ? undefined : result.errors.join("; "),
      }

      await this.updateSource(sourceId, updates)

      // Save sync history
      const historyEntry = createSyncHistoryEntry(
        sourceId,
        result.success ? "success" : "error",
        {
          changesSummary: result.changesSummary,
          errorMessage: result.success ? undefined : result.errors.join("; "),
          specVersion: result.specVersion,
        }
      )
      await this.storage.saveSyncHistoryEntry(historyEntry)

      // Emit sync completed event
      this.eventEmitter.emit({
        type: "sync-completed",
        sourceId,
        result,
      })

      return result
    } catch (error) {
      // Handle sync error
      const errorMessage =
        error instanceof Error ? error.message : "Unknown sync error"

      await this.updateSource(sourceId, {
        status: "error",
        lastError: errorMessage,
      })

      // Save error to sync history
      const historyEntry = createSyncHistoryEntry(sourceId, "error", {
        errorMessage,
      })
      await this.storage.saveSyncHistoryEntry(historyEntry)

      // Emit sync error event
      this.eventEmitter.emit({
        type: "sync-error",
        sourceId,
        error: errorMessage,
      })

      const result: SyncResult = {
        success: false,
        hasChanges: false,
        changesSummary: [],
        errors: [errorMessage],
        timestamp: new Date(),
      }

      return result
    }
  }

  /**
   * Validate source configuration
   */
  async validateSource(
    config: URLSourceConfig | FileSourceConfig,
    type: LiveSpecSourceType
  ): Promise<SourceValidationResult> {
    const basicValidation = validateSourceConfig(config, type)

    if (!basicValidation.isValid) {
      return basicValidation
    }

    // Additional validation for URL sources (connection test)
    if (type === "url") {
      return await this.validateURLConnection(config as URLSourceConfig)
    }

    // Additional validation for file sources (file existence)
    if (type === "file") {
      return await this.validateFileAccess()
    }

    return basicValidation
  }

  /**
   * Get sync history for a source
   */
  getSyncHistory(): SyncHistoryEntry[] {
    // This is a synchronous method that returns cached history
    // The actual loading from storage happens in the background
    // For now, we'll return an empty array and implement async loading later
    return []
  }

  /**
   * Clear sync history for a source
   */
  async clearSyncHistory(sourceId: string): Promise<void> {
    await this.storage.clearSyncHistory(sourceId)
  }

  /**
   * Add event listener
   */
  on(
    eventType: string,
    handler: (event: LiveSpecSourceServiceEvent) => void
  ): void {
    this.eventEmitter.on(eventType, handler)
  }

  /**
   * Remove event listener
   */
  off(
    eventType: string,
    handler: (event: LiveSpecSourceServiceEvent) => void
  ): void {
    this.eventEmitter.off(eventType, handler)
  }

  // Private helper methods

  /**
   * Update source status and emit event
   */
  private async updateSourceStatus(
    sourceId: string,
    status: LiveSpecSource["status"]
  ): Promise<void> {
    const source = this.sources.get(sourceId)
    if (source && source.status !== status) {
      source.status = status
      source.updatedAt = new Date()
      this.sources.set(sourceId, source)
      await this.saveSourcesToStorage()

      this.eventEmitter.emit({
        type: "status-changed",
        sourceId,
        status,
      })
    }
  }

  /**
   * Perform the actual synchronization
   */
  private async performSync(source: LiveSpecSource): Promise<SyncResult> {
    if (source.type === "url") {
      return await this.syncFromURL(source.config as URLSourceConfig)
    } else if (source.type === "file") {
      return await this.syncFromFile(source.config as FileSourceConfig)
    }
    throw new Error(`Unsupported source type: ${source.type}`)
  }

  /**
   * Sync from URL source using the OpenAPI fetcher
   */
  private async syncFromURL(config: URLSourceConfig): Promise<SyncResult> {
    try {
      const fetchOptions = {
        timeout: config.timeout || 10000,
        headers: config.headers || {},
        retries: 2,
        followRedirects: true,
      }

      const result = await this.fetcher.fetchSpec(config.url, fetchOptions)

      if (result.success && result.content) {
        return {
          success: true,
          hasChanges: true, // For Phase 1, assume changes
          changesSummary: ["Specification updated from URL"],
          errors: [],
          specVersion: result.metadata.statusCode?.toString() || "unknown",
          timestamp: result.metadata.timestamp,
        }
      }
      return {
        success: false,
        hasChanges: false,
        changesSummary: [],
        errors: result.errors,
        timestamp: result.metadata.timestamp,
      }
    } catch (error) {
      throw new Error(
        `Failed to sync from URL: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }

  /**
   * Sync from file source
   */
  private async syncFromFile(config: FileSourceConfig): Promise<SyncResult> {
    // For Phase 1, we'll simulate file reading
    // In a real implementation, this would use Node.js fs module or browser File API
    try {
      // Simulate file reading delay
      await new Promise((resolve) => setTimeout(resolve, 100))

      // For now, we'll return a success result
      // In Phase 2, we'll implement actual file reading and diff detection
      return {
        success: true,
        hasChanges: true, // Assume changes for now
        changesSummary: ["Specification updated from file"],
        errors: [],
        specVersion: generateContentHash(
          `file:${config.filePath}:${Date.now()}`
        ),
        timestamp: new Date(),
      }
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }

  /**
   * Validate URL connection using the OpenAPI fetcher
   */
  private async validateURLConnection(
    config: URLSourceConfig
  ): Promise<SourceValidationResult> {
    try {
      const testResult = await this.fetcher.testConnection(config.url, {
        timeout: config.timeout || 5000,
        headers: config.headers || {},
      })

      const errors: string[] = []
      const warnings: string[] = []

      if (!testResult.isReachable || testResult.errors.length > 0) {
        errors.push(...testResult.errors)
      }

      if (testResult.isReachable && !testResult.corsEnabled) {
        warnings.push(
          "CORS may not be enabled - this could cause issues in browser environments"
        )
      }

      // Add framework-specific suggestions as warnings
      if (testResult.suggestions.length > 0) {
        warnings.push(...testResult.suggestions)
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      }
    } catch (error) {
      return {
        isValid: false,
        errors: [
          `Connection test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
        warnings: [],
      }
    }
  }

  /**
   * Validate file access
   */
  private async validateFileAccess(): Promise<SourceValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    // For Phase 1, we'll do basic validation
    // In Phase 2, we'll implement actual file system access checks

    try {
      // Simulate file access check
      await new Promise((resolve) => setTimeout(resolve, 50))

      // For now, we'll assume the file is accessible
      // In a real implementation, we'd check file existence and permissions
    } catch (error) {
      errors.push(
        `File access error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Detect framework from source configuration
   */
  private detectFramework(
    config: URLSourceConfig | FileSourceConfig,
    type: LiveSpecSourceType
  ): string {
    if (type === "url") {
      const detection = detectFrameworkFromUrl((config as URLSourceConfig).url)
      return detection.frameworks[0]?.name || "unknown"
    } else if (type === "file") {
      const detection = detectFrameworkFromFilePatterns([
        (config as FileSourceConfig).filePath,
      ])
      return detection.frameworks[0]?.name || "unknown"
    }
    return "unknown"
  }

  /**
   * Get framework-specific error guidance
   */
  getFrameworkGuidance(sourceId: string, error: string): string[] {
    const source = this.sources.get(sourceId)
    if (!source) {
      return ["Source not found"]
    }

    const frameworkName = this.detectFramework(source.config, source.type)

    if (frameworkName) {
      return getFrameworkErrorGuidance(frameworkName, error)
    }

    return ["Unable to provide specific guidance for unknown framework"]
  }
}

/**
 * Default instance of the live spec source service
 */
export const liveSpecSourceService = new LiveSpecSourceServiceImpl()
