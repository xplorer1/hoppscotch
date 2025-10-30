/**
 * Live Sync Polling Service
 *
 * Manages background polling for live sync sources to detect changes automatically
 */

import { reactive, ref } from "vue"
import type { LiveSpecSource, URLSourceConfig } from "~/types/live-spec-source"
import type { SpecDiff } from "~/types/spec-diff"
import { liveSpecSourceService } from "./live-spec-source.service"
import { syncEngineService } from "./sync-engine.service"
import { changeNotificationService } from "./change-notification.service"
import { performanceMonitorService } from "./performance-monitor.service"
import { errorRecoveryService } from "./error-recovery.service"
import { SpecDiffEngine } from "~/helpers/live-spec-source/spec-diff-engine"

interface PollingState {
  sourceId: string
  interval: NodeJS.Timeout
  pollInterval: number
  lastSpecHash?: string
  isPolling: boolean
  lastPollTime?: Date
  consecutiveErrors: number
}

/**
 * Service for managing background polling of live sync sources
 */
export class LiveSyncPollingService {
  private pollingStates = new Map<string, PollingState>()
  private diffEngine = new SpecDiffEngine()

  // Reactive state for UI
  private activePolls = ref<string[]>([])
  private pollingStats = reactive({
    totalActivePolls: 0,
    totalPollsToday: 0,
    lastPollTime: null as Date | null,
  })

  /**
   * Start polling for a specific source
   */
  async startPolling(
    sourceId: string,
    customPollInterval?: number
  ): Promise<void> {
    // Don't start if already polling
    if (this.pollingStates.has(sourceId)) {
      console.warn(`Already polling source: ${sourceId}`)
      return
    }

    try {
      // Get source details
      const source = await liveSpecSourceService.getSource(sourceId)
      if (!source) {
        throw new Error(`Source not found: ${sourceId}`)
      }

      // Determine poll interval
      const pollInterval =
        customPollInterval ||
        (source.type === "url"
          ? (source.config as URLSourceConfig).pollInterval
          : undefined) ||
        30000 // 30 seconds default

      // Get initial spec for comparison
      let lastSpecHash: string | undefined
      try {
        const initialSpec = await this.fetchSourceSpec(source)
        if (initialSpec) {
          lastSpecHash = this.generateSpecHash(initialSpec)
        }
      } catch (error) {
        console.warn(`Failed to fetch initial spec for ${sourceId}:`, error)
      }

      // Create polling interval
      const interval = setInterval(async () => {
        await this.pollSource(sourceId)
      }, pollInterval)

      // Store polling state
      const pollingState: PollingState = {
        sourceId,
        interval,
        pollInterval,
        lastSpecHash,
        isPolling: true,
        consecutiveErrors: 0,
      }

      this.pollingStates.set(sourceId, pollingState)
      this.updateReactiveState()

      console.log(`Started polling source ${sourceId} every ${pollInterval}ms`)
    } catch (error) {
      console.error(`Failed to start polling for ${sourceId}:`, error)
      throw error
    }
  }

  /**
   * Stop polling for a specific source (but preserve state for potential resume)
   */
  stopPolling(sourceId: string, preserveState = false): void {
    const pollingState = this.pollingStates.get(sourceId)
    if (!pollingState) {
      console.warn(`No active polling for source: ${sourceId}`)
      return
    }

    clearInterval(pollingState.interval)

    if (preserveState) {
      // Keep the state but mark as stopped
      pollingState.isPolling = false
      console.log(`Paused polling source: ${sourceId} (preserving state)`)
    } else {
      // Delete state completely
      this.pollingStates.delete(sourceId)
      console.log(`Stopped polling source: ${sourceId}`)
    }

    this.updateReactiveState()
  }

  /**
   * Resume polling for a specific source
   */
  resumePolling(sourceId: string): void {
    const pollingState = this.pollingStates.get(sourceId)
    if (!pollingState) {
      console.warn(`No paused polling state for source: ${sourceId}`)
      return
    }

    if (pollingState.isPolling) {
      console.warn(`Already polling source: ${sourceId}`)
      return
    }

    // Create new interval
    const interval = setInterval(async () => {
      await this.pollSource(sourceId)
    }, pollingState.pollInterval)

    pollingState.interval = interval
    pollingState.isPolling = true
    this.updateReactiveState()

    console.log(`Resumed polling source ${sourceId}`)
  }

  /**
   * Stop all active polling
   */
  stopAllPolling(): void {
    for (const sourceId of this.pollingStates.keys()) {
      this.stopPolling(sourceId)
    }
  }

  /**
   * Get polling status for a source
   */
  getPollingStatus(sourceId: string): PollingState | null {
    return this.pollingStates.get(sourceId) || null
  }

  /**
   * Get all active polling sources
   */
  getActivePolls(): string[] {
    return Array.from(this.pollingStates.keys())
  }

  /**
   * Update poll interval for a source
   */
  updatePollInterval(sourceId: string, newInterval: number): void {
    const pollingState = this.pollingStates.get(sourceId)
    if (!pollingState) {
      console.warn(`No active polling for source: ${sourceId}`)
      return
    }

    // Stop current polling
    clearInterval(pollingState.interval)

    // Start new polling with updated interval
    const newIntervalHandle = setInterval(async () => {
      await this.pollSource(sourceId)
    }, newInterval)

    // Update state
    pollingState.interval = newIntervalHandle
    pollingState.pollInterval = newInterval

    console.log(`Updated poll interval for ${sourceId} to ${newInterval}ms`)
  }

  /**
   * Perform a single poll for a source
   */
  private async pollSource(sourceId: string): Promise<void> {
    const pollingState = this.pollingStates.get(sourceId)
    if (!pollingState) return

    // Log every polling attempt
    console.log(
      `Polling source ${sourceId} at ${new Date().toLocaleTimeString()}`
    )

    try {
      // Get source details
      const source = await liveSpecSourceService.getSource(sourceId)
      if (!source) {
        console.warn(`Source not found during polling: ${sourceId}`)
        this.stopPolling(sourceId)
        return
      }

      // Start performance monitoring
      performanceMonitorService.startSyncMeasurement(sourceId)

      // Fetch current spec
      console.log(`Fetching spec for source: ${sourceId}`)
      const currentSpec = await this.fetchSourceSpec(source)
      if (!currentSpec) {
        console.warn(`Failed to fetch spec during polling: ${sourceId}`)
        this.handlePollingError(sourceId, new Error("Failed to fetch spec"))
        return
      }

      // Generate hash for comparison
      const currentSpecHash = this.generateSpecHash(currentSpec)

      // Log spec info for debugging
      const endpointCount = currentSpec?.paths
        ? Object.keys(currentSpec.paths).length
        : 0
      const lastHash = pollingState.lastSpecHash
        ? pollingState.lastSpecHash.substring(0, 8)
        : "null"
      const currHash = currentSpecHash.substring(0, 8)
      console.log(
        `Spec info: ${endpointCount} paths, lastHash=${lastHash}..., currHash=${currHash}...`
      )

      // Check if spec has changed
      console.log(
        `Hash check: lastSpecHash=${pollingState.lastSpecHash?.substring(0, 8) || "undefined"}, currentHash=${currentSpecHash.substring(0, 8)}, hashesMatch=${pollingState.lastSpecHash === currentSpecHash}`
      )
      console.log(
        `Polling state: ${JSON.stringify({ hasLastSpecHash: !!pollingState.lastSpecHash, isPolling: pollingState.isPolling })}`
      )

      if (
        pollingState.lastSpecHash &&
        pollingState.lastSpecHash !== currentSpecHash
      ) {
        console.log(`Changes detected in source: ${sourceId}`)
        console.log(
          `Hash comparison: old=${pollingState.lastSpecHash}, new=${currentSpecHash}`
        )

        // Get previous spec for diff (if available)
        const previousSpec = await this.getPreviousSpec(sourceId)
        if (previousSpec) {
          // Generate diff
          const diffResult = await this.diffEngine.compareSpecs(
            previousSpec,
            currentSpec
          )
          console.log(`Diff result:`, diffResult)

          // Only trigger sync if there are actual changes
          if (diffResult.hasChanges) {
            console.log(
              `Diff detected: ${diffResult.summary.added} added, ${diffResult.summary.modified} modified, ${diffResult.summary.removed} removed`
            )

            // Convert to UI-friendly format
            const specDiff: SpecDiff = {
              hasChanges: true,
              endpoints: this.convertToEndpointChanges(diffResult.changes),
              summary: `${diffResult.summary.added} added, ${diffResult.summary.modified} modified, ${diffResult.summary.removed} removed`,
            }

            // Show notifications
            if (diffResult.summary.breaking > 0) {
              changeNotificationService.showBreakingChangeNotification(
                source,
                specDiff
              )
            } else {
              changeNotificationService.showSyncToast(source, specDiff, true)
            }

            // Trigger sync
            console.log(`Triggering sync for source: ${sourceId}`)
            try {
              const syncResult = await syncEngineService.triggerSync(sourceId)
              console.log(`Sync completed for source: ${sourceId}`, syncResult)
              // Update hash AFTER successful sync
              pollingState.lastSpecHash = currentSpecHash
            } catch (error) {
              console.error(`Sync failed for source: ${sourceId}`, error)
            }
          } else {
            console.log(
              `Hash changed but no diff detected - this may indicate cached spec. Updating hash anyway.`
            )
            // Update the hash even if no diff, so we don't keep checking the same thing
            pollingState.lastSpecHash = currentSpecHash
          }
        } else {
          // No previous spec available, just trigger sync
          console.log(
            `Triggering sync for source: ${sourceId} (no previous spec)`
          )
          try {
            const syncResult = await syncEngineService.triggerSync(sourceId)
            console.log(`Sync completed for source: ${sourceId}`, syncResult)
            // Update hash AFTER successful sync
            pollingState.lastSpecHash = currentSpecHash
          } catch (error) {
            console.error(`Sync failed for source: ${sourceId}`, error)
          }
        }
      } else {
        // Log when no changes are detected
        console.log(`No changes detected for source: ${sourceId}`)
      }

      // Update polling state (don't update lastSpecHash here - it's updated in sync handlers)
      pollingState.lastPollTime = new Date()
      pollingState.consecutiveErrors = 0

      // End performance monitoring
      performanceMonitorService.endSyncMeasurement(sourceId, currentSpec)

      // Update stats
      this.pollingStats.totalPollsToday++
      this.pollingStats.lastPollTime = new Date()
    } catch (error) {
      console.error(`Polling error for source ${sourceId}:`, error)
      this.handlePollingError(sourceId, error as Error)
    }
  }

  /**
   * Handle polling errors with exponential backoff
   */
  private handlePollingError(sourceId: string, error: Error): void {
    const pollingState = this.pollingStates.get(sourceId)
    if (!pollingState) return

    pollingState.consecutiveErrors++

    // Use error recovery service for intelligent retry
    errorRecoveryService.handleSyncError(sourceId, {
      type: "polling_error",
      message: error.message,
      timestamp: new Date(),
      retryCount: pollingState.consecutiveErrors,
    })

    // If too many consecutive errors, stop polling
    if (pollingState.consecutiveErrors >= 5) {
      console.error(
        `Too many consecutive errors for ${sourceId}, stopping polling`
      )
      this.stopPolling(sourceId)

      // Notify user
      changeNotificationService.showToast({
        type: "error",
        title: "Polling Stopped",
        message: `Stopped monitoring ${sourceId} due to repeated errors`,
        duration: 8000,
      })
    }
  }

  /**
   * Fetch spec from source
   */
  private async fetchSourceSpec(source: LiveSpecSource): Promise<any> {
    try {
      const result = await liveSpecSourceService.fetchSpec(source.id)
      return result.success ? result.spec : null
    } catch (error) {
      console.error(`Failed to fetch spec for ${source.id}:`, error)
      return null
    }
  }

  /**
   * Get previous spec for comparison (simplified - could be enhanced with caching)
   */
  private async getPreviousSpec(sourceId: string): Promise<any> {
    // Get from sync engine's stored specs
    try {
      const stored = syncEngineService.getStoredSpec(sourceId)
      console.log(`Getting previous spec: ${stored ? "found" : "not found"}`)
      return stored || null
    } catch {
      return null
    }
  }

  /**
   * Generate hash for spec comparison
   */
  private generateSpecHash(spec: any): string {
    const str = JSON.stringify(spec)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return hash.toString(16)
  }

  /**
   * Convert diff engine results to UI-friendly format
   */
  private convertToEndpointChanges(changes: any[]): any[] {
    return changes.map((change) => ({
      path: change.path,
      method: change.path.split(" ")[0] || "GET",
      type: change.type.includes("added")
        ? "added"
        : change.type.includes("removed")
          ? "removed"
          : "modified",
      isBreaking: change.severity === "breaking",
      summary: change.description,
    }))
  }

  /**
   * Update reactive state for UI
   */
  private updateReactiveState(): void {
    this.activePolls.value = Array.from(this.pollingStates.keys())
    this.pollingStats.totalActivePolls = this.pollingStates.size
  }

  /**
   * Get reactive polling statistics
   */
  getPollingStats() {
    return {
      activePolls: this.activePolls,
      stats: this.pollingStats,
    }
  }

  /**
   * Cleanup on service destruction
   */
  destroy(): void {
    this.stopAllPolling()
  }
}

// Export singleton instance
export const liveSyncPollingService = new LiveSyncPollingService()
