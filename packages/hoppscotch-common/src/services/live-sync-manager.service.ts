/**
 * Live Sync Manager Service
 *
 * Central coordinator for live sync operations, managing lifecycle and orchestrating services
 */

import { reactive, ref, watch } from "vue"
import type { LiveSpecSource } from "~/types/live-spec-source"
import { liveSpecSourceService } from "./live-spec-source.service"
import { liveSyncPollingService } from "./live-sync-polling.service"
import { syncEngineService } from "./sync-engine.service"
import { changeNotificationService } from "./change-notification.service"
import { performanceMonitorService } from "./performance-monitor.service"
import {
  getLiveSyncCollections,
  restCollectionStore,
  setCollectionLiveMetadata,
} from "~/newstore/collections"
import type { LiveSyncCollection } from "~/types/live-collection-metadata"
import { PersistenceService } from "./persistence"
import { getService } from "~/modules/dioc"

interface LiveSyncSession {
  sourceId: string
  source: LiveSpecSource
  isActive: boolean
  startedAt: Date
  lastSyncAt?: Date
  pollInterval: number
  autoSync: boolean
  status: "active" | "paused" | "error" | "stopped"
  errorCount: number
}

/**
 * Central manager for live sync operations and lifecycle
 */
export class LiveSyncManagerService {
  private sessions = new Map<string, LiveSyncSession>()

  // Reactive state
  private activeSessions = ref<LiveSyncSession[]>([])
  private globalStats = reactive({
    totalSessions: 0,
    activeSessions: 0,
    totalSyncsToday: 0,
    lastActivity: null as Date | null,
    isGloballyEnabled: true,
  })

  constructor() {
    // Delay initialization slightly to ensure collections are loaded
    this.delayedInitialization()
    this.setupVisibilityHandling()
    this.setupPersistence() // Add persistence setup
  }

  /**
   * Delayed initialization to ensure collections and sources are loaded
   */
  private async delayedInitialization(): Promise<void> {
    // Wait a bit for collections to load from store
    await new Promise((resolve) => setTimeout(resolve, 500))
    await this.initializeFromExistingCollections()
  }

  /**
   * Start live sync for a source
   */
  async startLiveSync(
    sourceId: string,
    options: {
      pollInterval?: number
      autoSync?: boolean
      startPolling?: boolean
    } = {}
  ): Promise<void> {
    try {
      // Check if already active
      if (this.sessions.has(sourceId)) {
        console.warn(`Live sync already active for source: ${sourceId}`)
        return
      }

      // Get source details (getSource is synchronous)
      const source = liveSpecSourceService.getSource(sourceId)
      if (!source) {
        throw new Error(`Source not found: ${sourceId}`)
      }

      // Create session
      const pollInterval =
        options.pollInterval || (source.config as any).pollInterval || 30000

      const session: LiveSyncSession = {
        sourceId,
        source,
        isActive: true,
        startedAt: new Date(),
        pollInterval,
        autoSync: options.autoSync !== false, // Default to true
        status: "active",
        errorCount: 0,
      }

      this.sessions.set(sourceId, session)

      // Start polling if requested (default: true)
      if (options.startPolling !== false && session.autoSync) {
        await liveSyncPollingService.startPolling(
          sourceId,
          session.pollInterval
        )
      }

      // Update reactive state
      this.updateReactiveState()

      // Show notification
      changeNotificationService.showToast({
        type: "success",
        title: "Live Sync Started",
        message: `Now monitoring ${source.name} for changes`,
        duration: 3000,
      })
    } catch (error) {
      console.error(`Failed to start live sync for ${sourceId}:`, error)
      throw error
    }
  }

  /**
   * Stop live sync for a source
   */
  async stopLiveSync(sourceId: string): Promise<void> {
    const session = this.sessions.get(sourceId)
    if (!session) {
      console.warn(`No active live sync session for source: ${sourceId}`)
      return
    }

    try {
      // Stop polling
      liveSyncPollingService.stopPolling(sourceId)

      // Update session status
      session.status = "stopped"
      session.isActive = false

      // Remove from active sessions
      this.sessions.delete(sourceId)

      // Update reactive state
      this.updateReactiveState()

      // Show notification
      changeNotificationService.showToast({
        type: "info",
        title: "Live Sync Stopped",
        message: `Stopped monitoring ${session.source.name}`,
        duration: 3000,
      })
    } catch (error) {
      console.error(`Error stopping live sync for ${sourceId}:`, error)
    }
  }

  /**
   * Pause live sync for a source (keeps session but stops polling)
   */
  async pauseLiveSync(sourceId: string): Promise<void> {
    const session = this.sessions.get(sourceId)
    if (!session) {
      console.warn(`No active live sync session for source: ${sourceId}`)
      return
    }

    // Stop polling but keep session
    liveSyncPollingService.stopPolling(sourceId)

    session.status = "paused"
    session.isActive = false

    this.updateReactiveState()

    changeNotificationService.showToast({
      type: "info",
      title: "Live Sync Paused",
      message: `Paused monitoring ${session.source.name}`,
      duration: 3000,
    })
  }

  /**
   * Resume live sync for a paused source
   */
  async resumeLiveSync(sourceId: string): Promise<void> {
    const session = this.sessions.get(sourceId)
    if (!session || session.status !== "paused") {
      console.warn(`No paused live sync session for source: ${sourceId}`)
      return
    }

    try {
      // Resume polling
      await liveSyncPollingService.startPolling(sourceId, session.pollInterval)

      session.status = "active"
      session.isActive = true

      this.updateReactiveState()

      changeNotificationService.showToast({
        type: "success",
        title: "Live Sync Resumed",
        message: `Resumed monitoring ${session.source.name}`,
        duration: 3000,
      })
    } catch (error) {
      console.error(`Failed to resume live sync for ${sourceId}:`, error)
      session.status = "error"
      session.errorCount++
    }
  }

  /**
   * Stop all active live sync sessions
   */
  async stopAllLiveSync(): Promise<void> {
    const activeSourceIds = Array.from(this.sessions.keys())

    for (const sourceId of activeSourceIds) {
      await this.stopLiveSync(sourceId)
    }

    changeNotificationService.showToast({
      type: "info",
      title: "All Live Sync Stopped",
      message: `Stopped monitoring ${activeSourceIds.length} sources`,
      duration: 3000,
    })
  }

  /**
   * Get session information for a source
   */
  getSession(sourceId: string): LiveSyncSession | null {
    return this.sessions.get(sourceId) || null
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): LiveSyncSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive)
  }

  /**
   * Get all sessions (active and inactive)
   */
  getAllSessions(): LiveSyncSession[] {
    return Array.from(this.sessions.values())
  }

  /**
   * Update poll interval for a source
   */
  async updatePollInterval(
    sourceId: string,
    newInterval: number
  ): Promise<void> {
    const session = this.sessions.get(sourceId)
    if (!session) {
      console.warn(`No session found for source: ${sourceId}`)
      return
    }

    session.pollInterval = newInterval

    // Update polling service if active
    if (session.isActive && session.status === "active") {
      liveSyncPollingService.updatePollInterval(sourceId, newInterval)
    }

    changeNotificationService.showToast({
      type: "success",
      title: "Poll Interval Updated",
      message: `Updated ${session.source.name} to poll every ${newInterval / 1000}s`,
      duration: 3000,
    })
  }

  /**
   * Toggle auto-sync for a source
   */
  async toggleAutoSync(sourceId: string): Promise<void> {
    const session = this.sessions.get(sourceId)
    if (!session) {
      console.warn(`No session found for source: ${sourceId}`)
      return
    }

    session.autoSync = !session.autoSync

    if (session.autoSync && session.status === "paused") {
      await this.resumeLiveSync(sourceId)
    } else if (!session.autoSync && session.status === "active") {
      await this.pauseLiveSync(sourceId)
    }
  }

  /**
   * Trigger manual sync for a source
   */
  async triggerManualSync(sourceId: string): Promise<void> {
    const session = this.sessions.get(sourceId)
    if (!session) {
      console.warn(`No session found for source: ${sourceId}`)
      return
    }

    try {
      // Start performance monitoring
      performanceMonitorService.startSyncMeasurement(sourceId)

      // Trigger sync
      await syncEngineService.triggerSync(sourceId)

      // Update session
      session.lastSyncAt = new Date()
      this.globalStats.lastActivity = new Date()
      this.globalStats.totalSyncsToday++

      changeNotificationService.showToast({
        type: "success",
        title: "Manual Sync Complete",
        message: `Successfully synced ${session.source.name}`,
        duration: 3000,
      })
    } catch (error) {
      console.error(`Manual sync failed for ${sourceId}:`, error)
      session.errorCount++

      changeNotificationService.showToast({
        type: "error",
        title: "Manual Sync Failed",
        message: `Failed to sync ${session.source.name}`,
        duration: 5000,
      })
    }
  }

  /**
   * Initialize sessions from existing live sync collections
   */
  private async initializeFromExistingCollections(): Promise<void> {
    try {
      const liveSyncCollections = getLiveSyncCollections()
      if (liveSyncCollections.length > 0) {
        // Wait for sources to load from storage (with timeout)
        const maxWaitTime = 2000 // 2 seconds max wait
        const startTime = Date.now()
        let sources = liveSpecSourceService.getSources()

        // Wait for sources to load, but not indefinitely
        while (sources.length === 0 && Date.now() - startTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, 50))
          sources = liveSpecSourceService.getSources()
        }
      } else {
        // Fallback: Try to find collections by matching sourceIds
        // This handles cases where collections have sourceId but isLiveSync isn't set
        const allCollections = restCollectionStore.value.state
        const sources = liveSpecSourceService.getSources()

        // Try to match collections by sourceId
        for (const source of sources) {
          const matchingCollectionIndex = allCollections.findIndex(
            (col): col is LiveSyncCollection =>
              "liveMetadata" in col &&
              (col as LiveSyncCollection).liveMetadata?.sourceId === source.id
          )
          if (matchingCollectionIndex >= 0) {
            const matchingCollection = allCollections[
              matchingCollectionIndex
            ] as LiveSyncCollection
            // Ensure isLiveSync is set - update through store function
            const currentMetadata = matchingCollection.liveMetadata
            const metadataToSet = {
              isLiveSync: true,
              sourceId: source.id,
              ...(currentMetadata
                ? {
                    lastSyncTime: currentMetadata.lastSyncTime,
                    syncStrategy: currentMetadata.syncStrategy || "incremental",
                    customizations: currentMetadata.customizations,
                    originalSpecHash: currentMetadata.originalSpecHash,
                  }
                : {
                    syncStrategy: "incremental" as const,
                  }),
            }
            setCollectionLiveMetadata(
              matchingCollectionIndex,
              metadataToSet as any
            )
            // Re-read from store to get updated collection
            const updatedCollection = restCollectionStore.value.state[
              matchingCollectionIndex
            ] as LiveSyncCollection
            // Add to liveSyncCollections array for processing
            liveSyncCollections.push(updatedCollection)
          }
        }

        // If still no matches, try matching by name as a last resort
        // This handles cases where collections were created but liveMetadata wasn't saved
        if (liveSyncCollections.length === 0) {
          for (const source of sources) {
            const matchingCollectionIndex = allCollections.findIndex(
              (col) => col.name === source.name
            )
            if (matchingCollectionIndex >= 0) {
              // Create liveMetadata for this collection
              const metadataToSet = {
                isLiveSync: true,
                sourceId: source.id,
                syncStrategy: source.syncStrategy || ("incremental" as const),
                syncConfig: {
                  autoSync: true,
                  syncInterval: (source.config as any).pollInterval || 30000,
                },
              }
              setCollectionLiveMetadata(
                matchingCollectionIndex,
                metadataToSet as any
              )

              // Re-read from store to get updated collection
              const updatedCollection = restCollectionStore.value.state[
                matchingCollectionIndex
              ] as LiveSyncCollection
              liveSyncCollections.push(updatedCollection)
            }
          }
        }

        if (liveSyncCollections.length === 0) {
          return
        }
      }

      for (const collection of liveSyncCollections) {
        const sourceId = collection.liveMetadata?.sourceId
        if (!sourceId) {
          console.warn(`Collection ${collection.name} has no sourceId`)
          continue
        }

        // Verify source exists before starting sync
        const source = liveSpecSourceService.getSource(sourceId)
        if (!source) {
          console.warn(
            `Source ${sourceId} not found for collection ${collection.name}, skipping`
          )
          continue
        }

        // Check if autoSync is enabled (default to true if not specified)
        const autoSync = collection.liveMetadata?.syncConfig?.autoSync !== false

        // Get poll interval from collection syncConfig, source config, or default
        const pollInterval =
          collection.liveMetadata?.syncConfig?.syncInterval ||
          (source.config as any).pollInterval ||
          30000

        if (autoSync) {
          // Check if session already exists (from persistence)
          if (!this.sessions.has(sourceId)) {
            try {
              // Auto-start live sync for collections with autoSync enabled
              await this.startLiveSync(sourceId, {
                pollInterval,
                autoSync: true,
                startPolling: true,
              })
            } catch (error) {
              console.error(
                `Failed to start live sync for source ${sourceId}:`,
                error
              )
            }
          }
        }
      }
    } catch (error) {
      console.error(
        "Failed to initialize live sync from existing collections:",
        error
      )
    }
  }

  /**
   * Handle browser visibility changes (pause/resume polling when tab is hidden/visible)
   */
  private setupVisibilityHandling(): void {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          this.pauseAllPolling()
        } else {
          this.resumeAllPolling()
        }
      })
    }
  }

  /**
   * Pause all active polling sessions
   */
  private pauseAllPolling(): void {
    for (const [sourceId, session] of this.sessions) {
      if (session.status === "active" && session.autoSync) {
        liveSyncPollingService.stopPolling(sourceId, true) // Preserve state
        session.status = "paused"
      }
    }
  }

  /**
   * Resume all paused polling sessions
   */
  private resumeAllPolling(): void {
    for (const [sourceId, session] of this.sessions) {
      if (session.status === "paused" && session.autoSync) {
        liveSyncPollingService.resumePolling(sourceId)
        session.status = "active"
      }
    }
  }

  /**
   * Setup persistence for live sync sessions
   */
  private setupPersistence(): void {
    // Save sessions to persistence service whenever they change
    watch(
      () => Array.from(this.sessions.values()),
      async (sessions) => {
        try {
          const persistenceService = getService(PersistenceService)
          const sessionData = sessions.map((session) => ({
            sourceId: session.sourceId,
            pollInterval: session.pollInterval,
            autoSync: session.autoSync,
            status: session.status,
            startedAt: session.startedAt.toISOString(),
          }))
          await persistenceService.setLocalConfig(
            "hoppscotch-live-sync-sessions",
            JSON.stringify(sessionData)
          )
        } catch (error) {
          console.error("Failed to persist live sync sessions:", error)
        }
      },
      { deep: true }
    )

    // Load sessions from persistence service on startup
    this.loadPersistedSessions()
  }

  /**
   * Load persisted sessions from persistence service
   */
  private async loadPersistedSessions(): Promise<void> {
    try {
      const persistenceService = getService(PersistenceService)
      const persistedData = await persistenceService.getLocalConfig(
        "hoppscotch-live-sync-sessions"
      )
      if (persistedData) {
        const sessions = JSON.parse(persistedData)

        // Restore sessions
        for (const sessionData of sessions) {
          if (sessionData.status === "active") {
            // Restart the session
            this.restoreSession(sessionData)
          }
        }
      }
    } catch (error) {
      console.error("Failed to load persisted live sync sessions:", error)
    }
  }

  /**
   * Restore a session from persisted data
   */
  private async restoreSession(sessionData: any): Promise<void> {
    try {
      // Get source details
      const source = liveSpecSourceService.getSource(sessionData.sourceId)
      if (!source) {
        console.warn(
          `Source not found for restored session: ${sessionData.sourceId}`
        )
        return
      }

      // Create session
      const session: LiveSyncSession = {
        sourceId: sessionData.sourceId,
        source,
        isActive: true,
        startedAt: new Date(sessionData.startedAt),
        pollInterval: sessionData.pollInterval,
        autoSync: sessionData.autoSync,
        status: "active",
        errorCount: 0,
      }

      this.sessions.set(sessionData.sourceId, session)

      // Restart polling
      if (session.autoSync) {
        await liveSyncPollingService.startPolling(
          sessionData.sourceId,
          session.pollInterval
        )
      }

      console.log(
        `Restored live sync session for source: ${sessionData.sourceId}`
      )
    } catch (error) {
      console.error(
        `Failed to restore session for ${sessionData.sourceId}:`,
        error
      )
    }
  }

  /**
   * Update reactive state for UI components
   */
  private updateReactiveState(): void {
    this.activeSessions.value = this.getActiveSessions()
    this.globalStats.totalSessions = this.sessions.size
    this.globalStats.activeSessions = this.getActiveSessions().length
  }

  /**
   * Get reactive state for UI components
   */
  getReactiveState() {
    return {
      activeSessions: this.activeSessions,
      globalStats: this.globalStats,
    }
  }

  /**
   * Enable/disable live sync globally
   */
  setGlobalEnabled(enabled: boolean): void {
    this.globalStats.isGloballyEnabled = enabled

    if (!enabled) {
      // Stop all active sessions
      this.stopAllLiveSync()
    }

    changeNotificationService.showToast({
      type: enabled ? "success" : "info",
      title: `Live Sync ${enabled ? "Enabled" : "Disabled"}`,
      message: enabled
        ? "Live sync is now active"
        : "Live sync has been disabled",
      duration: 3000,
    })
  }

  /**
   * Cleanup on service destruction
   */
  destroy(): void {
    this.stopAllLiveSync()
    liveSyncPollingService.destroy()
  }
}

// Export singleton instance
export const liveSyncManagerService = new LiveSyncManagerService()
