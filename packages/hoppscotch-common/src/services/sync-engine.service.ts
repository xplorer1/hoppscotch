/**
 * Sync Engine Service
 *
 * Orchestrates live sync between code-first APIs and Hoppscotch collections
 */
import { FileWatcherImpl } from "./file-watcher.service"
import { SpecDiffEngine } from "~/helpers/live-spec-source/spec-diff-engine"
import { detectFrameworkComprehensive } from "~/helpers/live-spec-source/framework-detection"
import {
  createCodeFirstCollection,
  updateCollectionSyncStatus,
  findCollectionBySourceId,
} from "~/newstore/collections"
import {
  LiveSyncCollection,
  SyncConflict,
} from "~/types/live-collection-metadata"
import { SpecDiffResult } from "~/types/spec-diff"
import { makeCollection } from "@hoppscotch/data"

export interface SyncEngineConfig {
  autoSync?: boolean
  conflictResolution?: "user-wins" | "code-wins" | "prompt"
  debounceMs?: number
  maxRetries?: number
}

export interface SyncResult {
  success: boolean
  collectionId?: string
  changes?: SpecDiffResult
  conflicts?: SyncConflict[]
  errors?: string[]
  warnings?: string[]
}

/**
 * Main sync engine that coordinates live sync operations
 */
export class SyncEngineService {
  private fileWatcher: FileWatcherImpl
  private diffEngine: SpecDiffEngine
  private config: SyncEngineConfig
  private activeSyncs = new Map<string, Promise<SyncResult>>()

  constructor(config: SyncEngineConfig = {}) {
    this.config = {
      autoSync: true,
      conflictResolution: "prompt",
      debounceMs: 500,
      maxRetries: 3,
      ...config,
    }

    this.fileWatcher = new FileWatcherImpl()
    this.diffEngine = new SpecDiffEngine({
      detectBreakingChanges: true,
      preserveUserCustomizations: true,
    })

    this.setupFileWatcherEvents()
  }

  /**
   * Start watching a code-first API source
   */
  async startWatching(sourceConfig: {
    sourceId: string
    type: "url" | "file"
    path: string
    collectionName?: string
    framework?: string
  }): Promise<SyncResult> {
    try {
      // Step 1: Fetch initial spec
      const initialSpec = await this.fetchSpec(
        sourceConfig.type,
        sourceConfig.path
      )
      if (!initialSpec) {
        return {
          success: false,
          errors: [`Failed to fetch initial spec from ${sourceConfig.path}`],
        }
      }

      // Step 2: Detect framework if not provided
      let framework = sourceConfig.framework
      if (!framework) {
        const detection = await this.detectFramework(
          sourceConfig.type,
          sourceConfig.path
        )
        framework = detection.frameworks[0]?.name || "unknown"
      }

      // Step 3: Create or update collection
      const existingCollection = findCollectionBySourceId(sourceConfig.sourceId)
      if (existingCollection) {
        // Update existing collection
        return await this.syncExistingCollection(
          existingCollection,
          initialSpec
        )
      }
      // Create new collection
      return await this.createNewCollection(
        sourceConfig,
        initialSpec,
        framework
      )
    } catch (error) {
      return {
        success: false,
        errors: [
          `Sync engine error: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      }
    }
  } /**

   * Stop watching a source
   */
  async stopWatching(sourceId: string): Promise<void> {
    const collection = findCollectionBySourceId(sourceId)
    if (collection?.liveMetadata?.filePath) {
      await this.fileWatcher.unwatchFile(collection.liveMetadata.filePath)
    }
  }

  /**
   * Manually trigger sync for a source
   */
  async triggerSync(sourceId: string): Promise<SyncResult> {
    // Prevent concurrent syncs for the same source
    if (this.activeSyncs.has(sourceId)) {
      return await this.activeSyncs.get(sourceId)!
    }

    const syncPromise = this.performSync(sourceId)
    this.activeSyncs.set(sourceId, syncPromise)

    try {
      const result = await syncPromise
      return result
    } finally {
      this.activeSyncs.delete(sourceId)
    }
  }

  /**
   * Set up file watcher event handlers
   */
  private setupFileWatcherEvents(): void {
    this.fileWatcher.on("fileChanged", async (event) => {
      if (!this.config.autoSync) return

      // Find collection associated with this file
      const collection = this.findCollectionByFilePath(event.filePath)
      if (!collection?.liveMetadata?.sourceId) return

      // Trigger sync with debouncing
      setTimeout(() => {
        this.triggerSync(collection.liveMetadata!.sourceId)
      }, this.config.debounceMs)
    })
  }

  /**
   * Fetch OpenAPI spec from URL or file
   */
  private async fetchSpec(type: "url" | "file", path: string): Promise<any> {
    try {
      if (type === "url") {
        const response = await fetch(path)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        return await response.json()
      }
      // For file type, we'd need to implement file reading
      // This would typically be handled by the file watcher or a file service
      throw new Error("File-based specs not yet implemented")
    } catch (error) {
      console.error(`Failed to fetch spec from ${path}:`, error)
      return null
    }
  }

  /**
   * Detect framework from source
   */
  private async detectFramework(type: "url" | "file", path: string) {
    if (type === "url") {
      return detectFrameworkComprehensive({ url: path })
    }
    return detectFrameworkComprehensive({ filePaths: [path] })
  } /**
  
 * Create new collection from spec
   */
  private async createNewCollection(
    sourceConfig: any,
    spec: any,
    framework: string
  ): Promise<SyncResult> {
    try {
      // Convert OpenAPI spec to Hoppscotch collection
      const collection = await this.convertSpecToCollection(
        spec,
        sourceConfig.collectionName
      )

      // Generate spec hash for tracking
      const specHash = this.diffEngine.generateSpecHash(spec)

      // Create live sync collection
      createCodeFirstCollection(
        collection,
        sourceConfig.sourceId,
        { name: framework },
        specHash
      )

      // Start watching the file if it's a file source
      if (sourceConfig.type === "file") {
        await this.fileWatcher.watchFile(sourceConfig.path)
      }

      return {
        success: true,
        collectionId: sourceConfig.sourceId,
        changes: {
          hasChanges: true,
          changes: [],
          summary: {
            added: 1,
            modified: 0,
            removed: 0,
            breaking: 0,
            nonBreaking: 1,
          },
          oldSpecHash: "",
          newSpecHash: specHash,
          comparedAt: new Date(),
        },
      }
    } catch (error) {
      return {
        success: false,
        errors: [
          `Failed to create collection: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      }
    }
  }

  /**
   * Sync existing collection with new spec
   */
  private async syncExistingCollection(
    collection: LiveSyncCollection,
    newSpec: any
  ): Promise<SyncResult> {
    try {
      // Get the old spec (we'd need to store this)
      const oldSpec = await this.getStoredSpec(
        collection.liveMetadata!.sourceId
      )

      // Compare specs
      const diffResult = await this.diffEngine.compareSpecs(oldSpec, newSpec)

      if (!diffResult.hasChanges) {
        return {
          success: true,
          collectionId: collection.liveMetadata!.sourceId,
          changes: diffResult,
        }
      }

      // Apply changes to collection
      const conflicts = await this.applyChangesToCollection(
        collection,
        diffResult
      )

      // Update sync status
      const collectionIndex = this.findCollectionIndex(
        collection.liveMetadata!.sourceId
      )
      if (collectionIndex >= 0) {
        updateCollectionSyncStatus(
          collectionIndex,
          {
            success: true,
            specHash: diffResult.newSpecHash,
            changesSummary: diffResult.changes.map((c) => c.description),
          },
          conflicts
        )
      }

      return {
        success: true,
        collectionId: collection.liveMetadata!.sourceId,
        changes: diffResult,
        conflicts,
      }
    } catch (error) {
      return {
        success: false,
        errors: [
          `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      }
    }
  }

  // Helper methods for collection management
  private async convertSpecToCollection(spec: any, name?: string) {
    // Convert OpenAPI spec to Hoppscotch collection format
    // This would integrate with existing OpenAPI importer
    return makeCollection({
      name: name || spec.info?.title || "Generated API",
      folders: [],
      requests: [],
      auth: { authType: "inherit", authActive: true },
      headers: [],
    })
  }

  private async getStoredSpec(_sourceId: string): Promise<any> {
    // Retrieve previously stored spec for comparison
    // This would typically be stored in the collection metadata
    void _sourceId // Acknowledge unused parameter
    return {}
  }

  private async applyChangesToCollection(
    collection: LiveSyncCollection,
    diffResult: SpecDiffResult
  ): Promise<SyncConflict[]> {
    // Apply diff changes to the collection while preserving customizations
    const conflicts: SyncConflict[] = []

    for (const change of diffResult.changes) {
      try {
        // Apply each change based on its type
        switch (change.type) {
          case "endpoint-added":
            // Add new endpoint to collection
            break
          case "endpoint-modified":
            // Update existing endpoint, check for conflicts
            break
          case "endpoint-removed":
            // Remove endpoint, warn if user has customizations
            break
          case "parameter-changed":
            // Update parameter, preserve user values if possible
            break
          case "schema-changed":
            // Update schema, check for breaking changes
            break
        }
      } catch (error) {
        conflicts.push({
          type: "merge-conflict",
          path: change.path,
          description: `Failed to apply change: ${error instanceof Error ? error.message : "Unknown error"}`,
          userValue: undefined,
          codeValue: change.newValue,
          resolution: "manual",
        })
      }
    }

    return conflicts
  }

  private findCollectionByFilePath(
    _filePath: string
  ): LiveSyncCollection | null {
    // Find collection associated with a file path
    // This would search through collections for matching file paths
    void _filePath // Acknowledge unused parameter
    return null
  }

  private findCollectionIndex(_sourceId: string): number {
    void _sourceId // Acknowledge unused parameter
    // Find the index of a collection in the store
    // This would search the collections store
    return -1
  }

  private async performSync(sourceId: string): Promise<SyncResult> {
    // Perform the actual sync operation
    const collection = findCollectionBySourceId(sourceId)
    if (!collection) {
      return {
        success: false,
        errors: ["Collection not found"],
      }
    }

    // Get the source configuration
    const sourceConfig = collection.liveMetadata
    if (!sourceConfig) {
      return {
        success: false,
        errors: ["No live sync configuration found"],
      }
    }

    // Fetch the latest spec
    const latestSpec = await this.fetchSpec(
      sourceConfig.sourceType || "url",
      sourceConfig.sourceUrl || sourceConfig.filePath || ""
    )

    if (!latestSpec) {
      return {
        success: false,
        errors: ["Failed to fetch latest specification"],
      }
    }

    // Perform sync
    return await this.syncExistingCollection(collection, latestSpec)
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.fileWatcher.destroy()
  }
}
