import { describe, it, expect, beforeEach } from "vitest"
import { makeCollection } from "@hoppscotch/data"
import {
  restCollectionStore,
  setCollectionLiveMetadata,
  updateCollectionFramework,
  trackCollectionCustomization,
  updateCollectionSyncStatus,
  createCodeFirstCollection,
  isLiveSyncCollection,
  getLiveSyncCollections,
  findCollectionBySourceId,
  hasPendingCodeChanges,
  hasUserModifications,
  getFrameworkIcon,
} from "../collections"
import {
  LiveSyncCollection,
  ExtendedLiveCollectionMetadata,
  FrameworkInfo,
  SyncConflict,
} from "~/types/live-collection-metadata"

describe("Live Sync Collections Store", () => {
  beforeEach(() => {
    // Reset the store to initial state
    restCollectionStore.dispatch({
      dispatcher: "setCollections",
      payload: { entries: [] },
    })
  })

  describe("Live Sync Metadata Management", () => {
    it("should set live metadata for a collection", () => {
      // Create a basic collection first
      const basicCollection = makeCollection({
        name: "Test API",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      restCollectionStore.dispatch({
        dispatcher: "addCollection",
        payload: { collection: basicCollection },
      })

      const metadata: ExtendedLiveCollectionMetadata = {
        sourceId: "test-source-1",
        isLiveSync: true,
        syncStrategy: "incremental",
        framework: {
          name: "FastAPI",
          version: "0.104.1",
          icon: "python",
        },
      }

      setCollectionLiveMetadata(0, metadata)

      const collections = restCollectionStore.value.state
      const liveSyncCol = collections[0] as LiveSyncCollection

      expect(liveSyncCol.liveMetadata?.sourceId).toBe("test-source-1")
      expect(liveSyncCol.liveMetadata?.isLiveSync).toBe(true)
      expect(liveSyncCol.liveMetadata?.framework?.name).toBe("FastAPI")
      expect(liveSyncCol.liveMetadata?.updatedAt).toBeInstanceOf(Date)
    })

    it("should update framework information", () => {
      const collection = makeCollection({
        name: "Express API",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      restCollectionStore.dispatch({
        dispatcher: "addCollection",
        payload: { collection },
      })

      const framework: FrameworkInfo = {
        name: "Express",
        version: "4.18.2",
        icon: "nodejs",
        commonEndpoints: ["/api-docs", "/swagger.json"],
      }

      updateCollectionFramework(0, framework)

      const collections = restCollectionStore.value.state
      const liveSyncCol = collections[0] as LiveSyncCollection

      expect(liveSyncCol.liveMetadata?.framework?.name).toBe("Express")
      expect(liveSyncCol.liveMetadata?.framework?.version).toBe("4.18.2")
      expect(liveSyncCol.liveMetadata?.framework?.commonEndpoints).toContain(
        "/api-docs"
      )
    })

    it("should track user customizations", () => {
      const collection = makeCollection({
        name: "API with Customizations",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      restCollectionStore.dispatch({
        dispatcher: "addCollection",
        payload: { collection },
      })

      // Track a request customization
      trackCollectionCustomization(0, "request", "/users/0", {
        hasCustomHeaders: true,
        hasCustomAuth: true,
      })

      // Track a collection customization
      trackCollectionCustomization(0, "collection", undefined, {
        hasCustomName: true,
      })

      const collections = restCollectionStore.value.state
      const liveSyncCol = collections[0] as LiveSyncCollection

      expect(
        liveSyncCol.liveMetadata?.customizations?.requests?.["/users/0"]
          ?.hasCustomHeaders
      ).toBe(true)
      expect(
        liveSyncCol.liveMetadata?.customizations?.requests?.["/users/0"]
          ?.hasCustomAuth
      ).toBe(true)
      expect(
        liveSyncCol.liveMetadata?.customizations?.collection?.hasCustomName
      ).toBe(true)
      expect(
        liveSyncCol.liveMetadata?.customizations?.requests?.["/users/0"]
          ?.customizedAt
      ).toBeInstanceOf(Date)
    })

    it("should update sync status after sync operation", () => {
      const collection = makeCollection({
        name: "Synced API",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      restCollectionStore.dispatch({
        dispatcher: "addCollection",
        payload: { collection },
      })

      const syncResult = {
        success: true,
        specHash: "abc123def456",
        changesSummary: [
          "Added new endpoint /users",
          "Updated /posts endpoint",
        ],
      }

      const conflicts: SyncConflict[] = [
        {
          type: "endpoint-modified",
          path: "/users",
          codeVersion: { method: "POST" },
          userVersion: { method: "PUT" },
          description: "Method conflict on /users endpoint",
        },
      ]

      updateCollectionSyncStatus(0, syncResult, conflicts)

      const collections = restCollectionStore.value.state
      const liveSyncCol = collections[0] as LiveSyncCollection

      expect(liveSyncCol.liveMetadata?.lastSyncTime).toBeInstanceOf(Date)
      expect(liveSyncCol.liveMetadata?.originalSpecHash).toBe("abc123def456")
      expect(liveSyncCol.liveMetadata?.changeTracking?.lastSpecHash).toBe(
        "abc123def456"
      )
      expect(
        liveSyncCol.liveMetadata?.changeTracking?.conflictingChanges
      ).toContain("Method conflict on /users endpoint")
    })
  })

  describe("Code-First Collection Creation", () => {
    it("should create a new code-first collection with full metadata", () => {
      const collection = makeCollection({
        name: "Generated API",
        folders: [],
        requests: [],
        auth: { authType: "inherit", authActive: true },
        headers: [],
      })

      const framework: FrameworkInfo = {
        name: "Spring Boot",
        version: "3.1.0",
        icon: "java",
      }

      createCodeFirstCollection(
        collection,
        "spring-source-1",
        framework,
        "spec-hash-123"
      )

      const collections = restCollectionStore.value.state
      expect(collections).toHaveLength(1)

      const liveSyncCol = collections[0] as LiveSyncCollection
      expect(liveSyncCol.name).toBe("Generated API")
      expect(liveSyncCol.liveMetadata?.sourceId).toBe("spring-source-1")
      expect(liveSyncCol.liveMetadata?.isLiveSync).toBe(true)
      expect(liveSyncCol.liveMetadata?.framework?.name).toBe("Spring Boot")
      expect(liveSyncCol.liveMetadata?.syncConfig?.autoSync).toBe(true)
      expect(liveSyncCol.liveMetadata?.syncConfig?.preserveCustomizations).toBe(
        true
      )
      expect(liveSyncCol.liveMetadata?.customizations).toBeDefined()
    })
  })

  describe("Helper Functions", () => {
    beforeEach(() => {
      // Add a mix of regular and live sync collections
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
          sourceId: "live-source-1",
          isLiveSync: true,
          syncStrategy: "incremental",
          framework: { name: "FastAPI", icon: "python" },
        },
      }

      restCollectionStore.dispatch({
        dispatcher: "setCollections",
        payload: { entries: [regularCollection, liveSyncCollection] },
      })
    })

    it("should identify live sync collections correctly", () => {
      const collections = restCollectionStore.value.state

      expect(isLiveSyncCollection(collections[0])).toBe(false)
      expect(isLiveSyncCollection(collections[1])).toBe(true)
    })

    it("should get all live sync collections", () => {
      const liveSyncCollections = getLiveSyncCollections()

      expect(liveSyncCollections).toHaveLength(1)
      expect(liveSyncCollections[0].name).toBe("Live Sync Collection")
    })

    it("should find collection by source ID", () => {
      const found = findCollectionBySourceId("live-source-1")
      const notFound = findCollectionBySourceId("non-existent")

      expect(found).toBeTruthy()
      expect(found?.name).toBe("Live Sync Collection")
      expect(notFound).toBeNull()
    })

    it("should detect pending code changes", () => {
      const collectionWithChanges: LiveSyncCollection = {
        ...makeCollection({
          name: "Collection with Changes",
          folders: [],
          requests: [],
          auth: { authType: "inherit", authActive: true },
          headers: [],
        }),
        liveMetadata: {
          sourceId: "source-with-changes",
          isLiveSync: true,
          changeTracking: {
            pendingChanges: ["New endpoint added", "Schema updated"],
          },
        },
      }

      const collectionWithoutChanges: LiveSyncCollection = {
        ...makeCollection({
          name: "Collection without Changes",
          folders: [],
          requests: [],
          auth: { authType: "inherit", authActive: true },
          headers: [],
        }),
        liveMetadata: {
          sourceId: "source-without-changes",
          isLiveSync: true,
          changeTracking: {
            pendingChanges: [],
          },
        },
      }

      expect(hasPendingCodeChanges(collectionWithChanges)).toBe(true)
      expect(hasPendingCodeChanges(collectionWithoutChanges)).toBe(false)
    })

    it("should detect user modifications", () => {
      const collectionWithMods: LiveSyncCollection = {
        ...makeCollection({
          name: "Modified Collection",
          folders: [],
          requests: [],
          auth: { authType: "inherit", authActive: true },
          headers: [],
        }),
        liveMetadata: {
          sourceId: "modified-source",
          isLiveSync: true,
          customizations: {
            requests: {
              "/users": { hasCustomHeaders: true },
            },
          },
        },
      }

      const collectionWithoutMods: LiveSyncCollection = {
        ...makeCollection({
          name: "Unmodified Collection",
          folders: [],
          requests: [],
          auth: { authType: "inherit", authActive: true },
          headers: [],
        }),
        liveMetadata: {
          sourceId: "unmodified-source",
          isLiveSync: true,
          customizations: {
            requests: {},
            folders: {},
            collection: {},
          },
        },
      }

      expect(hasUserModifications(collectionWithMods)).toBe(true)
      expect(hasUserModifications(collectionWithoutMods)).toBe(false)
    })

    it("should get correct framework icons", () => {
      expect(getFrameworkIcon({ name: "FastAPI", icon: "python" })).toBe(
        "python"
      )
      expect(getFrameworkIcon({ name: "Express", icon: "nodejs" })).toBe(
        "nodejs"
      )
      expect(getFrameworkIcon({ name: "Spring Boot" })).toBe("java")
      expect(getFrameworkIcon({ name: "Unknown Framework" })).toBe("code")
      expect(getFrameworkIcon()).toBe("code")
    })
  })
})
