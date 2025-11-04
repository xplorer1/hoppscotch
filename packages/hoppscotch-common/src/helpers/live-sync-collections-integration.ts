/**
 * Live Sync Collections Integration
 * Integrates live sync with existing Hoppscotch collections store
 */

import { reactive } from "vue"
import type { HoppCollection } from "@hoppscotch/data"
import type {
  LiveSpecSource,
  LiveCollectionMetadata,
} from "../types/live-spec-source"
import type { SpecDiff } from "../types/spec-diff"
import { liveSpecSourceService } from "../services/live-spec-source.service"
import { platformIntegrationService } from "../services/platform-integration.service"

// Extended collection type with live sync metadata
export interface LiveSyncCollection extends HoppCollection {
  liveMetadata?: LiveCollectionMetadata
}

export interface CollectionsStoreIntegration {
  // Collection management
  createLiveCollection(
    source: LiveSpecSource,
    spec: any
  ): Promise<LiveSyncCollection>
  updateLiveCollection(
    collectionId: string,
    changes: SpecDiff
  ): Promise<boolean>
  removeLiveCollection(collectionId: string): Promise<boolean>

  // Live sync operations
  syncCollection(collectionId: string): Promise<boolean>
  pauseLiveSync(collectionId: string): Promise<boolean>
  resumeLiveSync(collectionId: string): Promise<boolean>

  // Collection queries
  getLiveCollections(): LiveSyncCollection[]
  findCollectionBySourceId(sourceId: string): LiveSyncCollection | null
  isCollectionLive(collectionId: string): boolean

  // Metadata management
  updateCollectionMetadata(
    collectionId: string,
    metadata: Partial<LiveCollectionMetadata>
  ): Promise<boolean>
  preserveUserCustomizations(
    collectionId: string,
    changes: SpecDiff
  ): Promise<SpecDiff>
}

class LiveSyncCollectionsIntegration implements CollectionsStoreIntegration {
  private collections = reactive<Map<string, LiveSyncCollection>>(new Map())
  private collectionsStore: any = null

  /**
   * Initialize integration with existing collections store
   */
  async initialize(collectionsStore: any): Promise<void> {
    this.collectionsStore = collectionsStore

    // Load existing live collections
    await this.loadExistingLiveCollections()

    // Setup store event listeners
    this.setupStoreEventListeners()
  }

  /**
   * Create a new live collection from OpenAPI spec
   */
  async createLiveCollection(
    source: LiveSpecSource,
    spec: any
  ): Promise<LiveSyncCollection> {
    try {
      // Import OpenAPI spec to create collection
      const importedCollections = await this.importOpenAPISpec(spec)

      if (importedCollections.length === 0) {
        throw new Error("Failed to import OpenAPI specification")
      }

      // Take the first collection (or merge if multiple)
      const baseCollection = importedCollections[0]

      // Add live sync metadata
      const liveCollection: LiveSyncCollection = {
        ...baseCollection,
        name: source.name || baseCollection.name,
        liveMetadata: {
          sourceId: source.id,
          lastSyncTime: new Date(),
          isLiveSync: true,
          syncStrategy: source.syncStrategy,
          customizations: {},
          originalSpecHash: this.calculateSpecHash(spec),
          syncConfig: {
            autoSync: true,
            syncInterval: (source.config as any).pollInterval || 30000,
          },
        },
      }

      // Store in collections store
      if (this.collectionsStore?.addCollection) {
        await this.collectionsStore.addCollection(liveCollection)
      }

      // Store locally
      this.collections.set(
        liveCollection.id || this.generateId(),
        liveCollection
      )

      // Persist to platform storage
      await this.persistCollection(liveCollection)

      // Track analytics
      await platformIntegrationService.trackEvent("live_collection_created", {
        sourceType: source.type,
        framework: source.framework,
        endpointCount: this.countEndpoints(spec),
      })

      return liveCollection
    } catch (error) {
      console.error("Failed to create live collection:", error)
      throw error
    }
  }

  /**
   * Update live collection with changes from spec diff
   */
  async updateLiveCollection(
    collectionId: string,
    changes: SpecDiff
  ): Promise<boolean> {
    const collection = this.collections.get(collectionId)
    if (!collection || !collection.liveMetadata) {
      return false
    }

    try {
      // Preserve user customizations
      const filteredChanges = await this.preserveUserCustomizations(
        collectionId,
        changes
      )

      // Apply changes to collection
      const updatedCollection = await this.applyChangesToCollection(
        collection,
        filteredChanges
      )

      // Update metadata
      updatedCollection.liveMetadata.lastSyncTime = new Date()

      // Update in collections store
      if (this.collectionsStore?.updateCollection) {
        await this.collectionsStore.updateCollection(
          collectionId,
          updatedCollection
        )
      }

      // Update locally
      this.collections.set(collectionId, updatedCollection)

      // Persist to platform storage
      await this.persistCollection(updatedCollection)

      // Track analytics
      await platformIntegrationService.trackEvent("live_collection_updated", {
        collectionId,
        changesCount: filteredChanges.endpoints.length,
        hasBreakingChanges: filteredChanges.endpoints.some((e) => e.isBreaking),
      })

      return true
    } catch (error) {
      console.error("Failed to update live collection:", error)
      return false
    }
  }

  /**
   * Remove live collection
   */
  async removeLiveCollection(collectionId: string): Promise<boolean> {
    try {
      // Remove from collections store
      if (this.collectionsStore?.removeCollection) {
        await this.collectionsStore.removeCollection(collectionId)
      }

      // Remove locally
      this.collections.delete(collectionId)

      // Remove from platform storage
      await this.removePersistedCollection(collectionId)

      return true
    } catch (error) {
      console.error("Failed to remove live collection:", error)
      return false
    }
  }

  /**
   * Manually sync a live collection
   */
  async syncCollection(collectionId: string): Promise<boolean> {
    const collection = this.collections.get(collectionId)
    if (!collection?.liveMetadata?.sourceId) {
      return false
    }

    try {
      const source = liveSpecSourceService.getSource(
        collection.liveMetadata.sourceId
      )
      if (!source) {
        return false
      }

      // Trigger sync through sync engine
      // This would integrate with the sync engine service
      console.log(
        `Manually syncing collection ${collectionId} from source ${source.id}`
      )

      return true
    } catch (error) {
      console.error("Failed to sync collection:", error)
      return false
    }
  }

  /**
   * Pause live sync for a collection
   */
  async pauseLiveSync(collectionId: string): Promise<boolean> {
    const collection = this.collections.get(collectionId)
    if (!collection?.liveMetadata) {
      return false
    }

    collection.liveMetadata.isLiveSync = false

    // Update in store
    await this.updateCollectionMetadata(collectionId, { isLiveSync: false })

    return true
  }

  /**
   * Resume live sync for a collection
   */
  async resumeLiveSync(collectionId: string): Promise<boolean> {
    const collection = this.collections.get(collectionId)
    if (!collection?.liveMetadata) {
      return false
    }

    collection.liveMetadata.isLiveSync = true

    // Update in store
    await this.updateCollectionMetadata(collectionId, { isLiveSync: true })

    return true
  }

  /**
   * Get all live collections
   */
  getLiveCollections(): LiveSyncCollection[] {
    return Array.from(this.collections.values()).filter(
      (collection) => collection.liveMetadata?.isLiveSync
    )
  }

  /**
   * Find collection by source ID
   */
  findCollectionBySourceId(sourceId: string): LiveSyncCollection | null {
    for (const collection of this.collections.values()) {
      if (collection.liveMetadata?.sourceId === sourceId) {
        return collection
      }
    }
    return null
  }

  /**
   * Check if collection is live
   */
  isCollectionLive(collectionId: string): boolean {
    const collection = this.collections.get(collectionId)
    return collection?.liveMetadata?.isLiveSync === true
  }

  /**
   * Update collection metadata
   */
  async updateCollectionMetadata(
    collectionId: string,
    metadata: Partial<LiveCollectionMetadata>
  ): Promise<boolean> {
    const collection = this.collections.get(collectionId)
    if (!collection) {
      return false
    }

    // Update metadata
    collection.liveMetadata = {
      ...collection.liveMetadata,
      ...metadata,
    }

    // Persist changes
    await this.persistCollection(collection)

    return true
  }

  /**
   * Preserve user customizations when applying changes
   */
  async preserveUserCustomizations(
    collectionId: string,
    changes: SpecDiff
  ): Promise<SpecDiff> {
    const collection = this.collections.get(collectionId)
    if (!collection?.liveMetadata?.customizations) {
      return changes
    }

    // Filter out changes that would overwrite user customizations
    const filteredEndpoints = changes.endpoints.filter((change) => {
      const customizations =
        collection.liveMetadata!.customizations![change.path]

      if (!customizations) {
        return true // No customizations, allow change
      }

      // Check if change would affect customized parts
      if (change.type === "modified") {
        // Allow non-breaking changes that don't affect customized parts
        return !change.isBreaking
      }

      return true // Allow additions and removals
    })

    return {
      ...changes,
      endpoints: filteredEndpoints,
      hasChanges: filteredEndpoints.length > 0,
    }
  }

  // Private methods
  private async loadExistingLiveCollections(): Promise<void> {
    try {
      // Load from collections store
      if (this.collectionsStore?.getCollections) {
        const allCollections = await this.collectionsStore.getCollections()

        for (const collection of allCollections) {
          if (collection.liveMetadata?.isLiveSync) {
            this.collections.set(collection.id, collection)
          }
        }
      }

      // Load from platform storage as backup
      const storedCollections = await this.loadPersistedCollections()
      for (const collection of storedCollections) {
        if (!this.collections.has(collection.id)) {
          this.collections.set(collection.id, collection)
        }
      }
    } catch (error) {
      console.error("Failed to load existing live collections:", error)
    }
  }

  private setupStoreEventListeners(): void {
    if (!this.collectionsStore?.on) return

    // Listen for collection changes
    this.collectionsStore.on(
      "collection:updated",
      (collection: LiveSyncCollection) => {
        if (collection.liveMetadata?.isLiveSync) {
          this.collections.set(collection.id, collection)
        }
      }
    )

    this.collectionsStore.on("collection:removed", (collectionId: string) => {
      this.collections.delete(collectionId)
    })
  }

  private async importOpenAPISpec(spec: any): Promise<HoppCollection[]> {
    // This would integrate with existing OpenAPI importer
    // For now, return a mock implementation

    const collection: HoppCollection = {
      id: this.generateId(),
      name: spec.info?.title || "Imported API",
      folders: [],
      requests: [],
      auth: { authType: "none", authActive: true },
      headers: [],
    }

    // Convert OpenAPI paths to requests
    if (spec.paths) {
      for (const [path, pathItem] of Object.entries(spec.paths as any)) {
        for (const [method, operation] of Object.entries(pathItem as any)) {
          if (["get", "post", "put", "patch", "delete"].includes(method)) {
            collection.requests.push({
              id: this.generateId(),
              name: operation.summary || `${method.toUpperCase()} ${path}`,
              method: method.toUpperCase(),
              endpoint: path,
              params: [],
              headers: [],
              preRequestScript: "",
              testScript: "",
              auth: { authType: "inherit", authActive: true },
              body: { contentType: null, body: null },
            })
          }
        }
      }
    }

    return [collection]
  }

  private async applyChangesToCollection(
    collection: LiveSyncCollection,
    changes: SpecDiff
  ): Promise<LiveSyncCollection> {
    const updatedCollection = { ...collection }

    for (const change of changes.endpoints) {
      switch (change.type) {
        case "added":
          // Add new request to collection
          updatedCollection.requests.push({
            id: this.generateId(),
            name: `${change.method.toUpperCase()} ${change.path}`,
            method: change.method.toUpperCase(),
            endpoint: change.path,
            params: [],
            headers: [],
            preRequestScript: "",
            testScript: "",
            auth: { authType: "inherit", authActive: true },
            body: { contentType: null, body: null },
          })
          break

        case "removed":
          // Remove request from collection
          updatedCollection.requests = updatedCollection.requests.filter(
            (req) =>
              !(
                req.endpoint === change.path &&
                req.method === change.method.toUpperCase()
              )
          )
          break

        case "modified":
          // Update existing request
          const requestIndex = updatedCollection.requests.findIndex(
            (req) =>
              req.endpoint === change.path &&
              req.method === change.method.toUpperCase()
          )

          if (requestIndex !== -1) {
            // Update request details based on change details
            const request = updatedCollection.requests[requestIndex]
            if (change.summary) {
              request.name = change.summary
            }
          }
          break
      }
    }

    return updatedCollection
  }

  private async persistCollection(
    collection: LiveSyncCollection
  ): Promise<void> {
    try {
      await platformIntegrationService.persistLiveSource({
        id: collection.id || this.generateId(),
        name: collection.name,
        type: "url", // This would be determined from the source
        status: "connected",
        config: { url: "" }, // This would come from the actual source
        syncStrategy: collection.liveMetadata?.syncStrategy || "incremental",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as LiveSpecSource)
    } catch (error) {
      console.error("Failed to persist collection:", error)
    }
  }

  private async removePersistedCollection(collectionId: string): Promise<void> {
    try {
      await platformIntegrationService.deleteLiveSource(collectionId)
    } catch (error) {
      console.error("Failed to remove persisted collection:", error)
    }
  }

  private async loadPersistedCollections(): Promise<LiveSyncCollection[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _sources = await platformIntegrationService.loadLiveSources()
      // Convert sources back to collections (simplified)
      return []
    } catch (error) {
      console.error("Failed to load persisted collections:", error)
      return []
    }
  }

  private calculateSpecHash(spec: any): string {
    // Simple hash function for spec content
    const str = JSON.stringify(spec, Object.keys(spec).sort())
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(36)
  }

  private countEndpoints(spec: any): number {
    if (!spec?.paths) return 0

    let count = 0
    for (const path in spec.paths) {
      for (const method in spec.paths[path]) {
        if (
          ["get", "post", "put", "patch", "delete", "options", "head"].includes(
            method
          )
        ) {
          count++
        }
      }
    }
    return count
  }

  private generateId(): string {
    return `live_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }
}

// Export singleton instance
export const liveSyncCollectionsIntegration =
  new LiveSyncCollectionsIntegration()
export default liveSyncCollectionsIntegration
