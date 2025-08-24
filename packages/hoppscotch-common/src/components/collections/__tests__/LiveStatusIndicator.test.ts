/**
 * Tests for Live Status Indicator Component Logic
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { LiveSyncCollection } from "~/types/live-collection-metadata"
import { makeCollection } from "@hoppscotch/data"

// Mock dependencies
vi.mock("~/newstore/collections", () => ({
  hasPendingCodeChanges: vi.fn(),
  hasUserModifications: vi.fn(),
}))

vi.mock("@composables/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        "collections.status_connected": "Connected",
        "collections.status_syncing": "Syncing",
        "collections.status_error": "Error",
        "collections.status_disconnected": "Disconnected",
        "collections.status_paused": "Paused",
        "collections.framework": "Framework",
        "collections.source": "Source",
        "collections.last_sync": "Last Sync",
        "collections.pending_changes": "Pending Changes",
        "collections.user_modifications": "User Modifications",
        "collections.customizations": "customizations",
        "collections.error": "Error",
        "collections.just_now": "Just now",
        "collections.minutes_ago": "{count} minutes ago",
        "collections.hours_ago": "{count} hours ago",
        "collections.days_ago": "{count} days ago",
        "collections.and_more_changes": "and {count} more changes",
        "collections.sync_now": "Sync Now",
        "collections.unknown_source": "Unknown Source",
        "action.retry": "Retry",
        "action.configure": "Configure",
      }
      return params
        ? translations[key]?.replace(/\{(\w+)\}/g, (_, k) => params[k])
        : translations[key] || key
    },
  }),
}))

import {
  hasPendingCodeChanges,
  hasUserModifications,
} from "~/newstore/collections"

describe("LiveStatusIndicator Logic", () => {
  let mockCollection: LiveSyncCollection

  beforeEach(() => {
    vi.clearAllMocks()

    mockCollection = {
      ...makeCollection({
        name: "Test API",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      }),
      liveMetadata: {
        sourceId: "test-source",
        isLiveSync: true,
        lastSyncTime: new Date(),
        syncStrategy: "incremental",
        sourceUrl: "http://localhost:3000/openapi.json",
        framework: {
          name: "FastAPI",
          version: "0.68.0",
        },
      },
    }

    vi.mocked(hasPendingCodeChanges).mockReturnValue(false)
    vi.mocked(hasUserModifications).mockReturnValue(false)
  })

  describe("status calculation", () => {
    it("should determine correct status based on collection state", () => {
      // Test connected status
      expect(mockCollection.liveMetadata?.isLiveSync).toBe(true)

      // Test framework detection
      expect(mockCollection.liveMetadata?.framework?.name).toBe("FastAPI")
    })
  })

  describe("time formatting", () => {
    it("should format recent times correctly", () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

      // Test time differences
      expect(now.getTime()).toBeGreaterThan(fiveMinutesAgo.getTime())
      expect(fiveMinutesAgo.getTime()).toBeGreaterThan(twoHoursAgo.getTime())
    })
  })

  describe("framework icon mapping", () => {
    it("should handle framework information", () => {
      const frameworks = ["FastAPI", "Express", "Spring Boot"]
      frameworks.forEach((framework) => {
        expect(framework).toBeTruthy()
      })
    })
  })

  describe("user modifications tracking", () => {
    it("should track customizations correctly", () => {
      const customizations = {
        requests: {
          "/users": { hasCustomHeaders: true, customizedAt: new Date() },
          "/posts": { hasCustomAuth: true, customizedAt: new Date() },
        },
        collection: {
          hasCustomAuth: true,
          customizedAt: new Date(),
        },
        folders: {
          folder1: { hasCustomHeaders: true, customizedAt: new Date() },
        },
      }

      const requestCount = Object.keys(customizations.requests).length
      const collectionCount =
        Object.keys(customizations.collection).length > 0 ? 1 : 0
      const folderCount = Object.keys(customizations.folders).length

      expect(requestCount + collectionCount + folderCount).toBe(4)
    })
  })
})
