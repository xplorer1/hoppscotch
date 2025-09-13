/**
 * Team Live Sync Service
 * Handles team collaboration features for shared development environments
 */

import { reactive } from "vue"
import type { LiveSpecSource, SyncResult } from "../types/live-spec-source"
import type { SpecDiff } from "../types/spec-diff"
import { liveSpecSourceService } from "./live-spec-source.service"
import { syncEngineService } from "./sync-engine.service"
import { changeNotificationService } from "./change-notification.service"

export interface TeamLiveSource extends LiveSpecSource {
  teamId: string
  sharedBy: string // User ID who shared the source
  sharedAt: Date
  permissions: {
    canEdit: boolean
    canSync: boolean
    canDelete: boolean
  }
  subscribers: string[] // User IDs subscribed to updates
}

export interface TeamSyncEvent {
  id: string
  teamId: string
  sourceId: string
  userId: string
  type:
    | "sync_started"
    | "sync_completed"
    | "sync_failed"
    | "source_shared"
    | "source_updated"
  timestamp: Date
  data?: any
}

export interface ConflictResolution {
  conflictId: string
  sourceId: string
  teamId: string
  conflictType: "concurrent_sync" | "user_vs_code_changes" | "breaking_changes"
  description: string
  options: Array<{
    id: string
    label: string
    description: string
    action: () => Promise<void>
  }>
  resolvedBy?: string
  resolvedAt?: Date
}

class TeamLiveSyncService {
  private teamSources = reactive<Map<string, TeamLiveSource[]>>(new Map())
  private activeConflicts = reactive<ConflictResolution[]>([])
  private syncEvents = reactive<TeamSyncEvent[]>([])
  private subscribers = reactive<Map<string, Set<string>>>(new Map()) // teamId -> userIds

  /**
   * Share a live source with team members
   */
  async shareSourceWithTeam(
    sourceId: string,
    teamId: string,
    permissions: TeamLiveSource["permissions"]
  ): Promise<TeamLiveSource> {
    const source = liveSpecSourceService.getSource(sourceId)
    if (!source) {
      throw new Error("Source not found")
    }

    const teamSource: TeamLiveSource = {
      ...source,
      teamId,
      sharedBy: "current-user", // TODO: Get from auth service
      sharedAt: new Date(),
      permissions,
      subscribers: [],
    }

    // Add to team sources
    const teamSources = this.teamSources.get(teamId) || []
    teamSources.push(teamSource)
    this.teamSources.set(teamId, teamSources)

    // Emit event
    this.emitTeamEvent({
      teamId,
      sourceId,
      userId: "current-user",
      type: "source_shared",
      data: { permissions },
    })

    // Notify team members
    changeNotificationService.showToast({
      type: "success",
      title: "Source Shared",
      message: `Live source "${source.name}" shared with team`,
    })

    return teamSource
  }

  /**
   * Get all live sources shared with a team
   */
  getTeamSources(teamId: string): TeamLiveSource[] {
    return this.teamSources.get(teamId) || []
  }

  /**
   * Subscribe to team sync updates
   */
  subscribeToTeamUpdates(teamId: string, userId: string): void {
    const subscribers = this.subscribers.get(teamId) || new Set()
    subscribers.add(userId)
    this.subscribers.set(teamId, subscribers)
  }

  /**
   * Unsubscribe from team sync updates
   */
  unsubscribeFromTeamUpdates(teamId: string, userId: string): void {
    const subscribers = this.subscribers.get(teamId)
    if (subscribers) {
      subscribers.delete(userId)
    }
  }

  /**
   * Sync a team source with conflict detection
   */
  async syncTeamSource(
    sourceId: string,
    teamId: string,
    userId: string
  ): Promise<SyncResult> {
    const teamSource = this.getTeamSource(teamId, sourceId)
    if (!teamSource) {
      throw new Error("Team source not found")
    }

    if (!teamSource.permissions.canSync) {
      throw new Error("Insufficient permissions to sync this source")
    }

    // Check for concurrent syncs
    const concurrentSync = this.syncEvents.find(
      (event) =>
        event.sourceId === sourceId &&
        event.type === "sync_started" &&
        event.timestamp > new Date(Date.now() - 30000) // Within last 30 seconds
    )

    if (concurrentSync && concurrentSync.userId !== userId) {
      // Handle concurrent sync conflict
      await this.handleConcurrentSyncConflict(
        sourceId,
        teamId,
        userId,
        concurrentSync.userId
      )
      throw new Error("Concurrent sync detected. Please resolve conflict.")
    }

    // Emit sync started event
    this.emitTeamEvent({
      teamId,
      sourceId,
      userId,
      type: "sync_started",
    })

    try {
      // Perform the sync
      const result = await syncEngineService.triggerSync(sourceId)

      // Emit sync completed event
      this.emitTeamEvent({
        teamId,
        sourceId,
        userId,
        type: "sync_completed",
        data: result,
      })

      // Notify team members if there were changes
      if (result.success && result.changes) {
        this.notifyTeamMembers(teamId, sourceId, result.changes, userId)
      }

      return result
    } catch (error) {
      // Emit sync failed event
      this.emitTeamEvent({
        teamId,
        sourceId,
        userId,
        type: "sync_failed",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      })

      throw error
    }
  }

  /**
   * Handle conflicts between team members and code changes
   */
  async handleUserVsCodeConflict(
    sourceId: string,
    teamId: string,
    userChanges: any,
    codeChanges: SpecDiff
  ): Promise<void> {
    const conflict: ConflictResolution = {
      conflictId: `conflict_${Date.now()}`,
      sourceId,
      teamId,
      conflictType: "user_vs_code_changes",
      description: "Team member modifications conflict with code changes",
      options: [
        {
          id: "keep_user_changes",
          label: "Keep Team Changes",
          description:
            "Preserve team member modifications and skip code updates",
          action: async () => {
            // Skip the code update
            await this.resolveConflict(conflict.conflictId, "keep_user_changes")
          },
        },
        {
          id: "apply_code_changes",
          label: "Apply Code Changes",
          description: "Apply code changes and overwrite team modifications",
          action: async () => {
            // Apply code changes
            await syncEngineService.applyChanges(sourceId, codeChanges)
            await this.resolveConflict(
              conflict.conflictId,
              "apply_code_changes"
            )
          },
        },
        {
          id: "merge_changes",
          label: "Merge Changes",
          description: "Attempt to merge both sets of changes",
          action: async () => {
            // Attempt intelligent merge
            await this.mergeChanges(sourceId, userChanges, codeChanges)
            await this.resolveConflict(conflict.conflictId, "merge_changes")
          },
        },
      ],
    }

    this.activeConflicts.push(conflict)

    // Notify team members about the conflict
    changeNotificationService.showToast({
      type: "warning",
      title: "Sync Conflict",
      message: "Team modifications conflict with code changes",
      duration: 0, // Don't auto-dismiss
      actions: [
        {
          label: "Resolve Conflict",
          action: () => this.showConflictResolutionUI(conflict),
          style: "primary",
        },
      ],
    })
  }

  /**
   * Get active conflicts for a team
   */
  getActiveConflicts(teamId: string): ConflictResolution[] {
    return this.activeConflicts.filter((conflict) => conflict.teamId === teamId)
  }

  /**
   * Resolve a conflict
   */
  async resolveConflict(conflictId: string, resolution: string): Promise<void> {
    const conflictIndex = this.activeConflicts.findIndex(
      (c) => c.conflictId === conflictId
    )
    if (conflictIndex === -1) {
      throw new Error("Conflict not found")
    }

    const conflict = this.activeConflicts[conflictIndex]
    conflict.resolvedBy = "current-user" // TODO: Get from auth service
    conflict.resolvedAt = new Date()

    // Remove from active conflicts
    this.activeConflicts.splice(conflictIndex, 1)

    changeNotificationService.showToast({
      type: "success",
      title: "Conflict Resolved",
      message: `Sync conflict resolved using: ${resolution}`,
    })
  }

  /**
   * Get team sync events
   */
  getTeamSyncEvents(teamId: string, limit = 50): TeamSyncEvent[] {
    return this.syncEvents
      .filter((event) => event.teamId === teamId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
  }

  // Private helper methods
  private getTeamSource(
    teamId: string,
    sourceId: string
  ): TeamLiveSource | undefined {
    const teamSources = this.teamSources.get(teamId) || []
    return teamSources.find((source) => source.id === sourceId)
  }

  private emitTeamEvent(event: Omit<TeamSyncEvent, "id" | "timestamp">): void {
    const teamEvent: TeamSyncEvent = {
      ...event,
      id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      timestamp: new Date(),
    }

    this.syncEvents.push(teamEvent)

    // Limit event history
    if (this.syncEvents.length > 1000) {
      this.syncEvents.splice(0, this.syncEvents.length - 1000)
    }
  }

  private async handleConcurrentSyncConflict(
    sourceId: string,
    teamId: string,
    currentUserId: string,
    otherUserId: string
  ): Promise<void> {
    const conflict: ConflictResolution = {
      conflictId: `concurrent_${Date.now()}`,
      sourceId,
      teamId,
      conflictType: "concurrent_sync",
      description: `Another team member is currently syncing this source`,
      options: [
        {
          id: "wait_and_retry",
          label: "Wait and Retry",
          description: "Wait for the other sync to complete and try again",
          action: async () => {
            // Wait a bit and retry
            setTimeout(() => {
              this.syncTeamSource(sourceId, teamId, currentUserId)
            }, 5000)
            await this.resolveConflict(conflict.conflictId, "wait_and_retry")
          },
        },
        {
          id: "cancel_sync",
          label: "Cancel Sync",
          description: "Cancel this sync operation",
          action: async () => {
            await this.resolveConflict(conflict.conflictId, "cancel_sync")
          },
        },
      ],
    }

    this.activeConflicts.push(conflict)
  }

  private notifyTeamMembers(
    teamId: string,
    sourceId: string,
    changes: SpecDiff,
    syncedBy: string
  ): void {
    const subscribers = this.subscribers.get(teamId)
    if (!subscribers || subscribers.size === 0) return

    const teamSource = this.getTeamSource(teamId, sourceId)
    if (!teamSource) return

    // Notify all subscribers except the one who triggered the sync
    subscribers.forEach((userId) => {
      if (userId !== syncedBy) {
        changeNotificationService.showToast({
          type: "info",
          title: "Team Source Updated",
          message: `${teamSource.name} was updated by a team member`,
          actions: [
            {
              label: "View Changes",
              action: () => this.showTeamChanges(teamSource, changes),
            },
          ],
        })
      }
    })
  }

  private async mergeChanges(
    sourceId: string,
    userChanges: any,
    codeChanges: SpecDiff
  ): Promise<void> {
    // This is a simplified merge implementation
    // In a real implementation, you'd have sophisticated merge logic
    console.log(
      "Merging changes for source:",
      sourceId,
      userChanges,
      codeChanges
    )

    // For now, just apply code changes and preserve user customizations
    await syncEngineService.applyChanges(sourceId, codeChanges, {
      preserveUserCustomizations: true,
    })
  }

  private showConflictResolutionUI(conflict: ConflictResolution): void {
    // This would open a modal or panel for conflict resolution
    console.log("Showing conflict resolution UI for:", conflict)
  }

  private showTeamChanges(source: TeamLiveSource, changes: SpecDiff): void {
    // This would open the diff viewer for team changes
    console.log("Showing team changes for:", source.name, changes)
  }
}

// Export singleton instance
export const teamLiveSyncService = new TeamLiveSyncService()
export default teamLiveSyncService
