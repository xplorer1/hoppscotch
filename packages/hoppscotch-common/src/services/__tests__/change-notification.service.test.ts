import { describe, it, expect, beforeEach, vi } from "vitest"
import { changeNotificationService } from "../change-notification.service"
import type { LiveSpecSource } from "../../types/live-spec-source"
import type { SpecDiff } from "../../types/spec-diff"

describe("ChangeNotificationService", () => {
  const mockSource: LiveSpecSource = {
    id: "test-source",
    name: "Test API",
    type: "url",
    url: "http://localhost:3000/openapi.json",
    framework: "fastapi",
    isActive: true,
    lastSync: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockDiff: SpecDiff = {
    hasChanges: true,
    endpoints: [
      {
        path: "/users",
        method: "GET",
        type: "added",
        isBreaking: false,
        summary: "New endpoint added",
      },
      {
        path: "/users/{id}",
        method: "DELETE",
        type: "removed",
        isBreaking: true,
        summary: "Endpoint removed",
      },
    ],
    summary: "API updated with 2 changes",
  }

  beforeEach(() => {
    // Clear notifications before each test
    changeNotificationService.clearNotifications()

    // Clear toasts
    const toasts = changeNotificationService.getToasts()
    toasts.forEach((toast) => {
      changeNotificationService.removeToast(toast.id)
    })
  })

  describe("addNotification", () => {
    it("should add a notification with generated ID and timestamp", () => {
      const id = changeNotificationService.addNotification({
        type: "sync_success",
        title: "Sync Complete",
        message: "API updated successfully",
        source: mockSource,
        canUndo: false,
      })

      expect(id).toBeDefined()
      expect(typeof id).toBe("string")

      const notifications = changeNotificationService.getNotifications()
      expect(notifications).toHaveLength(1)
      expect(notifications[0].id).toBe(id)
      expect(notifications[0].isRead).toBe(false)
      expect(notifications[0].timestamp).toBeInstanceOf(Date)
    })

    it("should limit notifications to maximum count", () => {
      // Add more than max notifications
      for (let i = 0; i < 105; i++) {
        changeNotificationService.addNotification({
          type: "sync_success",
          title: `Notification ${i}`,
          message: "Test message",
          source: mockSource,
          canUndo: false,
        })
      }

      const notifications = changeNotificationService.getNotifications()
      expect(notifications.length).toBeLessThanOrEqual(100)
    })

    it("should add newest notifications first", () => {
      const id1 = changeNotificationService.addNotification({
        type: "sync_success",
        title: "First",
        message: "First message",
        source: mockSource,
        canUndo: false,
      })

      const id2 = changeNotificationService.addNotification({
        type: "sync_success",
        title: "Second",
        message: "Second message",
        source: mockSource,
        canUndo: false,
      })

      const notifications = changeNotificationService.getNotifications()
      expect(notifications[0].id).toBe(id2)
      expect(notifications[1].id).toBe(id1)
    })
  })

  describe("showSyncToast", () => {
    it("should show success toast for successful sync with changes", () => {
      changeNotificationService.showSyncToast(mockSource, mockDiff, true)

      const toasts = changeNotificationService.getToasts()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].type).toBe("success")
      expect(toasts[0].title).toBe("Sync Complete")
      expect(toasts[0].message).toContain("2 endpoints updated")
      expect(toasts[0].actions).toHaveLength(1)
      expect(toasts[0].actions![0].label).toBe("View Changes")
    })

    it("should show success toast for successful sync without changes", () => {
      const noDiff: SpecDiff = {
        hasChanges: false,
        endpoints: [],
        summary: "No changes",
      }

      changeNotificationService.showSyncToast(mockSource, noDiff, true)

      const toasts = changeNotificationService.getToasts()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].message).toBe("API is up to date")
      expect(toasts[0].actions).toBeUndefined()
    })

    it("should show error toast for failed sync", () => {
      changeNotificationService.showSyncToast(
        mockSource,
        mockDiff,
        false,
        "Connection failed"
      )

      const toasts = changeNotificationService.getToasts()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].type).toBe("error")
      expect(toasts[0].title).toBe("Sync Failed")
      expect(toasts[0].message).toBe("Connection failed")
      expect(toasts[0].actions).toHaveLength(1)
      expect(toasts[0].actions![0].label).toBe("Retry")
    })
  })

  describe("showBreakingChangeNotification", () => {
    it("should show warning toast and add notification for breaking changes", () => {
      changeNotificationService.showBreakingChangeNotification(
        mockSource,
        mockDiff
      )

      const toasts = changeNotificationService.getToasts()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].type).toBe("warning")
      expect(toasts[0].title).toBe("Breaking Changes Detected")
      expect(toasts[0].message).toContain("1 breaking change")
      expect(toasts[0].duration).toBe(8000)
      expect(toasts[0].actions).toHaveLength(2)

      const notifications = changeNotificationService.getNotifications()
      expect(notifications).toHaveLength(1)
      expect(notifications[0].type).toBe("breaking_change")
    })
  })

  describe("showToast", () => {
    it("should add toast with generated ID", () => {
      const id = changeNotificationService.showToast({
        type: "info",
        title: "Test Toast",
        message: "Test message",
      })

      expect(id).toBeDefined()
      const toasts = changeNotificationService.getToasts()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].id).toBe(id)
    })

    it("should auto-remove toast after duration", async () => {
      const id = changeNotificationService.showToast({
        type: "info",
        title: "Test Toast",
        message: "Test message",
        duration: 100,
      })

      expect(changeNotificationService.getToasts()).toHaveLength(1)

      // Wait for auto-removal
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(changeNotificationService.getToasts()).toHaveLength(0)
    })

    it("should not auto-remove toast with duration 0", async () => {
      changeNotificationService.showToast({
        type: "info",
        title: "Test Toast",
        message: "Test message",
        duration: 0,
      })

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(changeNotificationService.getToasts()).toHaveLength(1)
    })
  })

  describe("removeToast", () => {
    it("should remove toast by ID", () => {
      const id = changeNotificationService.showToast({
        type: "info",
        title: "Test Toast",
        message: "Test message",
        duration: 0,
      })

      expect(changeNotificationService.getToasts()).toHaveLength(1)

      changeNotificationService.removeToast(id)

      expect(changeNotificationService.getToasts()).toHaveLength(0)
    })

    it("should handle removing non-existent toast", () => {
      changeNotificationService.removeToast("non-existent")
      // Should not throw error
    })
  })

  describe("notification management", () => {
    it("should mark notification as read", () => {
      const id = changeNotificationService.addNotification({
        type: "sync_success",
        title: "Test",
        message: "Test message",
        source: mockSource,
        canUndo: false,
      })

      changeNotificationService.markAsRead(id)

      const notifications = changeNotificationService.getNotifications()
      expect(notifications[0].isRead).toBe(true)
    })

    it("should mark all notifications as read", () => {
      changeNotificationService.addNotification({
        type: "sync_success",
        title: "Test 1",
        message: "Test message",
        source: mockSource,
        canUndo: false,
      })

      changeNotificationService.addNotification({
        type: "sync_success",
        title: "Test 2",
        message: "Test message",
        source: mockSource,
        canUndo: false,
      })

      changeNotificationService.markAllAsRead()

      const notifications = changeNotificationService.getNotifications()
      expect(notifications.every((n) => n.isRead)).toBe(true)
    })

    it("should get unread count", () => {
      changeNotificationService.addNotification({
        type: "sync_success",
        title: "Test 1",
        message: "Test message",
        source: mockSource,
        canUndo: false,
      })

      const id2 = changeNotificationService.addNotification({
        type: "sync_success",
        title: "Test 2",
        message: "Test message",
        source: mockSource,
        canUndo: false,
      })

      expect(changeNotificationService.getUnreadCount()).toBe(2)

      changeNotificationService.markAsRead(id2)

      expect(changeNotificationService.getUnreadCount()).toBe(1)
    })

    it("should clear all notifications", () => {
      changeNotificationService.addNotification({
        type: "sync_success",
        title: "Test",
        message: "Test message",
        source: mockSource,
        canUndo: false,
      })

      expect(changeNotificationService.getNotifications()).toHaveLength(1)

      changeNotificationService.clearNotifications()

      expect(changeNotificationService.getNotifications()).toHaveLength(0)
    })
  })

  describe("undo functionality", () => {
    it("should store and retrieve undo data", () => {
      const undoData = { collectionId: "test", changes: ["endpoint1"] }

      changeNotificationService.storeUndoData("sync-123", undoData)

      // Test undo (mocked implementation)
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      changeNotificationService.undoSync("sync-123")

      expect(consoleSpy).toHaveBeenCalledWith(
        "Undoing sync:",
        "sync-123",
        undoData
      )

      consoleSpy.mockRestore()
    })

    it("should limit undo history size", () => {
      // Add more than max undo entries
      for (let i = 0; i < 15; i++) {
        changeNotificationService.storeUndoData(`sync-${i}`, { data: i })
      }

      // Should only keep the last 10
      const result = changeNotificationService.undoSync("sync-0")
      expect(result).resolves.toBe(false) // Should not find old entry
    })

    it("should return false for non-existent undo data", async () => {
      const result = await changeNotificationService.undoSync("non-existent")
      expect(result).toBe(false)
    })
  })
})
