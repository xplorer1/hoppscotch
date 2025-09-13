import { describe, it, expect, beforeEach, vi } from "vitest"
import { platformIntegrationService } from "../platform-integration.service"

// Mock platform APIs
const mockPlatformAPI = {
  auth: {
    signIn: vi.fn(),
    getCurrentUser: vi.fn(),
  },
  workspace: {
    get: vi.fn(),
    getCurrent: vi.fn(),
  },
  fs: {
    watch: vi.fn(),
    readFile: vi.fn(),
  },
  storage: {
    set: vi.fn(),
    get: vi.fn(),
    getByPattern: vi.fn(),
    delete: vi.fn(),
  },
  notifications: {
    show: vi.fn(),
  },
  interceptor: {
    register: vi.fn(),
  },
  analytics: {
    track: vi.fn(),
  },
  events: {
    on: vi.fn(),
    off: vi.fn(),
  },
}

// Mock window APIs
Object.defineProperty(window, "electronAPI", {
  value: {},
  writable: true,
})

Object.defineProperty(window, "chrome", {
  value: {
    runtime: {},
  },
  writable: true,
})

describe("PlatformIntegrationService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("initialization", () => {
    it("should initialize with platform API", async () => {
      await platformIntegrationService.initialize(mockPlatformAPI)

      const config = platformIntegrationService.getPlatformConfig()
      expect(config.authEnabled).toBe(true)
      expect(config.workspaceEnabled).toBe(true)
    })

    it("should detect electron platform", async () => {
      // Mock electron environment
      Object.defineProperty(window, "electronAPI", {
        value: { version: "1.0.0" },
        writable: true,
      })

      await platformIntegrationService.initialize(mockPlatformAPI)

      const config = platformIntegrationService.getPlatformConfig()
      expect(config.platform).toBe("electron")
      expect(config.fileSystemAccess).toBe(true)
    })

    it("should detect extension platform", async () => {
      // Mock extension environment
      delete (window as any).electronAPI
      Object.defineProperty(window, "chrome", {
        value: { runtime: { id: "extension-id" } },
        writable: true,
      })

      await platformIntegrationService.initialize(mockPlatformAPI)

      const config = platformIntegrationService.getPlatformConfig()
      expect(config.platform).toBe("extension")
    })

    it("should detect web platform", async () => {
      // Mock web environment
      delete (window as any).electronAPI
      delete (window as any).chrome

      await platformIntegrationService.initialize(mockPlatformAPI)

      const config = platformIntegrationService.getPlatformConfig()
      expect(config.platform).toBe("web")
    })
  })

  describe("authentication", () => {
    beforeEach(async () => {
      await platformIntegrationService.initialize(mockPlatformAPI)
    })

    it("should authenticate user successfully", async () => {
      mockPlatformAPI.auth.signIn.mockResolvedValue({
        success: true,
        user: {
          id: "user-123",
          permissions: ["read", "write"],
        },
      })

      const result = await platformIntegrationService.authenticateUser()

      expect(result).toBe(true)
      expect(mockPlatformAPI.auth.signIn).toHaveBeenCalled()

      const authContext = platformIntegrationService.getAuthContext()
      expect(authContext.isAuthenticated).toBe(true)
      expect(authContext.userId).toBe("user-123")
      expect(authContext.permissions).toEqual(["read", "write"])
    })

    it("should handle authentication failure", async () => {
      mockPlatformAPI.auth.signIn.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      })

      const result = await platformIntegrationService.authenticateUser()

      expect(result).toBe(false)

      const authContext = platformIntegrationService.getAuthContext()
      expect(authContext.isAuthenticated).toBe(false)
    })

    it("should handle authentication error", async () => {
      mockPlatformAPI.auth.signIn.mockRejectedValue(new Error("Network error"))

      const result = await platformIntegrationService.authenticateUser()

      expect(result).toBe(false)
    })
  })

  describe("workspace management", () => {
    beforeEach(async () => {
      await platformIntegrationService.initialize(mockPlatformAPI)
    })

    it("should switch workspace successfully", async () => {
      mockPlatformAPI.workspace.get.mockResolvedValue({
        id: "workspace-123",
        name: "Test Workspace",
        type: "team",
        members: ["user-1", "user-2"],
        settings: { theme: "dark" },
      })

      const result =
        await platformIntegrationService.switchWorkspace("workspace-123")

      expect(result).toBe(true)
      expect(mockPlatformAPI.workspace.get).toHaveBeenCalledWith(
        "workspace-123"
      )

      const workspaceContext = platformIntegrationService.getWorkspaceContext()
      expect(workspaceContext?.id).toBe("workspace-123")
      expect(workspaceContext?.name).toBe("Test Workspace")
      expect(workspaceContext?.type).toBe("team")
    })

    it("should handle workspace switch failure", async () => {
      mockPlatformAPI.workspace.get.mockResolvedValue(null)

      const result =
        await platformIntegrationService.switchWorkspace("non-existent")

      expect(result).toBe(false)
    })
  })

  describe("file watching", () => {
    beforeEach(async () => {
      await platformIntegrationService.initialize(mockPlatformAPI)
    })

    it("should setup file watcher successfully", async () => {
      const mockWatcher = {
        on: vi.fn(),
      }

      mockPlatformAPI.fs.watch.mockResolvedValue(mockWatcher)

      const result = await platformIntegrationService.watchFile(
        "/path/to/file.json",
        "source-123"
      )

      expect(result).toBe(true)
      expect(mockPlatformAPI.fs.watch).toHaveBeenCalledWith(
        "/path/to/file.json",
        {
          persistent: true,
          recursive: false,
        }
      )
      expect(mockWatcher.on).toHaveBeenCalledWith(
        "change",
        expect.any(Function)
      )
    })

    it("should handle file watcher setup failure", async () => {
      mockPlatformAPI.fs.watch.mockRejectedValue(new Error("File not found"))

      const result = await platformIntegrationService.watchFile(
        "/invalid/path",
        "source-123"
      )

      expect(result).toBe(false)
    })
  })

  describe("notifications", () => {
    beforeEach(async () => {
      await platformIntegrationService.initialize(mockPlatformAPI)
    })

    it("should show platform notification", async () => {
      await platformIntegrationService.showNotification(
        "Test Title",
        "Test Message",
        {
          type: "success",
          duration: 5000,
        }
      )

      expect(mockPlatformAPI.notifications.show).toHaveBeenCalledWith({
        title: "Test Title",
        message: "Test Message",
        type: "success",
        actions: undefined,
        duration: 5000,
      })
    })

    it("should fallback to console when notifications not supported", async () => {
      // Mock platform without notification support
      await platformIntegrationService.initialize({
        ...mockPlatformAPI,
        notifications: undefined,
      })

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      await platformIntegrationService.showNotification("Test", "Message")

      expect(consoleSpy).toHaveBeenCalledWith("[info] Test: Message")

      consoleSpy.mockRestore()
    })
  })

  describe("storage operations", () => {
    beforeEach(async () => {
      await platformIntegrationService.initialize(mockPlatformAPI)
    })

    it("should persist live source", async () => {
      const mockSource = {
        id: "source-123",
        name: "Test Source",
        type: "url" as const,
        status: "connected" as const,
        config: { url: "http://localhost:3000/openapi.json" },
        syncStrategy: "incremental" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPlatformAPI.storage.set.mockResolvedValue(true)

      const result =
        await platformIntegrationService.persistLiveSource(mockSource)

      expect(result).toBe(true)
      expect(mockPlatformAPI.storage.set).toHaveBeenCalledWith(
        expect.stringContaining("live_sources:source-123"),
        mockSource
      )
    })

    it("should load live sources", async () => {
      const mockSources = {
        key1: { id: "source-1", name: "Source 1" },
        key2: { id: "source-2", name: "Source 2" },
      }

      mockPlatformAPI.storage.getByPattern.mockResolvedValue(mockSources)

      const sources = await platformIntegrationService.loadLiveSources()

      expect(sources).toHaveLength(2)
      expect(sources[0].id).toBe("source-1")
      expect(sources[1].id).toBe("source-2")
    })

    it("should delete live source", async () => {
      mockPlatformAPI.storage.delete.mockResolvedValue(true)

      const result =
        await platformIntegrationService.deleteLiveSource("source-123")

      expect(result).toBe(true)
      expect(mockPlatformAPI.storage.delete).toHaveBeenCalledWith(
        expect.stringContaining("live_sources:source-123")
      )
    })

    it("should fallback to localStorage when platform storage unavailable", async () => {
      // Mock platform without storage
      await platformIntegrationService.initialize({
        ...mockPlatformAPI,
        storage: undefined,
      })

      // Mock localStorage
      const localStorageMock = {
        getItem: vi.fn(),
        setItem: vi.fn(),
      }
      Object.defineProperty(window, "localStorage", {
        value: localStorageMock,
        writable: true,
      })

      localStorageMock.getItem.mockReturnValue("{}")

      const mockSource = {
        id: "source-123",
        name: "Test Source",
        type: "url" as const,
        status: "connected" as const,
        config: { url: "http://localhost:3000/openapi.json" },
        syncStrategy: "incremental" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const result =
        await platformIntegrationService.persistLiveSource(mockSource)

      expect(result).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "hoppscotch_live_sources",
        expect.stringContaining("source-123")
      )
    })
  })

  describe("interceptor setup", () => {
    beforeEach(async () => {
      await platformIntegrationService.initialize(mockPlatformAPI)
    })

    it("should setup interceptor successfully", async () => {
      mockPlatformAPI.interceptor.register.mockResolvedValue(true)

      const result =
        await platformIntegrationService.setupInterceptor("source-123")

      expect(result).toBe(true)
      expect(mockPlatformAPI.interceptor.register).toHaveBeenCalledWith({
        sourceId: "source-123",
        patterns: ["**/openapi.json", "**/api-docs", "**/swagger.json"],
        handler: expect.any(Function),
      })
    })

    it("should handle interceptor setup failure", async () => {
      mockPlatformAPI.interceptor.register.mockRejectedValue(
        new Error("Interceptor error")
      )

      const result =
        await platformIntegrationService.setupInterceptor("source-123")

      expect(result).toBe(false)
    })
  })

  describe("analytics tracking", () => {
    beforeEach(async () => {
      await platformIntegrationService.initialize(mockPlatformAPI)
    })

    it("should track events with context", async () => {
      // Setup auth and workspace context
      mockPlatformAPI.auth.getCurrentUser.mockResolvedValue({
        id: "user-123",
        permissions: [],
      })

      await platformIntegrationService.initialize(mockPlatformAPI)

      await platformIntegrationService.trackEvent("test_event", {
        customProperty: "value",
      })

      expect(mockPlatformAPI.analytics.track).toHaveBeenCalledWith(
        "test_event",
        {
          customProperty: "value",
          platform: expect.any(String),
          userId: "user-123",
          workspaceId: undefined,
        }
      )
    })
  })
})
