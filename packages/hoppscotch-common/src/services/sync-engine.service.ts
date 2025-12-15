/**
 * Sync Engine Service
 *
 * Orchestrates live sync between code-first APIs and Hoppscotch collections
 */
// Note: FileWatcher is disabled in browser environment to avoid Node.js dependencies
// import { FileWatcherImpl } from "./file-watcher.service"
import { SpecDiffEngine } from "~/helpers/live-spec-source/spec-diff-engine"
import { detectFrameworkComprehensive } from "~/helpers/live-spec-source/framework-detection"
import { liveSpecSourceService } from "./live-spec-source.service"
import { getStatusCodeReasonPhrase } from "~/helpers/utils/statusCodes"
import { isNumeric } from "~/helpers/utils/number"
import {
  makeHoppRESTResponseOriginalRequest,
  HoppRESTRequestResponses,
  HoppRESTHeader,
} from "@hoppscotch/data"
import {
  createCodeFirstCollection,
  updateCollectionSyncStatus,
  findCollectionBySourceId,
  saveRESTRequestAs,
  editRESTRequest,
  addRESTFolder,
  restCollectionStore,
  getLiveSyncCollections,
  setCollectionLiveMetadata,
} from "~/newstore/collections"
import {
  LiveSyncCollection,
  SyncConflict,
} from "~/types/live-collection-metadata"
import { SpecDiffResult } from "~/types/spec-diff"
import {
  makeCollection,
  makeRESTRequest,
  HoppRESTRequest,
} from "@hoppscotch/data"
import type { URLSourceConfig } from "~/types/live-spec-source"

export interface StoredSpec {
  sourceId: string
  spec: any // OpenAPI specification
  hash: string
  timestamp: Date
  url: string // Source URL for reference
}

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
  // Note: FileWatcher disabled in browser environment
  // private fileWatcher: FileWatcherImpl
  private diffEngine: SpecDiffEngine
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private config: SyncEngineConfig
  private activeSyncs = new Map<string, Promise<SyncResult>>()

  // Spec storage for change comparison
  private storedSpecs = new Map<string, StoredSpec>()
  private readonly MAX_STORED_SPECS = 100 // Prevent memory leaks

  constructor(config: SyncEngineConfig = {}) {
    this.config = {
      autoSync: true,
      conflictResolution: "prompt",
      debounceMs: 500,
      maxRetries: 3,
      ...config,
    }

    // Note: FileWatcher disabled in browser environment
    // this.fileWatcher = new FileWatcherImpl()
    this.diffEngine = new SpecDiffEngine({
      detectBreakingChanges: true,
      preserveUserCustomizations: true,
    })

    // Touch config to satisfy noUnusedLocals in TS
    void this.config

    // Note: File watcher events disabled in browser environment
    // this.setupFileWatcherEvents()
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
  }

  /**
   * Stop watching a source
   */
  async stopWatching(sourceId: string): Promise<void> {
    const collection = findCollectionBySourceId(sourceId)
    void collection // Acknowledge unused parameter
    // Note: filePath would be part of source config, not metadata
    // This is a placeholder for file watching cleanup
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
  }

  /**
   * Store specification for future comparison
   */
  storeSpec(sourceId: string, spec: any, url: string): void {
    try {
      // Generate hash for the spec (using fallback since generateSpecHash is private)
      const hash = this.generateFallbackHash(spec)

      const storedSpec: StoredSpec = {
        sourceId,
        spec: JSON.parse(JSON.stringify(spec)), // Deep clone to prevent mutations
        hash,
        timestamp: new Date(),
        url,
      }

      this.storedSpecs.set(sourceId, storedSpec)

      // Cleanup old specs if we exceed the limit
      if (this.storedSpecs.size > this.MAX_STORED_SPECS) {
        this.cleanupOldSpecs()
      }
    } catch (error) {
      console.error(`Failed to store spec for ${sourceId}:`, error)
    }
  }

  /**
   * Retrieve previously stored specification
   */
  getStoredSpec(sourceId: string): any | null {
    const stored = this.storedSpecs.get(sourceId)
    if (!stored) {
      return null
    }

    return stored.spec
  }

  /**
   * Generate fallback hash if diffEngine method is not accessible
   */
  private generateFallbackHash(spec: any): string {
    const str = JSON.stringify(spec)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & 0xffffffff // Convert to 32-bit integer
    }
    return hash.toString(16)
  }

  /**
   * Clean up old stored specs to prevent memory leaks
   */
  private cleanupOldSpecs(): void {
    const entries = Array.from(this.storedSpecs.entries())

    // Sort by timestamp, oldest first
    entries.sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())

    // Remove oldest entries until we're under the limit
    const toRemove = entries.length - Math.floor(this.MAX_STORED_SPECS * 0.8) // Remove 20% when cleanup
    for (let i = 0; i < toRemove; i++) {
      const [sourceId] = entries[i]
      this.storedSpecs.delete(sourceId)
    }
  }

  /**
  
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
      const specHash = (this.diffEngine as any).generateSpecHash(spec) // Access private method

      // Create live sync collection
      createCodeFirstCollection(
        collection,
        sourceConfig.sourceId,
        { name: framework },
        specHash
      )

      // Note: File watching disabled in browser environment
      // Start watching the file if it's a file source
      // if (sourceConfig.type === "file") {
      //   await this.fileWatcher.watchFile(sourceConfig.path)
      // }

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
    const sourceId = collection.liveMetadata?.sourceId || ""

    try {
      // Get the old spec from storage
      const oldSpec = this.getStoredSpec(sourceId)

      if (!oldSpec) {
        // First sync - no comparison needed, just apply the spec
        const conflicts = await this.applyChangesToCollection(
          collection,
          {
            hasChanges: true,
            changes: [], // No specific changes for initial sync
            summary: {
              added: Object.keys(newSpec?.paths || {}).length,
              modified: 0,
              removed: 0,
              breaking: 0,
              nonBreaking: Object.keys(newSpec?.paths || {}).length,
            },
            oldSpecHash: "",
            newSpecHash: this.generateFallbackHash(newSpec),
            comparedAt: new Date(),
          },
          newSpec,
          sourceId
        )

        // Update sync status
        const collectionIndex = this.findCollectionIndex(sourceId, collection)
        if (collectionIndex >= 0) {
          updateCollectionSyncStatus(
            collectionIndex,
            {
              success: true,
              specHash: this.generateFallbackHash(newSpec),
              changesSummary: ["Initial sync completed"],
            },
            conflicts
          )
        }

        return {
          success: true,
          collectionId: sourceId,
          changes: {
            hasChanges: true,
            changes: [],
            summary: {
              added: Object.keys(newSpec?.paths || {}).length,
              modified: 0,
              removed: 0,
              breaking: 0,
              nonBreaking: Object.keys(newSpec?.paths || {}).length,
            },
            oldSpecHash: "",
            newSpecHash: this.generateFallbackHash(newSpec),
            comparedAt: new Date(),
          },
          conflicts,
        }
      }

      // Compare specs using diff engine
      const diffResult = await this.diffEngine.compareSpecs(oldSpec, newSpec)

      if (!diffResult.hasChanges) {
        return {
          success: true,
          collectionId: sourceId,
          changes: diffResult,
        }
      }

      // Apply changes to collection
      const conflicts = await this.applyChangesToCollection(
        collection,
        diffResult,
        newSpec,
        sourceId
      )

      // Update sync status
      const collectionIndex = this.findCollectionIndex(sourceId, collection)
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
        collectionId: sourceId,
        changes: diffResult,
        conflicts,
      }
    } catch (error) {
      console.error(`Sync failed for ${sourceId}:`, error)
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

  // Note: getStoredSpec method moved above and is no longer async

  private async applyChangesToCollection(
    collection: LiveSyncCollection,
    diffResult: SpecDiffResult,
    newSpec?: any,
    sourceIdParam?: string
  ): Promise<SyncConflict[]> {
    const conflicts: SyncConflict[] = []
    const sourceId = sourceIdParam || collection.liveMetadata?.sourceId || ""

    // If this is an initial sync with no specific changes, rebuild the entire collection
    if (diffResult.changes.length === 0 && diffResult.hasChanges) {
      return await this.rebuildCollectionFromSpec(collection, sourceId)
    }

    // First pass: detect URL changes (removed + added with same operation)
    const urlChanges = this.detectUrlChanges(diffResult.changes)

    // Create a reverse map: new path → urlChange info
    const urlChangesByNewPath = new Map<
      string,
      {
        oldPath: string
        newPath: string
        oldMethod: string
        newMethod: string
        operation: any
      }
    >()
    for (const [, urlChange] of urlChanges) {
      const newEndpointPath = `${urlChange.newMethod} ${urlChange.newPath}`
      urlChangesByNewPath.set(newEndpointPath, urlChange)
    }

    // Apply individual changes (skip URL changes that we'll handle specially)
    const processedUrlChanges = new Set<string>()

    // Collect metadata and parameter changes for old paths that have URL changes
    // We'll merge these into the URL change handling
    const metadataChangesForUrlChanges = new Map<string, any[]>()
    const parameterChangesForUrlChanges = new Map<string, any[]>()

    for (const change of diffResult.changes) {
      // Check if this change is for an endpoint that has a URL change
      let matchingUrlChange = null
      for (const [, urlChange] of urlChanges) {
        const oldEndpointPath = `${urlChange.oldMethod} ${urlChange.oldPath}`
        const newEndpointPath = `${urlChange.newMethod} ${urlChange.newPath}`

        // Check if change path matches old or new endpoint path (for metadata changes)
        if (
          change.path === oldEndpointPath ||
          change.path === newEndpointPath
        ) {
          matchingUrlChange = { oldEndpointPath, urlChange }
          break
        }

        // Check if change path starts with old or new endpoint path (for parameter changes)
        if (
          change.path.startsWith(`${oldEndpointPath}/parameters/`) ||
          change.path.startsWith(`${newEndpointPath}/parameters/`)
        ) {
          matchingUrlChange = { oldEndpointPath, urlChange }
          break
        }
      }

      if (matchingUrlChange) {
        const { oldEndpointPath } = matchingUrlChange

        if (change.type === "endpoint-modified") {
          // This is a metadata change (summary, description, tags, etc.)
          if (!metadataChangesForUrlChanges.has(oldEndpointPath)) {
            metadataChangesForUrlChanges.set(oldEndpointPath, [])
          }
          metadataChangesForUrlChanges.get(oldEndpointPath)!.push(change)
        } else if (
          change.type === "parameter-added" ||
          change.type === "parameter-modified" ||
          change.type === "parameter-removed"
        ) {
          // This is a parameter change
          if (!parameterChangesForUrlChanges.has(oldEndpointPath)) {
            parameterChangesForUrlChanges.set(oldEndpointPath, [])
          }
          parameterChangesForUrlChanges.get(oldEndpointPath)!.push(change)
        }
      }
    }

    for (const change of diffResult.changes) {
      try {
        // Skip if this is part of a URL change that we'll handle
        let urlChange = urlChanges.get(change.path)
        if (!urlChange) {
          urlChange = urlChangesByNewPath.get(change.path)
        }

        if (urlChange) {
          // Check if this change is part of a URL/method change
          const oldEndpointPath = `${urlChange.oldMethod} ${urlChange.oldPath}`
          const newEndpointPath = `${urlChange.newMethod} ${urlChange.newPath}`

          if (
            change.path === oldEndpointPath &&
            change.type === "endpoint-removed"
          ) {
            // Handle URL change as update (only process once when we encounter the removal)
            if (!processedUrlChanges.has(oldEndpointPath)) {
              // Merge any metadata changes (summary, description, tags, etc.) into the URL change
              const metadataChanges =
                metadataChangesForUrlChanges.get(oldEndpointPath) || []
              if (metadataChanges.length > 0) {
                // Merge the metadata changes into the new operation
                // The urlChange.operation already has the new operation from the addition change,
                // but we want to ensure all metadata fields (summary, description, tags, operationId) are preserved
                for (const metadataChange of metadataChanges) {
                  if (metadataChange.newValue) {
                    // Merge specific metadata fields explicitly to ensure nothing is lost
                    const newOp = metadataChange.newValue
                    if (newOp.summary !== undefined) {
                      urlChange.operation.summary = newOp.summary
                    }
                    if (newOp.description !== undefined) {
                      urlChange.operation.description = newOp.description
                    }
                    if (newOp.operationId !== undefined) {
                      urlChange.operation.operationId = newOp.operationId
                    }
                    if (newOp.tags !== undefined) {
                      urlChange.operation.tags = newOp.tags
                    }
                    // Also merge any other top-level operation fields that might have changed
                    // but preserve the operation structure (parameters, requestBody, responses come from addition)
                    Object.keys(newOp).forEach((key) => {
                      if (
                        ![
                          "parameters",
                          "requestBody",
                          "responses",
                          "security",
                        ].includes(key)
                      ) {
                        if (newOp[key] !== undefined) {
                          urlChange.operation[key] = newOp[key]
                        }
                      }
                    })
                  }
                }
              }

              // Note: Parameter changes don't need explicit merging because
              // urlChange.operation already contains the full new operation from the addition change,
              // which includes all updated parameters. The createRequestFromSpec will extract them correctly.
              const paramChanges =
                parameterChangesForUrlChanges.get(oldEndpointPath) || []
              if (paramChanges.length > 0) {
              }

              await this.handleUrlChange(
                collection,
                urlChange,
                newSpec,
                sourceId
              )
              processedUrlChanges.add(oldEndpointPath)
              processedUrlChanges.add(newEndpointPath)
              // Also mark the operation ID or summary if available to prevent duplicates
              if (urlChange.operation.operationId) {
                processedUrlChanges.add(
                  `operationId:${urlChange.operation.operationId}`
                )
              }
            }
          }

          // Skip removal, addition, metadata changes, AND parameter changes if they're part of a URL change
          if (
            change.path === oldEndpointPath ||
            change.path === newEndpointPath
          ) {
            continue
          }

          // Also skip parameter changes that belong to this URL change
          if (
            change.path.startsWith(`${oldEndpointPath}/parameters/`) ||
            change.path.startsWith(`${newEndpointPath}/parameters/`)
          ) {
            continue
          }
        }

        // Skip if already processed as URL change
        if (processedUrlChanges.has(change.path)) {
          continue
        }

        switch (change.type) {
          case "endpoint-added":
            // Check if this addition was already handled as part of a URL change
            // by checking if the path matches any URL change's new path
            const urlChangeForAddition = urlChangesByNewPath.get(change.path)
            if (urlChangeForAddition) {
              // This was part of a URL change - skip it (should have been handled)
              continue
            }
            await this.addEndpointToCollection(
              collection,
              {
                ...change,
                spec: newSpec,
              },
              sourceId
            )
            break
          case "endpoint-modified":
            try {
              await this.updateEndpointInCollection(
                collection,
                {
                  ...change,
                  spec: newSpec,
                },
                sourceId
              )
            } catch (error) {
              console.error(`Failed to update endpoint ${change.path}:`, error)
              throw error
            }
            break
          case "endpoint-removed":
            await this.removeEndpointFromCollection(collection, change)
            break
          case "parameter-added":
          case "parameter-modified":
          case "parameter-removed":
            await this.updateEndpointParameters(collection, change)
            break
          default:
        }
      } catch (error) {
        console.error(
          `Failed to apply change ${change.type} - ${change.path}:`,
          error
        )
        conflicts.push({
          type: "endpoint-modified",
          path: change.path,
          description: `Failed to apply change: ${error instanceof Error ? error.message : "Unknown error"}`,
          userVersion: undefined,
          codeVersion: change.newValue,
          resolution: "use-code",
        })
      }
    }

    return conflicts
  }

  /**
   * Rebuild entire collection from spec (for initial sync)
   */
  private async rebuildCollectionFromSpec(
    collection: LiveSyncCollection,
    sourceId: string
  ): Promise<SyncConflict[]> {
    const conflicts: SyncConflict[] = []

    try {
      // Get the current spec
      const source = liveSpecSourceService.getSource(sourceId)
      if (!source) {
        throw new Error(`Source not found: ${sourceId}`)
      }

      const fetchResult = await liveSpecSourceService.fetchSpec(sourceId)
      if (!fetchResult.success || !fetchResult.spec) {
        throw new Error(
          `Failed to fetch spec: ${fetchResult.error || "Unknown error"}`
        )
      }

      const spec = fetchResult.spec
      const paths = spec.paths || {}
      const endpointCount = Object.keys(paths).length

      if (endpointCount === 0) {
        return conflicts
      }

      // Use OpenAPI importer to rebuild collection with proper folder structure
      const { hoppOpenAPIImporter } = await import(
        "~/helpers/import-export/import/importers"
      )

      // Convert spec to JSON string for importer
      const specString = JSON.stringify(spec)
      const importResult = await hoppOpenAPIImporter([specString])()

      if (importResult._tag === "Right" && importResult.right.length > 0) {
        const importedCollection = importResult.right[0]

        // Replace the existing collection with the newly imported one
        const collectionIndex = this.findCollectionIndex(sourceId, collection)
        if (collectionIndex >= 0) {
          // Clear existing collection
          collection.folders = []
          collection.requests = []

          // Apply imported structure
          collection.folders = importedCollection.folders
          collection.requests = importedCollection.requests

          // Preserve live metadata
          collection.name = importedCollection.name || collection.name
        }
      } else {
        console.error(`Failed to import spec for ${sourceId}`)
        conflicts.push({
          type: "endpoint-modified",
          path: "collection",
          description: "Failed to rebuild collection with OpenAPI importer",
          userVersion: undefined,
          codeVersion: undefined,
          resolution: "use-code",
        })
      }

      return conflicts
    } catch (error) {
      console.error(`Failed to rebuild collection for ${sourceId}:`, error)
      return [
        {
          type: "endpoint-modified",
          path: "collection",
          description: `Failed to rebuild collection: ${error instanceof Error ? error.message : "Unknown error"}`,
          userVersion: undefined,
          codeVersion: undefined,
          resolution: "use-code",
        },
      ]
    }
  }

  /**
   * Add a new endpoint to the collection
   */
  private async addEndpointToCollection(
    collection: LiveSyncCollection,
    change: any,
    sourceId?: string
  ): Promise<void> {
    // Parse the endpoint path (format: "GET /users/{id}")
    const [method, path] = change.path.split(" ", 2)

    if (!method || !path) {
      throw new Error(`Invalid endpoint path format: ${change.path}`)
    }

    const resolvedSourceId = sourceId || collection.liveMetadata?.sourceId || ""
    const collectionIndex = this.findCollectionIndex(
      resolvedSourceId,
      collection
    )
    if (collectionIndex < 0) {
      throw new Error("Collection not found in store")
    }

    const collectionInStore = restCollectionStore.value.state[
      collectionIndex
    ] as LiveSyncCollection | undefined
    const collectionForSearch = collectionInStore || collection

    // Check for duplicates before adding - match by path only (ignore method for duplicate check)
    // This prevents adding duplicates when method changes weren't detected as URL changes
    const existingByPath = this.findRequestInCollection(
      collectionForSearch,
      `ANY ${path}`, // Use ANY to match any method
      path
    )

    if (existingByPath) {
      // Found an existing request with the same path - treat as update instead
      await this.updateEndpointInCollection(
        collectionForSearch,
        {
          ...change,
          oldValue: {
            method: existingByPath.request.method,
            path: path,
          },
        },
        resolvedSourceId
      )
      return
    }

    // Create a new REST request from the spec
    const operation = change.newValue
    const spec = change.spec

    // Extract tags from the spec operation
    const tags = operation.tags || []

    // Create a complete request using createRequestFromSpec
    const request = this.createRequestFromSpec(path, method, operation, spec)

    // Use saveRESTRequestAs to add request properly (this maintains reactivity)
    const basePath = collectionIndex.toString()
    let fullPath = basePath

    if (tags.length > 0) {
      // Find or create folder for the first tag
      const folderName = tags[0]
      let folderIndex = collectionForSearch.folders.findIndex(
        (f) => f.name === folderName
      )

      if (folderIndex < 0) {
        // Folder doesn't exist, create it
        addRESTFolder(folderName, basePath)

        // Re-read the collection to get the updated folder index
        // The folder should be at the end of the folders array
        const updatedCollection =
          restCollectionStore.value.state[collectionIndex]
        folderIndex = updatedCollection.folders.findIndex(
          (f) => f.name === folderName
        )

        if (folderIndex < 0) {
          // Still not found, add to root as fallback
          console.warn(
            `Failed to create folder "${folderName}", adding endpoint to collection root`
          )
          fullPath = basePath
        } else {
          fullPath = `${basePath}/${folderIndex}`
        }
      } else {
        fullPath = `${basePath}/${folderIndex}`
      }
    }

    saveRESTRequestAs(fullPath, request)
  }

  /**
   * Update an existing endpoint in the collection
   */
  private async updateEndpointInCollection(
    collection: LiveSyncCollection,
    change: any,
    sourceId?: string
  ): Promise<void> {
    // Parse the endpoint path (format: "GET /users/{id}")
    const [method, path] = change.path.split(" ", 2)

    if (!method || !path) {
      throw new Error(`Invalid endpoint path format: ${change.path}`)
    }

    // Debug: Log method/description updates
    if (
      change.description &&
      (change.description.includes("Summary changed") ||
        change.description.includes("Description changed") ||
        change.description.includes("Method changed"))
    ) {
      console.log(`[Live Sync] Updating endpoint: ${change.path}`, {
        description: change.description,
        hasOldValue: !!change.oldValue,
        hasNewValue: !!change.newValue,
      })
    }

    const resolvedSourceId = sourceId || collection.liveMetadata?.sourceId || ""
    const collectionIndex = this.findCollectionIndex(
      resolvedSourceId,
      collection
    )
    if (collectionIndex < 0) {
      throw new Error("Collection not found in store")
    }

    const collectionInStore = restCollectionStore.value.state[
      collectionIndex
    ] as LiveSyncCollection | undefined
    const collectionForSearch = collectionInStore || collection

    // Find the existing request - try multiple strategies:
    // 1. By new path and method
    // 2. By old path and method (from oldValue)
    // 3. By path only (any method) - in case method changed
    let existingRequestInfo = this.findRequestInCollection(
      collectionForSearch,
      change.path,
      path
    )

    if (!existingRequestInfo && change.oldValue) {
      // Try to match by old path/method
      const oldMethod = change.oldValue.method || change.path.split(" ", 2)[0]
      const oldPath =
        change.oldValue.path ||
        this.extractPathFromChange(change.oldValue, change.path)
      const oldEndpointPath = `${oldMethod} ${oldPath}`
      existingRequestInfo = this.findRequestInCollection(
        collectionForSearch,
        oldEndpointPath,
        oldPath
      )
    }

    if (!existingRequestInfo) {
      // Try matching by path only (any method) - useful when method changes weren't detected
      existingRequestInfo = this.findRequestInCollection(
        collectionForSearch,
        `ANY ${path}`,
        path
      )
    }

    if (!existingRequestInfo) {
      const availableEndpoints =
        this.getCollectionEndpointSummary(collectionForSearch)
      console.warn(
        `[Live Sync] Could not find existing request for ${change.path}`,
        availableEndpoints
      )
      // Request not found - treat as new endpoint
      await this.addEndpointToCollection(
        collection,
        {
          ...change,
          spec: change.spec || {},
        },
        resolvedSourceId
      )
      return
    }

    const { request, folderPath, requestIndex } = existingRequestInfo

    // Create updated request, preserving existing responses and customizations
    const operation = change.newValue
    const spec = change.spec || {}

    // Preserve responses and other user customizations
    const updatedRequest = this.createRequestFromSpec(
      path,
      method,
      operation,
      spec
    )
    updatedRequest.responses = request.responses || {} // Preserve existing responses

    // Update name if summary/operationId changed (unless user customized it)
    // Check if the old name matches what the old spec would have generated
    const oldOperation = change.oldValue || {}
    const oldExpectedName =
      oldOperation.summary || oldOperation.operationId || `${method} ${path}`
    const wasNameFromSpec = request.name === oldExpectedName

    // Get the new operation's summary/operationId from newValue (which has the full operation)
    const newOperation = change.newValue || operation
    const newExpectedName =
      newOperation.summary || newOperation.operationId || `${method} ${path}`

    if (wasNameFromSpec) {
      // Name came from spec, update it with new summary/operationId
      // Use the new name from the operation (might be from merged metadata in URL changes)
      updatedRequest.name = newExpectedName
    } else {
      // Name was customized, preserve it
      updatedRequest.name = request.name
    }

    // Update the request in place using editRESTRequest
    // Preserve folder structure by using the existing folderPath
    const fullPath =
      folderPath !== undefined
        ? `${collectionIndex}/${folderPath}`
        : collectionIndex.toString()
    editRESTRequest(fullPath, requestIndex, updatedRequest)
  }

  private normalizeEndpointPath(path: string): string {
    let normalized = (path || "")
      // Remove {{baseURL}} variable
      .replace(/{{baseURL}}/g, "")
      // Remove full URLs (http://host:port or https://host:port)
      .replace(/^https?:\/\/[^\/]+/i, "")
      // Normalize path parameters: convert both {param} and <<param>> to a common format
      // Convert Hoppscotch format <<param>> to OpenAPI format {param}
      .replace(/<<([^>]+)>>/g, "{$1}")
      // Normalize slashes
      .replace(/^\/+/, "/")
      .replace(/\/+$/, "")
    
    return normalized || "/"
  }

  private getCollectionEndpointSummary(
    collection: LiveSyncCollection
  ): string[] {
    const endpoints: string[] = []

    const addEndpoint = (request: HoppRESTRequest | undefined) => {
      if (!request) return
      const normalizedPath = this.normalizeEndpointPath(request.endpoint || "")
      const method = (request.method || "UNKNOWN").toString().toUpperCase()
      endpoints.push(`${method} ${normalizedPath}`)
    }

    collection.folders.forEach((folder) => {
      folder.requests.forEach((req: unknown) =>
        addEndpoint(req as HoppRESTRequest)
      )
    })

    collection.requests.forEach((req: unknown) =>
      addEndpoint(req as HoppRESTRequest)
    )

    return endpoints
  }

  /**
   * Find a request in the collection by matching method and path
   */
  private findRequestInCollection(
    collection: LiveSyncCollection,
    endpointPath: string, // Format: "GET /users" or "/users"
    matchPath: string // The actual path to match (might be old or new)
  ): {
    request: HoppRESTRequest
    folderPath?: number
    requestIndex: number
  } | null {
    // Parse endpoint to get method and path if needed
    const parts = endpointPath.split(" ", 2)
    const method = parts.length === 2 ? parts[0].toUpperCase() : null

    // Normalize matchPath (remove {baseURL} and extra slashes, exact match preferred)
    const normalizedMatchPath = this.normalizeEndpointPath(matchPath)

    console.log(`[findRequestInCollection] Looking for: method=${method}, path="${normalizedMatchPath}"`)

    // If method is "ANY", we're doing a path-only match (ignore method)
    const matchAnyMethod = method === "ANY"

    // Search in folders first
    for (
      let folderIndex = 0;
      folderIndex < collection.folders.length;
      folderIndex++
    ) {
      const folder = collection.folders[folderIndex]
      for (let i = 0; i < folder.requests.length; i++) {
        const request = folder.requests[i]
        const requestPath = this.normalizeEndpointPath(request.endpoint)
        const matchesMethod =
          matchAnyMethod ||
          !method ||
          (request.method && request.method.toUpperCase() === method)

        // Exact path match preferred, fallback to contains for parameter variations
        const matchesPath =
          requestPath === normalizedMatchPath ||
          requestPath === normalizedMatchPath + "/" ||
          normalizedMatchPath === requestPath + "/" ||
          (requestPath.includes(normalizedMatchPath) &&
            normalizedMatchPath.length > 3) // Only use contains for substantial paths

        console.log(`[findRequestInCollection] Checking folder ${folderIndex}, request ${i}: "${request.name}" method=${request.method}, path="${requestPath}", matchesMethod=${matchesMethod}, matchesPath=${matchesPath}`)

        if (matchesMethod && matchesPath) {
          return { request, folderPath: folderIndex, requestIndex: i }
        }
      }
    }

    // Search in root requests
    for (let i = 0; i < collection.requests.length; i++) {
      const request = collection.requests[i] as HoppRESTRequest
      const requestPath = this.normalizeEndpointPath(request.endpoint as string)
      const matchesMethod =
        matchAnyMethod ||
        !method ||
        (request.method && request.method.toUpperCase() === method)

      // Exact path match preferred
      const matchesPath =
        requestPath === normalizedMatchPath ||
        requestPath === normalizedMatchPath + "/" ||
        normalizedMatchPath === requestPath + "/" ||
        (requestPath.includes(normalizedMatchPath) &&
          normalizedMatchPath.length > 3)

      if (matchesMethod && matchesPath) {
        return { request, requestIndex: i }
      }
    }

    return null
  }

  /**
   * Extract path from change oldValue or use fallback
   */
  private extractPathFromChange(oldValue: any, fallbackPath: string): string {
    // Try to extract path from oldValue if it has endpoint information
    if (oldValue?.operationId) {
      // Could try to match by operationId, but for now use fallback
      return fallbackPath.split(" ", 2)[1] || fallbackPath
    }
    return fallbackPath.split(" ", 2)[1] || fallbackPath
  }

  /**
   * Detect URL/method changes by pairing removed and added endpoints
   */
  private detectUrlChanges(changes: any[]): Map<
    string,
    {
      oldPath: string
      newPath: string
      oldMethod: string
      newMethod: string
      operation: any
    }
  > {
    const urlChanges = new Map<
      string,
      {
        oldPath: string
        newPath: string
        oldMethod: string
        newMethod: string
        operation: any
      }
    >()
    const removals = changes.filter((c) => c.type === "endpoint-removed")
    const additions = changes.filter((c) => c.type === "endpoint-added")

    console.log(`[detectUrlChanges] Found ${removals.length} removals and ${additions.length} additions`)
    removals.forEach(r => console.log(`  Removal: ${r.path}`))
    additions.forEach(a => console.log(`  Addition: ${a.path}`))

    for (const removal of removals) {
      const [removedMethod, removedPath] = removal.path.split(" ", 2)

      // Try to find a matching addition
      for (const addition of additions) {
        const [addedMethod, addedPath] = addition.path.split(" ", 2)

        const oldOp = removal.oldValue
        const newOp = addition.newValue

        // Match by operationId or summary (same operation)
        const sameOperationId =
          oldOp?.operationId &&
          newOp?.operationId &&
          oldOp.operationId === newOp.operationId
        const sameSummary =
          oldOp?.summary && newOp?.summary && oldOp.summary === newOp.summary

        // Check for:
        // 1. URL change: same method, different path
        // 2. Method change: same path, different method
        // 3. Combined change: different method AND different path (but same operation)
        // For URL changes, if operationId/summary match, it's definitely a URL/method change
        // If they don't match but paths are similar, it might still be a change (fallback)
        const isUrlChange =
          removedMethod === addedMethod && removedPath !== addedPath
        const isMethodChange =
          removedPath === addedPath && removedMethod !== addedMethod
        const isCombinedChange =
          removedPath !== addedPath && removedMethod !== addedMethod

        // Prefer matches with same operationId/summary, but also accept URL/method changes
        // when they're the only removal+addition pair for that method or path
        console.log(`[detectUrlChanges] Comparing: ${removal.path} vs ${addition.path}`)
        console.log(`  isMethodChange: ${isMethodChange}, isUrlChange: ${isUrlChange}, isCombinedChange: ${isCombinedChange}`)
        console.log(`  sameOperationId: ${sameOperationId}, sameSummary: ${sameSummary}`)
        console.log(`  oldOp.summary: "${oldOp?.summary}", newOp.summary: "${newOp?.summary}"`)
        
        if (
          (isUrlChange || isMethodChange || isCombinedChange) &&
          (sameOperationId ||
            sameSummary ||
            this.isLikelyUrlChange(removal, addition, removals, additions))
        ) {
          console.log(`[detectUrlChanges] MATCHED! ${removal.path} -> ${addition.path}`)
          urlChanges.set(removal.path, {
            oldPath: removedPath,
            newPath: addedPath,
            oldMethod: removedMethod,
            newMethod: addedMethod,
            operation: newOp,
          })
          break
        }
      }
    }

    return urlChanges
  }

  /**
   * Check if a removal+addition pair is likely a URL/method change
   * (fallback when operationId/summary don't match)
   */
  private isLikelyUrlChange(
    removal: any,
    addition: any,
    allRemovals: any[],
    allAdditions: any[]
  ): boolean {
    const [removedMethod, removedPath] = removal.path.split(" ", 2)
    const [addedMethod, addedPath] = addition.path.split(" ", 2)

    // Case 1: Same method, different path - check if only one removal+addition for this method
    if (removedMethod === addedMethod && removedPath !== addedPath) {
      const otherRemovalsForMethod = allRemovals.filter(
        (r) => r !== removal && r.path.startsWith(removedMethod)
      )
      const otherAdditionsForMethod = allAdditions.filter(
        (a) => a !== addition && a.path.startsWith(addedMethod)
      )

      // If there's only one removal and one addition for this method, likely a URL change
      if (
        otherRemovalsForMethod.length === 0 &&
        otherAdditionsForMethod.length === 0
      ) {
        return true
      }
    }

    // Case 2: Same path, different method - check if only one removal+addition for this path
    if (removedPath === addedPath && removedMethod !== addedMethod) {
      const otherRemovalsForPath = allRemovals.filter(
        (r) => r !== removal && r.path.endsWith(removedPath)
      )
      const otherAdditionsForPath = allAdditions.filter(
        (a) => a !== addition && a.path.endsWith(addedPath)
      )

      // If there's only one removal and one addition for this path, likely a method change
      if (
        otherRemovalsForPath.length === 0 &&
        otherAdditionsForPath.length === 0
      ) {
        return true
      }
    }

    // Case 3: Both method and path changed - check if this is the only removal+addition
    if (removedMethod !== addedMethod && removedPath !== addedPath) {
      // Check if there's only one removal and one addition total
      // (this is a weaker signal, but if it's the only change, it's likely a combined change)
      if (allRemovals.length === 1 && allAdditions.length === 1) {
        return true
      }
    }

    return false
  }

  /**
   * Handle URL/method change by updating existing request's endpoint
   */
  private async handleUrlChange(
    collection: LiveSyncCollection,
    urlChange: {
      oldPath: string
      newPath: string
      oldMethod: string
      newMethod: string
      operation: any
    },
    spec: any,
    sourceId?: string
  ): Promise<{ updated: boolean; found: boolean }> {
    console.log(`[handleUrlChange] Processing URL change:`)
    console.log(`  Old: ${urlChange.oldMethod} ${urlChange.oldPath}`)
    console.log(`  New: ${urlChange.newMethod} ${urlChange.newPath}`)
    
    // Find the existing request by old path and method
    const oldEndpointPath = `${urlChange.oldMethod} ${urlChange.oldPath}`
    const resolvedSourceId = sourceId || collection.liveMetadata?.sourceId || ""
    const collectionIndex = this.findCollectionIndex(
      resolvedSourceId,
      collection
    )
    const collectionInStore =
      collectionIndex >= 0
        ? (restCollectionStore.value.state[
            collectionIndex
          ] as LiveSyncCollection)
        : undefined
    const collectionForSearch = collectionInStore || collection

    const existingRequestInfo = this.findRequestInCollection(
      collectionForSearch,
      oldEndpointPath,
      urlChange.oldPath
    )

    if (!existingRequestInfo) {
      // Can't find existing request by old path - try finding by new path
      // (in case the endpoint was already updated in a previous sync)
      const newEndpointPath = `${urlChange.newMethod} ${urlChange.newPath}`
      const existingByNewPath = this.findRequestInCollection(
        collectionForSearch,
        newEndpointPath,
        urlChange.newPath
      )

      if (existingByNewPath) {
        // Request already exists with new path - just update it
        if (collectionIndex < 0) {
          throw new Error("Collection not found in store")
        }

        const { request, folderPath, requestIndex } = existingByNewPath
        const updatedRequest = this.createRequestFromSpec(
          urlChange.newPath,
          urlChange.newMethod,
          urlChange.operation,
          spec
        )
        updatedRequest.responses = request.responses || {}

        // Update name intelligently
        const oldExpectedName = `${urlChange.oldMethod} ${urlChange.oldPath}`
        const wasNameFromSpec =
          request.name === oldExpectedName ||
          request.name.includes(urlChange.oldMethod) ||
          request.name.includes(urlChange.oldPath.split("/").pop() || "")

        const newExpectedName =
          urlChange.operation.summary ||
          urlChange.operation.operationId ||
          `${urlChange.newMethod} ${urlChange.newPath}`

        if (wasNameFromSpec) {
          updatedRequest.name = newExpectedName
        } else {
          updatedRequest.name = request.name
        }

        const fullPath =
          folderPath !== undefined
            ? `${collectionIndex}/${folderPath}`
            : collectionIndex.toString()
        editRESTRequest(fullPath, requestIndex, updatedRequest)
        return { updated: true, found: true }
      }

      // Still can't find it - this means it's a genuinely new endpoint
      // But we should check if maybe the old path exists but with a different method
      // Try finding with ANY method to see if path exists
      const existingByPath = this.findRequestInCollection(
        collectionForSearch,
        `ANY ${urlChange.oldPath}`,
        urlChange.oldPath
      )

      if (existingByPath) {
        // Found by path but different method - update it
        if (collectionIndex < 0) {
          throw new Error("Collection not found in store")
        }

        const { request, folderPath, requestIndex } = existingByPath
        const updatedRequest = this.createRequestFromSpec(
          urlChange.newPath,
          urlChange.newMethod,
          urlChange.operation,
          spec
        )
        updatedRequest.responses = request.responses || {}

        // Update name intelligently
        const oldExpectedName = `${urlChange.oldMethod} ${urlChange.oldPath}`
        const wasNameFromSpec =
          request.name === oldExpectedName ||
          request.name.includes(urlChange.oldMethod) ||
          request.name.includes(urlChange.oldPath.split("/").pop() || "")

        const newExpectedName =
          urlChange.operation.summary ||
          urlChange.operation.operationId ||
          `${urlChange.newMethod} ${urlChange.newPath}`

        if (wasNameFromSpec) {
          updatedRequest.name = newExpectedName
        } else {
          updatedRequest.name = request.name
        }

        const fullPath =
          folderPath !== undefined
            ? `${collectionIndex}/${folderPath}`
            : collectionIndex.toString()
        editRESTRequest(fullPath, requestIndex, updatedRequest)
        return { updated: true, found: true }
      }

      // Truly can't find existing request - this shouldn't happen for URL changes
      // But if it does, we should still prevent the addition from creating a duplicate
      // by marking it as processed. The addition will be skipped by the check above.
      return { updated: false, found: false }
    }

    // Get collection index
    if (collectionIndex < 0) {
      throw new Error("Collection not found in store")
    }

    const { request, folderPath, requestIndex } = existingRequestInfo
    console.log(`[handleUrlChange] Found existing request:`)
    console.log(`  Name: ${request.name}`)
    console.log(`  Method: ${request.method}`)
    console.log(`  Endpoint: ${request.endpoint}`)
    console.log(`  FolderPath: ${folderPath}, RequestIndex: ${requestIndex}`)

    // Create updated request with new path/method, preserving responses
    const updatedRequest = this.createRequestFromSpec(
      urlChange.newPath,
      urlChange.newMethod,
      urlChange.operation,
      spec
    )
    console.log(`[handleUrlChange] Created updated request:`)
    console.log(`  Method: ${updatedRequest.method}`)
    console.log(`  Endpoint: ${updatedRequest.endpoint}`)
    
    updatedRequest.responses = request.responses || {} // Preserve existing responses

    // Update name intelligently - same logic as updateEndpointInCollection
    // Check if the old name matches what the old spec would have generated
    const oldExpectedName = `${urlChange.oldMethod} ${urlChange.oldPath}` // Fallback if no summary
    
    // Get the new expected name from the operation
    const newExpectedName =
      urlChange.operation.summary ||
      urlChange.operation.operationId ||
      `${urlChange.newMethod} ${urlChange.newPath}`

    // Determine if the name should be updated:
    // 1. If the name matches the old method+path format (auto-generated fallback)
    // 2. If the name contains the old method (likely auto-generated)
    // 3. If the new summary is different from the current name (spec changed the summary)
    // 4. Always update if the new operation has a summary (prefer spec-defined names)
    const wasNameFromSpec =
      request.name === oldExpectedName ||
      request.name.includes(urlChange.oldMethod)
    
    // Check if the summary actually changed in the spec
    const summaryChanged = urlChange.operation.summary && request.name !== urlChange.operation.summary
    
    console.log(`[handleUrlChange] Name update check:`)
    console.log(`  Current name: "${request.name}"`)
    console.log(`  New expected name: "${newExpectedName}"`)
    console.log(`  wasNameFromSpec: ${wasNameFromSpec}, summaryChanged: ${summaryChanged}`)

    if (wasNameFromSpec || summaryChanged) {
      // Name came from spec or summary changed, update it with new summary/operationId
      updatedRequest.name = newExpectedName
      console.log(`  -> Updating name to: "${newExpectedName}"`)
    } else {
      // Name was customized and summary didn't change, preserve it
      updatedRequest.name = request.name
      console.log(`  -> Preserving existing name: "${request.name}"`)
    }

    // Update the request in place
    const fullPath =
      folderPath !== undefined
        ? `${collectionIndex}/${folderPath}`
        : collectionIndex.toString()
    console.log(`[handleUrlChange] Calling editRESTRequest with path: ${fullPath}, index: ${requestIndex}`)
    editRESTRequest(fullPath, requestIndex, updatedRequest)
    console.log(`[handleUrlChange] Request updated successfully!`)

    return { updated: true, found: true }
  }

  /**
   * Remove an endpoint from the collection
   */
  private async removeEndpointFromCollection(
    collection: LiveSyncCollection,
    change: any
  ): Promise<void> {
    // Parse the endpoint path (format: "GET /users/{id}")
    const [method, path] = change.path.split(" ", 2)

    if (!method || !path) {
      console.warn(`Invalid endpoint path format for removal: ${change.path}`)
      return
    }

    // Remove from folders and root requests
    for (const folder of collection.folders) {
      folder.requests = folder.requests.filter((req: unknown) => {
        const r = req as HoppRESTRequest
        const matchesMethod = r.method === method.toUpperCase()
        const matchesPath = r.endpoint.includes(path)
        return !(matchesMethod && matchesPath)
      })
    }

    // Remove from root requests
    collection.requests = collection.requests.filter((req: unknown) => {
      const r = req as HoppRESTRequest
      const matchesMethod = r.method === method.toUpperCase()
      const matchesPath = r.endpoint.includes(path)
      return !(matchesMethod && matchesPath)
    })
  }

  /**
   * Update endpoint parameters
   */
  private async updateEndpointParameters(
    collection: LiveSyncCollection,
    change: any
  ): Promise<void> {
    // This would update the parameters of an existing request
    // For now, we'll treat it as an endpoint update
    await this.updateEndpointInCollection(
      collection,
      change,
      collection.liveMetadata?.sourceId
    )
  }

  // Removed unused addEndpointFromSpec and createRequestFromEndpoint methods

  /**
   * Create a Hoppscotch request from OpenAPI spec
   */
  private createRequestFromSpec(
    path: string,
    method: string,
    operation: any,
    _spec: any // eslint-disable-line @typescript-eslint/no-unused-vars
  ): HoppRESTRequest {
    // Extract parameters
    const params = (operation.parameters || [])
      .filter((param: any) => param.in === "query")
      .map((param: any) => ({
        key: param.name,
        value: param.example || "",
        active: !param.required,
      }))

    // Extract headers
    const headers = (operation.parameters || [])
      .filter((param: any) => param.in === "header")
      .map((param: any) => ({
        key: param.name,
        value: param.example || "",
        active: true,
      }))

    // Create original request for response parsing
    const originalRequest = makeHoppRESTResponseOriginalRequest({
      name: operation.summary || operation.operationId || `${method} ${path}`,
      endpoint: `{{baseURL}}${path}`,
      method: method.toUpperCase(),
      auth: { authType: "inherit", authActive: true },
      body: operation.requestBody
        ? {
            contentType: "application/json" as const,
            body: JSON.stringify(
              operation.requestBody.content?.["application/json"]?.example ||
                {},
              null,
              2
            ),
          }
        : {
            contentType: null,
            body: null,
          },
      params: params.map((p: any) => ({
        key: p.key,
        value: p.value,
        active: p.active,
        description: "",
      })),
      headers: headers.map((h: any) => ({
        key: h.key,
        value: h.value,
        active: h.active,
        description: "",
      })),
      requestVariables: [],
    })

    // Parse responses from OpenAPI spec
    const responses = this.parseOpenAPIResponses(operation, originalRequest)

    // Create the request with all required fields including parsed responses
    return makeRESTRequest({
      name: operation.summary || operation.operationId || `${method} ${path}`,
      endpoint: `{{baseURL}}${path}`,
      method: method as any,
      params,
      headers,
      preRequestScript: "",
      testScript: "",
      auth: { authType: "inherit", authActive: true },
      body: operation.requestBody
        ? {
            contentType: "application/json" as const,
            body: JSON.stringify(
              operation.requestBody.content?.["application/json"]?.example ||
                {},
              null,
              2
            ),
          }
        : {
            contentType: null,
            body: null,
          },
      responses, // Parse responses from spec
      requestVariables: [], // Required field
    })
  }

  /**
   * Parse OpenAPI responses to Hoppscotch format
   */
  private parseOpenAPIResponses(
    operation: any,
    originalRequest: any
  ): HoppRESTRequestResponses {
    const responses = operation.responses
    if (!responses) return {}

    const res: HoppRESTRequestResponses = {}

    for (const [key, value] of Object.entries(responses)) {
      const response = value as any

      // Get content type and body
      const contentType =
        Object.keys(response.content ?? {})[0] || "application/json"
      const bodyContent = response.content?.[contentType]

      const name = response.description || key
      const code = isNumeric(key) ? Number(key) : 200
      const status = getStatusCodeReasonPhrase(code)

      const headers: HoppRESTHeader[] = [
        {
          key: "content-type",
          value: contentType,
          description: "",
          active: true,
        },
      ]

      let stringifiedBody = ""
      try {
        // Try to stringify the schema/example
        if (bodyContent?.example !== undefined) {
          stringifiedBody = JSON.stringify(bodyContent.example, null, 2)
        } else if (bodyContent?.schema) {
          stringifiedBody = JSON.stringify(bodyContent.schema, null, 2)
        } else {
          stringifiedBody = JSON.stringify(bodyContent || "", null, 2)
        }
      } catch (e) {
        // Ignore circular references
        stringifiedBody = ""
      }

      res[name] = {
        name,
        status,
        code,
        headers,
        body: stringifiedBody,
        originalRequest,
      }
    }

    return res
  }

  private findCollectionIndex(
    sourceId: string,
    fallbackCollection?: LiveSyncCollection
  ): number {
    const collections = restCollectionStore.value.state

    let effectiveSourceId = sourceId

    if (!effectiveSourceId && fallbackCollection?.liveMetadata?.sourceId) {
      effectiveSourceId = fallbackCollection.liveMetadata.sourceId
    }

    if (effectiveSourceId) {
      const indexBySourceId = collections.findIndex(
        (col): col is LiveSyncCollection =>
          "liveMetadata" in col &&
          (col as LiveSyncCollection).liveMetadata?.sourceId ===
            effectiveSourceId
      )

      if (indexBySourceId >= 0) {
        return indexBySourceId
      }
    }

    if (fallbackCollection) {
      // Try direct reference match first
      const indexByReference = collections.indexOf(fallbackCollection)
      if (indexByReference >= 0) {
        return indexByReference
      }

      // Fallback to name matching if reference differs (e.g., clone)
      const indexByName = collections.findIndex(
        (col) => col.name === fallbackCollection.name
      )
      if (indexByName >= 0) {
        return indexByName
      }
    }

    return -1
  }

  private async performSync(sourceId: string): Promise<SyncResult> {
    try {
      // Find the collection
      let collection = findCollectionBySourceId(sourceId)

      if (!collection) {
        // Try to find by checking all collections (fallback for missing metadata)
        const allCollections = restCollectionStore.value.state
        const source = liveSpecSourceService.getSource(sourceId)

        if (source) {
          // Try matching by name as fallback
          const byName = allCollections.find((col) => col.name === source.name)
          if (byName && "liveMetadata" in byName) {
            const liveCol = byName as LiveSyncCollection
            // Ensure it has the correct sourceId
            const collectionIndex = allCollections.indexOf(byName)
            if (collectionIndex >= 0) {
              setCollectionLiveMetadata(collectionIndex, {
                isLiveSync: true,
                sourceId: source.id,
                ...(liveCol.liveMetadata
                  ? {
                      lastSyncTime: liveCol.liveMetadata.lastSyncTime,
                      syncStrategy:
                        liveCol.liveMetadata.syncStrategy || "incremental",
                      customizations: liveCol.liveMetadata.customizations,
                      originalSpecHash: liveCol.liveMetadata.originalSpecHash,
                      syncConfig: liveCol.liveMetadata.syncConfig,
                    }
                  : {
                      syncStrategy: "incremental" as const,
                      syncConfig: { autoSync: true, syncInterval: 30000 },
                    }),
              } as any)
              // Re-read from store
              collection = restCollectionStore.value.state[
                collectionIndex
              ] as LiveSyncCollection
            }
          }
        }

        if (!collection) {
          console.error(`Collection not found for source: ${sourceId}`)
          // Log available collections for debugging
          const availableCollections = getLiveSyncCollections()
          console.error(
            `Available live sync collections: ${availableCollections.length}`
          )
          availableCollections.forEach((col) => {
            console.error(
              `  - "${col.name}" (sourceId: ${col.liveMetadata?.sourceId})`
            )
          })
          return {
            success: false,
            errors: ["Collection not found"],
          }
        }
      }

      // Get the source from live spec source service (if not already retrieved)
      const source = liveSpecSourceService.getSource(sourceId)
      if (!source) {
        console.error(
          `Source not found in live spec source service: ${sourceId}`
        )
        return {
          success: false,
          errors: ["Source configuration not found"],
        }
      }

      // Fetch the latest spec using the live spec source service
      const fetchResult = await liveSpecSourceService.fetchSpec(sourceId)

      if (!fetchResult.success || !fetchResult.spec) {
        console.error(
          `Failed to fetch spec for source: ${sourceId}`,
          fetchResult.error
        )
        return {
          success: false,
          errors: [
            `Failed to fetch latest specification: ${fetchResult.error || "Unknown error"}`,
          ],
        }
      }

      // Perform sync with the collection BEFORE storing the new spec
      // This ensures syncExistingCollection can get the old spec
      const syncResult = await this.syncExistingCollection(
        collection,
        fetchResult.spec
      )

      // Store the NEW spec AFTER syncing is done
      // prettier-ignore
      this.storeSpec(
        sourceId,
        fetchResult.spec,
        source.type === "url" ? (source.config as URLSourceConfig).url : ""
      )

      return syncResult
    } catch (error) {
      console.error(`Sync error for source: ${sourceId}`, error)
      return {
        success: false,
        errors: [
          `Sync operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      }
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Note: File watcher cleanup disabled in browser environment
    // this.fileWatcher.destroy()
  }
}

// Export singleton instance
export const syncEngineService = new SyncEngineService()
export default syncEngineService
