/**
 * Live Sync Orchestrator Service
 *
 * Coordinates all live sync services and provides a unified API
 */

import { liveSyncManagerService } from "./live-sync-manager.service"
import { liveSyncPollingService } from "./live-sync-polling.service"
import { liveSpecSourceService } from "./live-spec-source.service"
import { syncEngineService } from "./sync-engine.service"
import { findCollectionBySourceId } from "~/newstore/collections"
import type {
  URLSourceConfig,
  FileSourceConfig,
} from "~/types/live-spec-source"

/**
 * Main orchestrator that coordinates all live sync functionality
 */
export class LiveSyncOrchestratorService {
  constructor() {
    this.setupEventHandlers()
  }

  /**
   * Start complete live sync for a source (polling + collection updates)
   */
  async startCompleteLiveSync(
    sourceId: string,
    options: {
      pollInterval?: number
      autoUpdateCollections?: boolean
      preserveUserCustomizations?: boolean
      skipCollectionCreation?: boolean
    } = {}
  ): Promise<void> {
    try {
      // Only ensure collection exists if not skipping
      if (!options.skipCollectionCreation) {
        console.log(`Ensuring collection exists for source: ${sourceId}`)
        await this.ensureCollectionExists(sourceId)
      } else {
        console.log(`Skipping collection creation for source: ${sourceId}`)
      }

      // Start live sync manager (handles lifecycle)
      await liveSyncManagerService.startLiveSync(sourceId, {
        pollInterval: options.pollInterval,
        autoSync: true,
        startPolling: true,
      })

      console.log(`Complete live sync started for source: ${sourceId}`)
    } catch (error) {
      console.error(
        `Failed to start complete live sync for ${sourceId}:`,
        error
      )
      throw error
    }
  }

  /**
   * Ensure a collection exists for the source, create one if it doesn't
   */
  private async ensureCollectionExists(sourceId: string): Promise<void> {
    // Check if collection already exists
    const existingCollection = findCollectionBySourceId(sourceId)
    if (existingCollection) {
      console.log(`Collection already exists for source: ${sourceId}`)
      return
    }

    console.log(`Creating new collection for source: ${sourceId}`)

    // Get source configuration
    const source = liveSpecSourceService.getSource(sourceId)
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`)
    }

    // Use sync engine to create the collection
    const result = await syncEngineService.startWatching({
      sourceId: sourceId,
      type: source.type as "url" | "file",
      path:
        source.type === "url"
          ? (source.config as URLSourceConfig).url
          : (source.config as FileSourceConfig).filePath || "",
      collectionName: source.name,
    })

    if (!result.success) {
      throw new Error(
        `Failed to create collection: ${result.errors?.join(", ")}`
      )
    }

    console.log(`Collection created for source: ${sourceId}`)

    // Trigger an initial sync to populate the collection
    console.log(`Triggering initial sync for source: ${sourceId}`)
    const syncResult = await syncEngineService.triggerSync(sourceId)

    if (syncResult.success) {
      console.log(`Initial sync completed for source: ${sourceId}`)
    } else {
      console.warn(
        `Initial sync failed for source: ${sourceId}`,
        syncResult.errors
      )
    }
  }

  /**
   * Stop complete live sync for a source
   */
  async stopCompleteLiveSync(sourceId: string): Promise<void> {
    await liveSyncManagerService.stopLiveSync(sourceId)
  }

  /**
   * Get comprehensive status for all live sync operations
   */
  getComprehensiveStatus() {
    const managerState = liveSyncManagerService.getReactiveState()
    const pollingStats = liveSyncPollingService.getPollingStats()

    return {
      manager: managerState,
      polling: pollingStats,
      isActive: managerState.globalStats.activeSessions > 0,
    }
  }

  // Removed unused handleSpecChanges method (noUnusedLocals)

  /**
   * Setup event handlers to coordinate services
   */
  private setupEventHandlers(): void {
    // In a full implementation, you'd set up proper event listeners
    // For now, this is a placeholder for the coordination logic
    console.log("Live sync orchestrator initialized")
  }

  /**
   * Trigger manual sync and update for a source
   */
  async triggerManualSyncAndUpdate(sourceId: string): Promise<void> {
    await liveSyncManagerService.triggerManualSync(sourceId)
  }

  /**
   * Get all active live sync sources
   */
  getActiveSources(): string[] {
    return liveSyncManagerService.getActiveSessions().map((s) => s.sourceId)
  }

  /**
   * Update settings for a source
   */
  async updateSourceSettings(
    sourceId: string,
    settings: {
      pollInterval?: number
      autoSync?: boolean
      preserveCustomizations?: boolean
    }
  ): Promise<void> {
    if (settings.pollInterval) {
      await liveSyncManagerService.updatePollInterval(
        sourceId,
        settings.pollInterval
      )
    }

    if (settings.autoSync !== undefined) {
      await liveSyncManagerService.toggleAutoSync(sourceId)
    }
  }

  /**
   * Cleanup all services
   */
  destroy(): void {
    liveSyncManagerService.destroy()
  }
}

// Export singleton instance
export const liveSyncOrchestratorService = new LiveSyncOrchestratorService()
