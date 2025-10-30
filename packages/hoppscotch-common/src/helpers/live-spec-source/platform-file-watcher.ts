/**
 * Platform-specific file watcher implementation
 * Provides file watching capabilities across different platforms
 */

import { platformIntegrationService } from "../../services/platform-integration.service"

export interface FileWatcherOptions {
  debounceMs?: number
  recursive?: boolean
  ignorePatterns?: string[]
}

export interface FileWatchEvent {
  type: "change" | "add" | "unlink"
  filePath: string
  timestamp: Date
}

export interface FileWatcher {
  watch(filePath: string, options?: FileWatcherOptions): Promise<void>
  unwatch(filePath: string): Promise<void>
  close(): Promise<void>
  on(event: "change", listener: (event: FileWatchEvent) => void): void
  off(event: "change", listener: (event: FileWatchEvent) => void): void
}

class PlatformFileWatcher implements FileWatcher {
  private watchers = new Map<string, any>()
  private listeners = new Set<(event: FileWatchEvent) => void>()
  private debounceTimers = new Map<string, NodeJS.Timeout>()

  /**
   * Watch a file for changes
   */
  async watch(
    filePath: string,
    options: FileWatcherOptions = {}
  ): Promise<void> {
    const config = platformIntegrationService.getPlatformConfig()

    if (!config.fileSystemAccess) {
      throw new Error("File system access not available on this platform")
    }

    // Clean up existing watcher
    await this.unwatch(filePath)

    try {
      const watcher = await this.createPlatformWatcher(filePath, options)
      this.watchers.set(filePath, watcher)
    } catch (error) {
      console.error(`Failed to watch file ${filePath}:`, error)
      throw error
    }
  }

  /**
   * Stop watching a file
   */
  async unwatch(filePath: string): Promise<void> {
    const watcher = this.watchers.get(filePath)

    if (watcher) {
      try {
        if (typeof watcher.close === "function") {
          await watcher.close()
        } else if (typeof watcher.unwatch === "function") {
          await watcher.unwatch()
        }
      } catch (error) {
        console.warn(`Failed to close watcher for ${filePath}:`, error)
      }

      this.watchers.delete(filePath)
    }

    // Clear debounce timer
    const timer = this.debounceTimers.get(filePath)
    if (timer) {
      clearTimeout(timer)
      this.debounceTimers.delete(filePath)
    }
  }

  /**
   * Close all watchers
   */
  async close(): Promise<void> {
    const filePaths = Array.from(this.watchers.keys())

    await Promise.all(filePaths.map((filePath) => this.unwatch(filePath)))

    this.listeners.clear()
  }

  /**
   * Add event listener
   */
  on(event: "change", listener: (event: FileWatchEvent) => void): void {
    if (event === "change") {
      this.listeners.add(listener)
    }
  }

  /**
   * Remove event listener
   */
  off(event: "change", listener: (event: FileWatchEvent) => void): void {
    if (event === "change") {
      this.listeners.delete(listener)
    }
  }

  // Private methods
  private async createPlatformWatcher(
    filePath: string,
    options: FileWatcherOptions
  ): Promise<any> {
    const config = platformIntegrationService.getPlatformConfig()

    switch (config.platform) {
      case "electron":
        return this.createElectronWatcher(filePath, options)

      case "web":
        return this.createWebWatcher(filePath, options)

      case "extension":
        return this.createExtensionWatcher(filePath, options)

      default:
        throw new Error(`Unsupported platform: ${config.platform}`)
    }
  }

  private async createElectronWatcher(
    filePath: string,
    options: FileWatcherOptions
  ): Promise<any> {
    // Use Node.js fs.watch via Electron's main process
    const { ipcRenderer } = window.require("electron")

    const watcherId = `watcher_${Date.now()}_${Math.random().toString(36).substring(2)}`

    // Setup IPC listener for file changes
    const handleFileChange = (event: any, data: any) => {
      if (data.watcherId === watcherId) {
        this.handleFileChange(
          filePath,
          data.eventType,
          options.debounceMs || 500
        )
      }
    }

    ipcRenderer.on("file-watcher-event", handleFileChange)

    // Start watching via main process
    await ipcRenderer.invoke("start-file-watcher", {
      watcherId,
      filePath,
      options: {
        persistent: true,
        recursive: options.recursive || false,
      },
    })

    return {
      watcherId,
      close: async () => {
        ipcRenderer.off("file-watcher-event", handleFileChange)
        await ipcRenderer.invoke("stop-file-watcher", watcherId)
      },
    }
  }

  private async createWebWatcher(
    filePath: string,
    options: FileWatcherOptions
  ): Promise<any> {
    // Web platform: Use polling with File System Access API or fallback
    if ("showDirectoryPicker" in window) {
      return this.createFileSystemAccessWatcher(filePath, options)
    }
    return this.createPollingWatcher(filePath, options)
  }

  private async createFileSystemAccessWatcher(
    filePath: string,
    options: FileWatcherOptions
  ): Promise<any> {
    // Use File System Access API (Chrome 86+)
    let fileHandle: any = null
    let lastModified = 0
    let pollInterval: NodeJS.Timeout | null = null

    try {
      // Request file access
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "OpenAPI files",
            accept: {
              "application/json": [".json"],
              "application/yaml": [".yaml", ".yml"],
            },
          },
        ],
      })

      fileHandle = handle

      // Get initial modification time
      const file = await fileHandle.getFile()
      lastModified = file.lastModified

      // Poll for changes
      const pollForChanges = async () => {
        try {
          const currentFile = await fileHandle.getFile()

          if (currentFile.lastModified > lastModified) {
            lastModified = currentFile.lastModified
            this.handleFileChange(filePath, "change", options.debounceMs || 500)
          }
        } catch (error) {
          console.warn("File polling error:", error)
        }
      }

      pollInterval = setInterval(pollForChanges, 1000) // Poll every second
    } catch (error) {
      throw new Error(`Failed to setup File System Access watcher: ${error}`)
    }

    return {
      fileHandle,
      close: async () => {
        if (pollInterval) {
          clearInterval(pollInterval)
        }
      },
    }
  }

  private async createPollingWatcher(
    _filePath: string, // eslint-disable-line @typescript-eslint/no-unused-vars
    _options: FileWatcherOptions // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<any> {
    // Fallback: Simple polling (limited functionality)
    let pollInterval: NodeJS.Timeout | null = null
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _lastContent = ""

    const pollForChanges = async () => {
      try {
        // This is a simplified approach - in reality, web apps can't directly access files
        // This would need to be implemented with user file selection
        console.warn("Polling watcher: Limited file access in web environment")
      } catch (error) {
        console.warn("Polling error:", error)
      }
    }

    pollInterval = setInterval(pollForChanges, 2000) // Poll every 2 seconds

    return {
      close: async () => {
        if (pollInterval) {
          clearInterval(pollInterval)
        }
      },
    }
  }

  private async createExtensionWatcher(
    filePath: string,
    options: FileWatcherOptions
  ): Promise<any> {
    // Browser extension: Limited file system access
    // Would typically use chrome.fileSystem API or similar

    if (window.chrome?.fileSystem) {
      return this.createChromeFileSystemWatcher(filePath, options)
    }
    throw new Error(
      "File system access not available in this extension environment"
    )
  }

  private async createChromeFileSystemWatcher(
    filePath: string,
    options: FileWatcherOptions
  ): Promise<any> {
    // Chrome extension file system API
    let entry: any = null
    let pollInterval: NodeJS.Timeout | null = null

    try {
      // Request file entry (this would need user interaction)
      entry = await new Promise((resolve, reject) => {
        ;(window.chrome as any).fileSystem.chooseEntry(
          { type: "openFile" },
          (fileEntry: any) => {
            if (window.chrome.runtime.lastError) {
              reject(window.chrome.runtime.lastError)
            } else {
              resolve(fileEntry)
            }
          }
        )
      })

      // Poll for changes
      let lastModified = 0

      const pollForChanges = async () => {
        try {
          entry.getMetadata((metadata: any) => {
            if (metadata.modificationTime.getTime() > lastModified) {
              lastModified = metadata.modificationTime.getTime()
              this.handleFileChange(
                filePath,
                "change",
                options.debounceMs || 500
              )
            }
          })
        } catch (error) {
          console.warn("Extension file polling error:", error)
        }
      }

      pollInterval = setInterval(pollForChanges, 1000)
    } catch (error) {
      throw new Error(`Failed to setup Chrome extension watcher: ${error}`)
    }

    return {
      entry,
      close: async () => {
        if (pollInterval) {
          clearInterval(pollInterval)
        }
      },
    }
  }

  private handleFileChange(
    filePath: string,
    eventType: string,
    debounceMs: number
  ): void {
    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(filePath)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      const event: FileWatchEvent = {
        type: eventType as "change" | "add" | "unlink",
        filePath,
        timestamp: new Date(),
      }

      // Notify all listeners
      this.listeners.forEach((listener) => {
        try {
          listener(event)
        } catch (error) {
          console.error("File watcher listener error:", error)
        }
      })

      this.debounceTimers.delete(filePath)
    }, debounceMs)

    this.debounceTimers.set(filePath, timer)
  }
}

// Export singleton instance
export const platformFileWatcher = new PlatformFileWatcher()

/**
 * Create a platform-appropriate file watcher
 */
export function createFileWatcher(): FileWatcher {
  return new PlatformFileWatcher()
}

export default platformFileWatcher
