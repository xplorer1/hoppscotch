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
  getCollectionIndex,
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

      console.log(`Stored spec for ${sourceId}:`, {
        hash: hash.substring(0, 10) + "...",
        timestamp: storedSpec.timestamp,
        endpoints: Object.keys(spec?.paths || {}).length,
      })
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
      console.log(`No stored spec found for ${sourceId}`)
      return null
    }

    console.log(`Retrieved stored spec for ${sourceId}:`, {
      hash: stored.hash.substring(0, 10) + "...",
      age: Date.now() - stored.timestamp.getTime(),
      endpoints: Object.keys(stored.spec?.paths || {}).length,
    })

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
      console.log(`Cleaned up old spec for ${sourceId}`)
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
      console.log(`Syncing collection for source: ${sourceId}`)

      // Get the old spec from storage
      const oldSpec = this.getStoredSpec(sourceId)

      if (!oldSpec) {
        console.log(
          `No previous spec found for ${sourceId}, treating as initial sync`
        )

        // First sync - no comparison needed, just apply the spec
        const conflicts = await this.applyChangesToCollection(collection, {
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
        })

        // Update sync status
        const collectionIndex = this.findCollectionIndex(sourceId)
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
      console.log(`Comparing specs for ${sourceId}`)
      const diffResult = await this.diffEngine.compareSpecs(oldSpec, newSpec)

      console.log(`Diff result for ${sourceId}:`, {
        hasChanges: diffResult.hasChanges,
        added: diffResult.summary.added,
        modified: diffResult.summary.modified,
        removed: diffResult.summary.removed,
      })

      if (!diffResult.hasChanges) {
        console.log(`No changes detected for ${sourceId}`)
        return {
          success: true,
          collectionId: sourceId,
          changes: diffResult,
        }
      }

      console.log(`Applying changes to collection for ${sourceId}`)

      // Apply changes to collection
      const conflicts = await this.applyChangesToCollection(
        collection,
        diffResult,
        newSpec
      )

      // Update sync status
      const collectionIndex = this.findCollectionIndex(sourceId)
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

      console.log(`Successfully synced collection for ${sourceId}`)

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
    newSpec?: any
  ): Promise<SyncConflict[]> {
    const conflicts: SyncConflict[] = []
    const sourceId = collection.liveMetadata?.sourceId || ""

    console.log(
      `Applying ${diffResult.changes.length} changes to collection for ${sourceId}`
    )

    // If this is an initial sync with no specific changes, rebuild the entire collection
    if (diffResult.changes.length === 0 && diffResult.hasChanges) {
      console.log(`Initial sync - rebuilding collection for ${sourceId}`)
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

    for (const change of diffResult.changes) {
      try {
        // Skip if this is part of a URL change that we'll handle
        let urlChange = urlChanges.get(change.path)
        if (!urlChange) {
          urlChange = urlChangesByNewPath.get(change.path)
        }

        if (urlChange) {
          if (change.type === "endpoint-removed") {
            // Handle URL change as update
            console.log(
              `Detected URL/method change: ${urlChange.oldMethod} ${urlChange.oldPath} → ${urlChange.newMethod} ${urlChange.newPath}`
            )
            await this.handleUrlChange(collection, urlChange, newSpec)
            processedUrlChanges.add(change.path)
            processedUrlChanges.add(
              `${urlChange.newMethod} ${urlChange.newPath}`
            )
          }
          // Skip if already processed as URL change
          if (processedUrlChanges.has(change.path)) {
            continue
          }
        }

        console.log(`Applying change: ${change.type} - ${change.path}`)

        switch (change.type) {
          case "endpoint-added":
            await this.addEndpointToCollection(collection, {
              ...change,
              spec: newSpec,
            })
            break
          case "endpoint-modified":
            await this.updateEndpointInCollection(collection, {
              ...change,
              spec: newSpec,
            })
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
            console.log(`Unhandled change type: ${change.type}`)
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

    console.log(
      `Applied changes to collection for ${sourceId}, conflicts: ${conflicts.length}`
    )
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

      console.log(`Fetching spec for rebuild: ${sourceId}`)
      const fetchResult = await liveSpecSourceService.fetchSpec(sourceId)
      if (!fetchResult.success || !fetchResult.spec) {
        throw new Error(
          `Failed to fetch spec: ${fetchResult.error || "Unknown error"}`
        )
      }

      const spec = fetchResult.spec
      const paths = spec.paths || {}
      const endpointCount = Object.keys(paths).length

      console.log(`Rebuilding collection with ${endpointCount} endpoints`)

      if (endpointCount === 0) {
        console.log(`No endpoints found in spec for ${sourceId}`)
        return conflicts
      }

      // Use OpenAPI importer to rebuild collection with proper folder structure
      console.log(`Using OpenAPI importer to rebuild collection with tags...`)
      const { hoppOpenAPIImporter } = await import(
        "~/helpers/import-export/import/importers"
      )

      // Convert spec to JSON string for importer
      const specString = JSON.stringify(spec)
      const importResult = await hoppOpenAPIImporter([specString])()

      if (importResult._tag === "Right" && importResult.right.length > 0) {
        const importedCollection = importResult.right[0]
        console.log(
          `Imported collection with ${importedCollection.folders.length} folders and ${importedCollection.requests.length} untagged requests`
        )

        // Replace the existing collection with the newly imported one
        const collectionIndex = this.findCollectionIndex(
          collection.liveMetadata?.sourceId || ""
        )
        if (collectionIndex >= 0) {
          // Clear existing collection
          collection.folders = []
          collection.requests = []

          // Apply imported structure
          collection.folders = importedCollection.folders
          collection.requests = importedCollection.requests

          // Preserve live metadata
          collection.name = importedCollection.name || collection.name

          console.log(
            `Collection rebuild completed with proper folder structure`
          )
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
    change: any
  ): Promise<void> {
    console.log(`Adding endpoint: ${change.path}`)

    // Parse the endpoint path (format: "GET /users/{id}")
    const [method, path] = change.path.split(" ", 2)

    if (!method || !path) {
      throw new Error(`Invalid endpoint path format: ${change.path}`)
    }

    // Get the collection index
    const collectionIndex = this.findCollectionIndex(
      collection.liveMetadata?.sourceId || ""
    )
    if (collectionIndex < 0) {
      throw new Error("Collection not found in store")
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
      const folderIndex = collection.folders.findIndex(
        (f) => f.name === folderName
      )

      if (folderIndex < 0) {
        // Need to add folder via proper store method (this is tricky - for now we'll add manually but mark it)
        console.warn(
          `Cannot create folder "${folderName}" via store yet - adding endpoint to collection root`
        )
        fullPath = basePath
      } else {
        fullPath = `${basePath}/${folderIndex}`
        console.log(`Found folder "${folderName}" at index ${folderIndex}`)
      }
    }

    const insertionIndex = saveRESTRequestAs(fullPath, request)
    console.log(
      `Added endpoint ${change.path} at path ${fullPath}, index ${insertionIndex}`
    )
  }

  /**
   * Update an existing endpoint in the collection
   */
  private async updateEndpointInCollection(
    collection: LiveSyncCollection,
    change: any
  ): Promise<void> {
    console.log(`Updating endpoint: ${change.path}`)

    // Parse the endpoint path (format: "GET /users/{id}")
    const [method, path] = change.path.split(" ", 2)

    if (!method || !path) {
      throw new Error(`Invalid endpoint path format: ${change.path}`)
    }

    // Get the collection index
    const collectionIndex = this.findCollectionIndex(
      collection.liveMetadata?.sourceId || ""
    )
    if (collectionIndex < 0) {
      throw new Error("Collection not found in store")
    }

    // Find the existing request - try to match by old path/method first, then by new path
    const oldPath = change.oldValue
      ? this.extractPathFromChange(change.oldValue, change.path)
      : null
    const existingRequestInfo = this.findRequestInCollection(
      collection,
      change.path,
      oldPath || path
    )

    if (!existingRequestInfo) {
      // Request not found - might be a new endpoint or URL change
      // Try to match by operation name or summary
      console.log(
        `Could not find existing request for ${change.path}, trying to match by name`
      )
      await this.addEndpointToCollection(collection, {
        ...change,
        spec: change.spec || {},
      })
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
    updatedRequest.name = request.name || updatedRequest.name // Preserve custom name if set

    // Update the request in place using editRESTRequest
    const fullPath = folderPath
      ? `${collectionIndex}/${folderPath}`
      : collectionIndex.toString()
    editRESTRequest(fullPath, requestIndex, updatedRequest)

    console.log(
      `Updated endpoint ${change.path} at path ${fullPath}, index ${requestIndex}`
    )
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

    // Normalize matchPath (remove {baseURL} and extra slashes)
    const normalizedMatchPath = matchPath
      .replace(/{{baseURL}}/g, "")
      .replace(/^\/+/, "/")

    // Search in folders first
    for (
      let folderIndex = 0;
      folderIndex < collection.folders.length;
      folderIndex++
    ) {
      const folder = collection.folders[folderIndex]
      for (let i = 0; i < folder.requests.length; i++) {
        const request = folder.requests[i]
        const matchesMethod = !method || request.method === method
        const matchesPath =
          request.endpoint
            .replace(/{{baseURL}}/g, "")
            .replace(/^\/+/, "/")
            .includes(normalizedMatchPath) ||
          normalizedMatchPath.includes(
            request.endpoint.replace(/{{baseURL}}/g, "").replace(/^\/+/, "/")
          )

        if (matchesMethod && matchesPath) {
          return { request, folderPath: folderIndex, requestIndex: i }
        }
      }
    }

    // Search in root requests
    for (let i = 0; i < collection.requests.length; i++) {
      const request = collection.requests[i] as HoppRESTRequest
      const matchesMethod = !method || request.method === method
      const matchesPath =
        request.endpoint
          .replace(/{{baseURL}}/g, "")
          .replace(/^\/+/, "/")
          .includes(normalizedMatchPath) ||
        normalizedMatchPath.includes(
          (request.endpoint as string)
            .replace(/{{baseURL}}/g, "")
            .replace(/^\/+/, "/")
        )

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
        // For URL changes, if operationId/summary match, it's definitely a URL change
        // If they don't match but paths are similar, it might still be a URL change (fallback)
        const isUrlChange =
          removedMethod === addedMethod && removedPath !== addedPath
        const isMethodChange =
          removedPath === addedPath && removedMethod !== addedMethod

        // Prefer matches with same operationId/summary, but also accept URL/method changes
        // when they're the only removal+addition pair for that method
        if (
          (isUrlChange || isMethodChange) &&
          (sameOperationId ||
            sameSummary ||
            this.isLikelyUrlChange(removal, addition, removals, additions))
        ) {
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
   * Check if a removal+addition pair is likely a URL change
   * (fallback when operationId/summary don't match)
   */
  private isLikelyUrlChange(
    removal: any,
    addition: any,
    allRemovals: any[],
    allAdditions: any[]
  ): boolean {
    const [removedMethod] = removal.path.split(" ", 2)
    const [addedMethod] = addition.path.split(" ", 2)

    // If same method and this is the only removal+addition for that method, likely a URL change
    if (removedMethod === addedMethod) {
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
    spec: any
  ): Promise<void> {
    const isUrlChange = urlChange.oldPath !== urlChange.newPath
    const isMethodChange = urlChange.oldMethod !== urlChange.newMethod

    if (isUrlChange) {
      console.log(
        `Handling URL change: ${urlChange.oldMethod} ${urlChange.oldPath} → ${urlChange.newMethod} ${urlChange.newPath}`
      )
    } else if (isMethodChange) {
      console.log(
        `Handling method change: ${urlChange.oldMethod} ${urlChange.oldPath} → ${urlChange.newMethod} ${urlChange.oldPath}`
      )
    }

    // Find the existing request by old path and method
    const oldEndpointPath = `${urlChange.oldMethod} ${urlChange.oldPath}`
    const existingRequestInfo = this.findRequestInCollection(
      collection,
      oldEndpointPath,
      urlChange.oldPath
    )

    if (!existingRequestInfo) {
      // Can't find existing request, fall back to add new
      console.log(
        `Could not find existing request for ${oldEndpointPath}, adding new endpoint`
      )
      await this.addEndpointToCollection(collection, {
        type: "endpoint-added",
        path: `${urlChange.newMethod} ${urlChange.newPath}`,
        newValue: urlChange.operation,
        spec,
      })
      return
    }

    // Get collection index
    const collectionIndex = this.findCollectionIndex(
      collection.liveMetadata?.sourceId || ""
    )
    if (collectionIndex < 0) {
      throw new Error("Collection not found in store")
    }

    const { request, folderPath, requestIndex } = existingRequestInfo

    // Create updated request with new path/method, preserving responses
    const updatedRequest = this.createRequestFromSpec(
      urlChange.newPath,
      urlChange.newMethod,
      urlChange.operation,
      spec
    )
    updatedRequest.responses = request.responses || {} // Preserve existing responses
    updatedRequest.name = request.name || updatedRequest.name // Preserve custom name

    // Update the request in place
    const fullPath =
      folderPath !== undefined
        ? `${collectionIndex}/${folderPath}`
        : collectionIndex.toString()
    editRESTRequest(fullPath, requestIndex, updatedRequest)

    if (isUrlChange) {
      console.log(
        `Updated endpoint URL from ${urlChange.oldPath} to ${urlChange.newPath} at path ${fullPath}, index ${requestIndex}`
      )
    } else {
      console.log(
        `Updated endpoint method from ${urlChange.oldMethod} to ${urlChange.newMethod} at path ${fullPath}, index ${requestIndex}`
      )
    }
  }

  /**
   * Remove an endpoint from the collection
   */
  private async removeEndpointFromCollection(
    collection: LiveSyncCollection,
    change: any
  ): Promise<void> {
    console.log(`Removing endpoint: ${change.path}`)

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

    console.log(`Removed endpoint: ${change.path}`)
  }

  /**
   * Update endpoint parameters
   */
  private async updateEndpointParameters(
    collection: LiveSyncCollection,
    change: any
  ): Promise<void> {
    console.log(`Updating parameters for: ${change.path}`)

    // This would update the parameters of an existing request
    // For now, we'll treat it as an endpoint update
    await this.updateEndpointInCollection(collection, change)
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

  private findCollectionIndex(sourceId: string): number {
    // Find the index of a collection in the store
    const collection = findCollectionBySourceId(sourceId)
    if (!collection) {
      return -1
    }
    return getCollectionIndex(collection)
  }

  private async performSync(sourceId: string): Promise<SyncResult> {
    console.log(`Starting sync for source: ${sourceId}`)

    try {
      // Find the collection
      const collection = findCollectionBySourceId(sourceId)
      if (!collection) {
        console.error(`Collection not found for source: ${sourceId}`)
        return {
          success: false,
          errors: ["Collection not found"],
        }
      }

      // Get the source from live spec source service
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

      console.log(`Fetching latest spec for source: ${sourceId}`)

      // Get the OLD spec BEFORE fetching the new one
      const oldSpec = this.getStoredSpec(sourceId)
      if (oldSpec) {
        console.log(
          `Found previous spec with ${Object.keys(oldSpec?.paths || {}).length} endpoints`
        )
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

      console.log(`Successfully fetched spec for source: ${sourceId}`)

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

      console.log(`Sync completed for source: ${sourceId}`, {
        success: syncResult.success,
        hasChanges: syncResult.changes?.hasChanges,
        errors: syncResult.errors?.length || 0,
      })

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
