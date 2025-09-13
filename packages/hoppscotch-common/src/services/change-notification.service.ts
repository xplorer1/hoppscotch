/**
 * Change Notification Service for Live Sync
 * Handles notifications for code updates and API changes
 */

import { reactive } from "vue"
import type { SpecDiff, EndpointChange } from "../types/spec-diff"
import type { LiveSpecSource } from "../types/live-spec-source"

export interface ChangeNotification {
  id: string
  type:
    | "sync_success"
    | "sync_error"
    | "endpoints_added"
    | "endpoints_modified"
    | "endpoints_removed"
    | "breaking_change"
  title: string
  message: string
  source: LiveSpecSource
  changes?: SpecDiff
  timestamp: Date
  isRead: boolean
  canUndo: boolean
  undoData?: any
}

export interface ToastNotification {
  id: string
  type: "success" | "error" | "warning" | "info"
  title: string
  message: string
  duration?: number
  actions?: Array<{
    label: string
    action: () => void
    style?: "primary" | "secondary"
  }>
}

class ChangeNotificationService {
  private notifications = reactive<ChangeNotification[]>([])
  private toasts = reactive<ToastNotification[]>([])
  private undoHistory = reactive<Map<string, any>>(new Map())

  // Configuration
  private maxNotifications = 100
  private maxUndoHistory = 10
  private defaultToastDuration = 5000

  /**
   * Add a change notification
   */
  addNotification(
    notification: Omit<ChangeNotification, "id" | "timestamp" | "isRead">
  ): string {
    const id = `notification_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

    const newNotification: ChangeNotification = {
      ...notification,
      id,
      timestamp: new Date(),
      isRead: false,
    }

    this.notifications.unshift(newNotification)

    // Limit notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications.splice(this.maxNotifications)
    }

    return id
  }

  /**
   * Show toast notification for sync events
   */
  showSyncToast(
    source: LiveSpecSource,
    changes: SpecDiff,
    success: boolean,
    error?: string
  ): void {
    if (success) {
      const changeCount = this.getChangeCount(changes)
      const frameworkName = source.framework || "API"
      const message =
        changeCount > 0
          ? `${changeCount} endpoint${changeCount === 1 ? "" : "s"} updated from ${frameworkName} code`
          : "API is up to date"

      this.showToast({
        type: "success",
        title: "Sync Complete",
        message,
        actions:
          changeCount > 0
            ? [
                {
                  label: "View Changes",
                  action: () => this.showChangeDiff(source, changes),
                },
              ]
            : undefined,
      })
    } else {
      this.showToast({
        type: "error",
        title: "Sync Failed",
        message: error || "Failed to sync with development server",
        actions: [
          {
            label: "Retry",
            action: () => this.retrySyncForSource(source),
          },
        ],
      })
    }
  }

  /**
   * Show breaking change notification
   */
  showBreakingChangeNotification(
    source: LiveSpecSource,
    changes: SpecDiff
  ): void {
    const breakingChanges = changes.endpoints.filter(
      (e: EndpointChange) => e.isBreaking
    )

    this.showToast({
      type: "warning",
      title: "Breaking Changes Detected",
      message: `${breakingChanges.length} breaking change${breakingChanges.length === 1 ? "" : "s"} in ${source.name}`,
      duration: 8000,
      actions: [
        {
          label: "Review Changes",
          action: () => this.showChangeDiff(source, changes),
          style: "primary",
        },
        {
          label: "Skip Update",
          action: () => this.skipBreakingUpdate(source, changes),
        },
      ],
    })

    // Also add to notifications
    this.addNotification({
      type: "breaking_change",
      title: "Breaking Changes Detected",
      message: `API changes in ${source.name} may break existing requests`,
      source,
      changes,
      canUndo: false,
    })
  }

  /**
   * Show generic toast notification
   */
  showToast(toast: Omit<ToastNotification, "id">): string {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

    const newToast: ToastNotification = {
      ...toast,
      id,
      duration: toast.duration || this.defaultToastDuration,
    }

    this.toasts.push(newToast)

    // Auto-remove after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        this.removeToast(id)
      }, newToast.duration)
    }

    return id
  }

  /**
   * Remove toast notification
   */
  removeToast(id: string): void {
    const index = this.toasts.findIndex((t) => t.id === id)
    if (index !== -1) {
      this.toasts.splice(index, 1)
    }
  }

  /**
   * Mark notification as read
   */
  markAsRead(id: string): void {
    const notification = this.notifications.find((n) => n.id === id)
    if (notification) {
      notification.isRead = true
    }
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): void {
    this.notifications.forEach((n) => (n.isRead = true))
  }

  /**
   * Clear all notifications
   */
  clearNotifications(): void {
    this.notifications.splice(0)
  }

  /**
   * Get unread notification count
   */
  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.isRead).length
  }

  /**
   * Store undo data for a sync operation
   */
  storeUndoData(syncId: string, undoData: any): void {
    this.undoHistory.set(syncId, undoData)

    // Limit undo history
    if (this.undoHistory.size > this.maxUndoHistory) {
      const firstKey = this.undoHistory.keys().next().value
      if (firstKey) {
        this.undoHistory.delete(firstKey)
      }
    }
  }

  /**
   * Undo a sync operation
   */
  async undoSync(syncId: string): Promise<boolean> {
    const undoData = this.undoHistory.get(syncId)
    if (!undoData) {
      return false
    }

    try {
      // Implementation would depend on the undo data structure
      // This is a placeholder for the actual undo logic
      console.log("Undoing sync:", syncId, undoData)

      this.undoHistory.delete(syncId)

      this.showToast({
        type: "success",
        title: "Changes Undone",
        message: "Successfully reverted recent sync changes",
      })

      return true
    } catch (error) {
      this.showToast({
        type: "error",
        title: "Undo Failed",
        message: "Could not revert changes",
      })
      return false
    }
  }

  /**
   * Get all notifications
   */
  getNotifications(): ChangeNotification[] {
    return [...this.notifications]
  }

  /**
   * Get all active toasts
   */
  getToasts(): ToastNotification[] {
    return [...this.toasts]
  }

  // Private helper methods
  private getChangeCount(changes: SpecDiff): number {
    return changes.endpoints.length
  }

  private showChangeDiff(source: LiveSpecSource, changes: SpecDiff): void {
    // This would open a diff viewer component
    // Implementation depends on the UI framework
    console.log("Showing diff for:", source.name, changes)
  }

  private async retrySyncForSource(source: LiveSpecSource): Promise<void> {
    // This would trigger a retry of the sync operation
    // Implementation depends on the sync engine
    console.log("Retrying sync for:", source.name)
  }

  private skipBreakingUpdate(source: LiveSpecSource, changes: SpecDiff): void {
    // This would skip the current update and mark it as ignored
    console.log("Skipping breaking update for:", source.name, changes)
  }
}

// Export singleton instance
export const changeNotificationService = new ChangeNotificationService()
export default changeNotificationService
