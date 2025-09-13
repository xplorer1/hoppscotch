/**
 * Platform Integration Service for Live Sync
 * Integrates live sync with existing Hoppscotch platform services
 */

import { reactive } from "vue"
import type { LiveSpecSource } from "../types/live-spec-source"
import { liveSpecSourceService } from "./live-spec-source.service"
import { syncEngineService } from "./sync-engine.service"
import { errorRecoveryService } from "./error-recovery.service"
import { performanceMonitorService } from "./performance-monitor.service"

export interface PlatformConfig {
  platform: "web" | "electron" | "extension"
  authEnabled: boolean
  workspaceEnabled: boolean
  fileSystemAccess: boolean
  notificationSupport: boolean
  interceptorSupport: boolean
}

export interface AuthContext {
  isAuthenticated: boolean
  userId?: string
  workspaceId?: string
  permissions: string[]
}

export interface WorkspaceContext {
  id: string
  name: string
  type: "personal" | "team"
  members?: string[]
  settings: Record<string, any>
}

class PlatformIntegrationService {
  private config = reactive<PlatformConfig>({
    platform: "web",
    authEnabled: false,
    workspaceEnabled: false,
    fileSystemAccess: false,
    notificationSupport: false,
    interceptorSupport: false,
  })

  private authContext = reactive<AuthContext>({
    isAuthenticated: false,
    permissions: [],
  })

  private workspaceContext = reactive<WorkspaceContext | null>(null)
  private platformAPI: any = null

  /**
   * Initialize platform integration
   */
  async initialize(platformAPI: any): Promise<void> {
    this.platformAPI = platformAPI

    // Detect platform capabilities
    await this.detectPlatformCapabilities()

    // Initialize auth context
    await this.initializeAuthContext()

    // Initialize workspace context
    await this.initializeWorkspaceContext()

    // Setup platform-specific integrations
    await this.setupPlatformIntegrations()
  }

  /**
   * Get current platform configuration
   */
  getPlatformConfig(): PlatformConfig {
    return { ...this.config }
  }

  /**
   * Get current auth context
   */
  getAuthContext(): AuthContext {
    return { ...this.authContext }
  }

  /**
   * Get current workspace context
   */
  getWorkspaceContext(): WorkspaceContext | null {
    return this.workspaceContext ? { ...this.workspaceContext } : null
  }

  /**
   * Integrate with platform authentication
   */
  async authenticateUser(): Promise<boolean> {
    if (!this.config.authEnabled || !this.platformAPI?.auth) {
      return false
    }

    try {
      const authResult = await this.platformAPI.auth.signIn()

      if (authResult.success) {
        this.authContext.isAuthenticated = true
        this.authContext.userId = authResult.user.id
        this.authContext.permissions = authResult.user.permissions || []

        // Sync live sources with user account
        await this.syncUserLiveSources()

        return true
      }
    } catch (error) {
      console.error("Authentication failed:", error)
    }

    return false
  }

  /**
   * Integrate with platform workspace system
   */
  async switchWorkspace(workspaceId: string): Promise<boolean> {
    if (!this.config.workspaceEnabled || !this.platformAPI?.workspace) {
      return false
    }

    try {
      const workspace = await this.platformAPI.workspace.get(workspaceId)

      if (workspace) {
        this.workspaceContext = {
          id: workspace.id,
          name: workspace.name,
          type: workspace.type,
          members: workspace.members,
          settings: workspace.settings,
        }

        // Load workspace-specific live sources
        await this.loadWorkspaceLiveSources()

        return true
      }
    } catch (error) {
      console.error("Workspace switch failed:", error)
    }

    return false
  }

  /**
   * Integrate with platform file system APIs
   */
  async watchFile(filePath: string, sourceId: string): Promise<boolean> {
    if (!this.config.fileSystemAccess || !this.platformAPI?.fs) {
      return false
    }

    try {
      const watcher = await this.platformAPI.fs.watch(filePath, {
        persistent: true,
        recursive: false,
      })

      watcher.on("change", async (eventType: string, _filename: string) => {
        if (eventType === "change") {
          // Debounce file changes
          setTimeout(async () => {
            try {
              const content = await this.platformAPI.fs.readFile(
                filePath,
                "utf8"
              )
              const spec = JSON.parse(content)

              // Trigger sync with new spec
              await syncEngineService.processSpecUpdate(sourceId, spec)
            } catch (error) {
              await errorRecoveryService.handleError(
                liveSpecSourceService.getSource(sourceId)!,
                error as Error,
                "file_read_error"
              )
            }
          }, 500)
        }
      })

      return true
    } catch (error) {
      console.error("File watching failed:", error)
      return false
    }
  }

  /**
   * Integrate with platform notification system
   */
  async showNotification(
    title: string,
    message: string,
    options: {
      type?: "info" | "success" | "warning" | "error"
      actions?: Array<{ label: string; action: () => void }>
      duration?: number
    } = {}
  ): Promise<void> {
    if (!this.config.notificationSupport) {
      // Fallback to console
      console.log(`[${options.type || "info"}] ${title}: ${message}`)
      return
    }

    if (this.platformAPI?.notifications) {
      await this.platformAPI.notifications.show({
        title,
        message,
        type: options.type || "info",
        actions: options.actions,
        duration: options.duration,
      })
    } else if (this.config.platform === "web" && "Notification" in window) {
      // Web notifications
      if (Notification.permission === "granted") {
        new Notification(title, {
          body: message,
          icon: "/favicon.ico",
        })
      } else if (Notification.permission !== "denied") {
        const permission = await Notification.requestPermission()
        if (permission === "granted") {
          new Notification(title, { body: message })
        }
      }
    }
  }

  /**
   * Integrate with platform interceptor system
   */
  async setupInterceptor(sourceId: string): Promise<boolean> {
    if (!this.config.interceptorSupport || !this.platformAPI?.interceptor) {
      return false
    }

    try {
      await this.platformAPI.interceptor.register({
        sourceId,
        patterns: ["**/openapi.json", "**/api-docs", "**/swagger.json"],
        handler: async (request: any, response: any) => {
          // Intercept OpenAPI spec requests and trigger sync
          if (
            response.ok &&
            response.headers["content-type"]?.includes("application/json")
          ) {
            const spec = await response.json()

            if (spec.openapi || spec.swagger) {
              // Performance monitoring
              performanceMonitorService.startSyncMeasurement(sourceId)

              // Process the intercepted spec
              await syncEngineService.processSpecUpdate(sourceId, spec)

              performanceMonitorService.endSyncMeasurement(sourceId, spec)
            }
          }

          return response
        },
      })

      return true
    } catch (error) {
      console.error("Interceptor setup failed:", error)
      return false
    }
  }

  /**
   * Integrate with platform storage system
   */
  async persistLiveSource(source: LiveSpecSource): Promise<boolean> {
    if (!this.platformAPI?.storage) {
      // TODO: Implement proper persistence service integration
      // Fallback to in-memory storage (localStorage not allowed)
      console.warn("Platform storage not available, using in-memory fallback")
      return false
    }

    try {
      const key = this.getStorageKey("live_sources", source.id)
      await this.platformAPI.storage.set(key, source)
      return true
    } catch (error) {
      console.error("Platform storage persistence failed:", error)
      return false
    }
  }

  /**
   * Load live sources from platform storage
   */
  async loadLiveSources(): Promise<LiveSpecSource[]> {
    if (!this.platformAPI?.storage) {
      // TODO: Implement proper persistence service integration
      // Fallback to in-memory storage (localStorage not allowed)
      console.warn("Platform storage not available, using in-memory fallback")
      return []
    }

    try {
      const pattern = this.getStorageKey("live_sources", "*")
      const sourceData = await this.platformAPI.storage.getByPattern(pattern)
      return Object.values(sourceData)
    } catch (error) {
      console.error("Platform storage load failed:", error)
      return []
    }
  }

  /**
   * Delete live source from platform storage
   */
  async deleteLiveSource(sourceId: string): Promise<boolean> {
    if (!this.platformAPI?.storage) {
      // TODO: Implement proper persistence service integration
      // Fallback to in-memory storage (localStorage not allowed)
      console.warn("Platform storage not available, using in-memory fallback")
      return false
    }

    try {
      const key = this.getStorageKey("live_sources", sourceId)
      await this.platformAPI.storage.delete(key)
      return true
    } catch (error) {
      console.error("Platform storage deletion failed:", error)
      return false
    }
  }

  /**
   * Integrate with platform analytics
   */
  async trackEvent(
    event: string,
    properties: Record<string, any> = {}
  ): Promise<void> {
    if (this.platformAPI?.analytics) {
      await this.platformAPI.analytics.track(event, {
        ...properties,
        platform: this.config.platform,
        userId: this.authContext.userId,
        workspaceId: this.workspaceContext?.id,
      })
    }
  }

  // Private methods
  private async detectPlatformCapabilities(): Promise<void> {
    // Detect platform type
    if (typeof window !== "undefined") {
      if (window.electronAPI) {
        this.config.platform = "electron"
        this.config.fileSystemAccess = true
        this.config.notificationSupport = true
      } else if (window.chrome?.runtime) {
        this.config.platform = "extension"
        this.config.notificationSupport = true
      } else {
        this.config.platform = "web"
        this.config.notificationSupport = "Notification" in window
      }
    }

    // Check for platform API capabilities
    if (this.platformAPI) {
      this.config.authEnabled = !!this.platformAPI.auth
      this.config.workspaceEnabled = !!this.platformAPI.workspace
      this.config.fileSystemAccess = !!this.platformAPI.fs
      this.config.interceptorSupport = !!this.platformAPI.interceptor
    }
  }

  private async initializeAuthContext(): Promise<void> {
    if (!this.config.authEnabled || !this.platformAPI?.auth) {
      return
    }

    try {
      const currentUser = await this.platformAPI.auth.getCurrentUser()

      if (currentUser) {
        this.authContext.isAuthenticated = true
        this.authContext.userId = currentUser.id
        this.authContext.permissions = currentUser.permissions || []
      }
    } catch (error) {
      console.warn("Failed to initialize auth context:", error)
    }
  }

  private async initializeWorkspaceContext(): Promise<void> {
    if (!this.config.workspaceEnabled || !this.platformAPI?.workspace) {
      return
    }

    try {
      const currentWorkspace = await this.platformAPI.workspace.getCurrent()

      if (currentWorkspace) {
        this.workspaceContext = {
          id: currentWorkspace.id,
          name: currentWorkspace.name,
          type: currentWorkspace.type,
          members: currentWorkspace.members,
          settings: currentWorkspace.settings,
        }
      }
    } catch (error) {
      console.warn("Failed to initialize workspace context:", error)
    }
  }

  private async setupPlatformIntegrations(): Promise<void> {
    // Setup platform-specific event listeners
    if (this.platformAPI?.events) {
      this.platformAPI.events.on("auth:signIn", (user: any) => {
        this.authContext.isAuthenticated = true
        this.authContext.userId = user.id
        this.authContext.permissions = user.permissions || []
      })

      this.platformAPI.events.on("auth:signOut", () => {
        this.authContext.isAuthenticated = false
        this.authContext.userId = undefined
        this.authContext.permissions = []
      })

      this.platformAPI.events.on("workspace:switch", (workspace: any) => {
        this.workspaceContext = workspace
        this.loadWorkspaceLiveSources()
      })
    }
  }

  private async syncUserLiveSources(): Promise<void> {
    if (!this.authContext.isAuthenticated) return

    try {
      // Load user's live sources from cloud storage
      const cloudSources = await this.loadLiveSources()

      // Merge with local sources
      for (const source of cloudSources) {
        liveSpecSourceService.registerSource(source)
      }
    } catch (error) {
      console.error("Failed to sync user live sources:", error)
    }
  }

  private async loadWorkspaceLiveSources(): Promise<void> {
    if (!this.workspaceContext) return

    try {
      // Load workspace-specific live sources
      const workspaceSources = await this.loadLiveSources()

      // Filter sources for current workspace
      const filteredSources = workspaceSources.filter(
        (source) => (source as any).workspaceId === this.workspaceContext!.id
      )

      for (const source of filteredSources) {
        liveSpecSourceService.registerSource(source)
      }
    } catch (error) {
      console.error("Failed to load workspace live sources:", error)
    }
  }

  private getStorageKey(namespace: string, key: string): string {
    const prefix = "hoppscotch"
    const userId = this.authContext.userId || "anonymous"
    const workspaceId = this.workspaceContext?.id || "default"

    return `${prefix}:${userId}:${workspaceId}:${namespace}:${key}`
  }

  private getStoredSources(): Record<string, LiveSpecSource> {
    // TODO: Implement proper persistence service integration
    // localStorage not allowed, return empty object
    return {}
  }
}

// Export singleton instance
export const platformIntegrationService = new PlatformIntegrationService()
export default platformIntegrationService
