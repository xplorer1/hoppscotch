/**
 * Tests for Live Sync Collections Store Extensions
 */
import { describe, it, expect, beforeEach } from "vitest"
import { makeCollection } from "@hoppscotch/data"
import {
  isLiveSyncCollection,
  getLiveSyncCollections,
  findCollectionBySourceId,
  hasPendingCodeChanges,
  hasUserModifications,
  getFrameworkIcon,
  setCollectionLiveMetadata,
  updateCollectionFramework,
  trackCollectionCustomization,
  updateCollectionSyncStatus,
  createCodeFirstCollection,
  setRESTCollections,
} from "../collections"
import {
  LiveSyncCollection,
  ExtendedLiveCollectionMetadata,
  FrameworkInfo,
  SyncConflict,
} from "~/types/live-collection-metadata"

describe("Live Sync Collections Store", () => {
  beforeEach(() => {
    // Reset store to clean state
    setRESTCollections([])
  })

  describe("isLiveSyncCollection", () => {
    it("should identify live sync collections correctly", () => {
      const regularCollection = makeCollection({
        name: "Regular Collection",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      const liveSyncCollection: LiveSyncCollection = {
        ...makeCollection({
          name: "Live Sync Collection",
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
        },
      }

      expect(isLiveSyncCollection(regularCollection)).toBe(false)
      expect(isLiveSyncCollection(liveSyncCollection)).toBe(true)
    })

    it("should return false for collections with liveMetadata but isLiveSync false", () => {
      const collection: LiveSyncCollection = {
        ...makeCollection({
          name: "Collection",
          folders: [],
          requests: [],
          auth: { authType: "inherit", authActive: true },
          headers: [],
        }),
        liveMetadata: {
          sourceId: "test-source",
          isLiveSync: false,
          lastSyncTime: new Date(),
          syncStrategy: "incremental",
        },
      }

      expect(isLiveSyncCollection(collection)).toBe(false)
    })
  })

  describe("getLiveSyncCollections", () => {
    it("should return only live sync collections", () => {
      const regularCollection = makeCollection({
        name: "Regular Collection",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      const liveSyncCollection: LiveSyncCollection = {
        ...makeCollection({
          name: "Live Sync Collection",
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
        },
      }

      setRESTCollections([regularCollection, liveSyncCollection])

      const liveSyncCollections = getLiveSyncCollections()
      expect(liveSyncCollections).toHaveLength(1)
      expect(liveSyncCollections[0].name).toBe("Live Sync Collection")
    })

    it("should return empty array when no live sync collections exist", () => {
      const regularCollection = makeCollection({
        name: "Regular Collection",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      setRESTCollections([regularCollection])

      const liveSyncCollections = getLiveSyncCollections()
      expect(liveSyncCollections).toHaveLength(0)
    })
  })

  describe("findCollectionBySourceId", () => {
    it("should find collection by source ID", () => {
      const liveSyncCollection: LiveSyncCollection = {
        ...makeCollection({
          name: "Test API",
          folders: [],
          requests: [],
          auth: { authType: "inherit", authActive: true },
          headers: [],
        }),
        liveMetadata: {
          sourceId: "test-source-123",
          isLiveSync: true,
          lastSyncTime: new Date(),
          syncStrategy: "incremental",
        },
      }

      setRESTCollections([liveSyncCollection])

      const found = findCollectionBySourceId("test-source-123")
      expect(found).toBeTruthy()
      expect(found?.name).toBe("Test API")
    })

    it("should return null when source ID not found", () => {
      const found = findCollectionBySourceId("nonexistent-source")
      expect(found).toBeNull()
    })
  })

  describe("hasPendingCodeChanges", () => {
    it("should detect pending code changes", () => {
      const collection: LiveSyncCollection = {
        ...makeCollection({
          name: "Test Collection",
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
          changeTracking: {
            lastSpecHash: "old-hash",
            pendingChanges: ["endpoint-added", "parameter-modified"],
            userModifications: [],
            conflictingChanges: [],
          },
        },
      }

      expect(hasPendingCodeChanges(collection)).toBe(true)
    })

    it("should return false when no pending changes", () => {
      const collection: LiveSyncCollection = {
        ...makeCollection({
          name: "Test Collection",
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
          changeTracking: {
            lastSpecHash: "current-hash",
            pendingChanges: [],
            userModifications: [],
            conflictingChanges: [],
          },
        },
      }

      expect(hasPendingCodeChanges(collection)).toBe(false)
    })
  })

  describe("hasUserModifications", () => {
    it("should detect user modifications in requests", () => {
      const collection: LiveSyncCollection = {
        ...makeCollection({
          name: "Test Collection",
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
          customizations: {
            requests: {
              "/users": {
                hasCustomHeaders: true,
                customizedAt: new Date(),
              },
            },
            collection: {},
            folders: {},
          },
        },
      }

      expect(hasUserModifications(collection)).toBe(true)
    })

    it("should detect user modifications in collection", () => {
      const collection: LiveSyncCollection = {
        ...makeCollection({
          name: "Test Collection",
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
          customizations: {
            requests: {},
            collection: {
              hasCustomAuth: true,
              customizedAt: new Date(),
            },
            folders: {},
          },
        },
      }

      expect(hasUserModifications(collection)).toBe(true)
    })

    it("should return false when no customizations", () => {
      const collection: LiveSyncCollection = {
        ...makeCollection({
          name: "Test Collection",
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
        },
      }

      expect(hasUserModifications(collection)).toBe(false)
    })
  })

  describe("getFrameworkIcon", () => {
    it("should return correct icons for known frameworks", () => {
      const fastApiFramework: FrameworkInfo = { name: "FastAPI" }
      const expressFramework: FrameworkInfo = { name: "Express" }
      const springFramework: FrameworkInfo = { name: "Spring Boot" }

      expect(getFrameworkIcon(fastApiFramework)).toBe("python")
      expect(getFrameworkIcon(expressFramework)).toBe("nodejs")
      expect(getFrameworkIcon(springFramework)).toBe("java")
    })

    it("should return custom icon when provided", () => {
      const customFramework: FrameworkInfo = {
        name: "Custom Framework",
        icon: "custom-icon",
      }

      expect(getFrameworkIcon(customFramework)).toBe("custom-icon")
    })

    it("should return default icon for unknown frameworks", () => {
      const unknownFramework: FrameworkInfo = { name: "Unknown Framework" }

      expect(getFrameworkIcon(unknownFramework)).toBe("code")
      expect(getFrameworkIcon(undefined)).toBe("code")
    })
  })

  describe("createCodeFirstCollection", () => {
    it("should create a new live sync collection", () => {
      const collection = makeCollection({
        name: "Generated API",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      const framework: FrameworkInfo = { name: "FastAPI", version: "0.68.0" }

      createCodeFirstCollection(
        collection,
        "test-source",
        framework,
        "spec-hash-123"
      )

      const collections = getLiveSyncCollections()
      expect(collections).toHaveLength(1)

      const createdCollection = collections[0]
      expect(createdCollection.name).toBe("Generated API")
      expect(createdCollection.liveMetadata?.sourceId).toBe("test-source")
      expect(createdCollection.liveMetadata?.isLiveSync).toBe(true)
      expect(createdCollection.liveMetadata?.framework?.name).toBe("FastAPI")
      expect(createdCollection.liveMetadata?.originalSpecHash).toBe(
        "spec-hash-123"
      )
    })

    it("should create collection with default sync configuration", () => {
      const collection = makeCollection({
        name: "Test API",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      createCodeFirstCollection(collection, "test-source")

      const collections = getLiveSyncCollections()
      const createdCollection = collections[0]

      expect(createdCollection.liveMetadata?.syncConfig?.autoSync).toBe(true)
      expect(
        createdCollection.liveMetadata?.syncConfig?.preserveCustomizations
      ).toBe(true)
      expect(
        createdCollection.liveMetadata?.syncConfig?.conflictResolution
      ).toBe("prompt")
    })
  })

  describe("setCollectionLiveMetadata", () => {
    it("should update live metadata for existing collection", () => {
      const collection = makeCollection({
        name: "Test Collection",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      setRESTCollections([collection])

      const metadata: ExtendedLiveCollectionMetadata = {
        sourceId: "updated-source",
        isLiveSync: true,
        lastSyncTime: new Date(),
        syncStrategy: "incremental",
        framework: { name: "Express", version: "4.18.0" },
      }

      setCollectionLiveMetadata(0, metadata)

      const collections = getLiveSyncCollections()
      expect(collections).toHaveLength(1)
      expect(collections[0].liveMetadata?.sourceId).toBe("updated-source")
      expect(collections[0].liveMetadata?.framework?.name).toBe("Express")
    })
  })

  describe("updateCollectionFramework", () => {
    it("should update framework information", () => {
      const liveSyncCollection: LiveSyncCollection = {
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
        },
      }

      setRESTCollections([liveSyncCollection])

      const newFramework: FrameworkInfo = {
        name: "NestJS",
        version: "9.0.0",
        confidence: 0.95,
      }

      updateCollectionFramework(0, newFramework)

      const collections = getLiveSyncCollections()
      expect(collections[0].liveMetadata?.framework?.name).toBe("NestJS")
      expect(collections[0].liveMetadata?.framework?.version).toBe("9.0.0")
      expect(collections[0].liveMetadata?.framework?.confidence).toBe(0.95)
    })
  })

  describe("trackCollectionCustomization", () => {
    it("should track request customizations", () => {
      const liveSyncCollection: LiveSyncCollection = {
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
        },
      }

      setRESTCollections([liveSyncCollection])

      trackCollectionCustomization(0, "request", "/users", {
        hasCustomHeaders: true,
        hasCustomAuth: true,
      })

      const collections = getLiveSyncCollections()
      const customizations = collections[0].liveMetadata?.customizations

      expect(customizations?.requests?.["/users"]?.hasCustomHeaders).toBe(true)
      expect(customizations?.requests?.["/users"]?.hasCustomAuth).toBe(true)
      expect(customizations?.requests?.["/users"]?.customizedAt).toBeInstanceOf(
        Date
      )
    })

    it("should track collection-level customizations", () => {
      const liveSyncCollection: LiveSyncCollection = {
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
        },
      }

      setRESTCollections([liveSyncCollection])

      trackCollectionCustomization(0, "collection", undefined, {
        hasCustomAuth: true,
        hasCustomName: true,
      })

      const collections = getLiveSyncCollections()
      const customizations = collections[0].liveMetadata?.customizations

      expect(customizations?.collection?.hasCustomAuth).toBe(true)
      expect(customizations?.collection?.hasCustomName).toBe(true)
    })
  })

  describe("updateCollectionSyncStatus", () => {
    it("should update sync status after successful sync", () => {
      const liveSyncCollection: LiveSyncCollection = {
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
        },
      }

      setRESTCollections([liveSyncCollection])

      const syncResult = {
        success: true,
        specHash: "new-spec-hash",
        changesSummary: ["Added endpoint /users", "Modified endpoint /posts"],
      }

      updateCollectionSyncStatus(0, syncResult)

      const collections = getLiveSyncCollections()
      const metadata = collections[0].liveMetadata

      expect(metadata?.originalSpecHash).toBe("new-spec-hash")
      expect(metadata?.changeTracking?.lastSpecHash).toBe("new-spec-hash")
      expect(metadata?.lastSyncTime).toBeInstanceOf(Date)
    })

    it("should handle sync conflicts", () => {
      const liveSyncCollection: LiveSyncCollection = {
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
        },
      }

      setRESTCollections([liveSyncCollection])

      const syncResult = {
        success: true,
        specHash: "new-spec-hash",
        changesSummary: ["Modified endpoint /users"],
      }

      const conflicts: SyncConflict[] = [
        {
          type: "endpoint-modified",
          path: "/users",
          codeVersion: { method: "POST" },
          userVersion: { method: "PUT" },
          description: "Method changed from PUT to POST in code",
        },
      ]

      updateCollectionSyncStatus(0, syncResult, conflicts)

      const collections = getLiveSyncCollections()
      const changeTracking = collections[0].liveMetadata?.changeTracking

      expect(changeTracking?.conflictingChanges).toContain(
        "Method changed from PUT to POST in code"
      )
    })
  })
})
