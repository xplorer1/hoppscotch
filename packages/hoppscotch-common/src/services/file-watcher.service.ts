import * as chokidar from "chokidar"
import path from "path"

export interface FileChangeEvent {
  type: "created" | "modified" | "deleted"
  filePath: string
  timestamp: Date
}

export interface FileWatcher {
  watchFile(filePath: string, options?: WatchOptions): Promise<FileWatchResult>
  unwatchFile(filePath: string): Promise<void>
  isWatching(filePath: string): boolean
  getWatchedFiles(): string[]

  on(event: "fileChanged", handler: (event: FileChangeEvent) => void): void
  off(event: "fileChanged", handler: (event: FileChangeEvent) => void): void
}

export interface WatchOptions {
  debounceMs?: number
  validatePath?: boolean
  recursive?: boolean
}

export interface FileWatchResult {
  success: boolean
  filePath: string
  errors: string[]
  warnings: string[]
}

/**
 * Event emitter for file change events
 */
class SimpleEventEmitter {
  private handlers = new Map<string, Array<(event: FileChangeEvent) => void>>()

  emit(event: FileChangeEvent): void {
    const handlers = this.handlers.get("fileChanged") || []
    handlers.forEach((handler) => {
      try {
        handler(event)
      } catch (error) {
        console.error("Error in file change handler:", error)
      }
    })
  }

  on(eventType: string, handler: (event: FileChangeEvent) => void): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    this.handlers.get(eventType)!.push(handler)
  }

  off(eventType: string, handler: (event: FileChangeEvent) => void): void {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }
}

export class FileWatcherImpl implements FileWatcher {
  private watcher: chokidar.FSWatcher
  private watchedFiles = new Set<string>()
  private debounceTimers = new Map<string, NodeJS.Timeout>()
  private eventEmitter = new SimpleEventEmitter()

  constructor() {
    // Create the chokidar watcher instance
    this.watcher = chokidar.watch([], {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // Don't emit events for existing files
      followSymlinks: false, // Security: don't follow symlinks
      usePolling: false, // Use native file system events (faster)
      atomic: true, // Wait for write operations to complete
      awaitWriteFinish: {
        stabilityThreshold: 100, // Wait 100ms for file to stabilize
        pollInterval: 10, // Check every 10ms
      },
    })

    // Set up event listeners
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    // Handle file additions (created)
    this.watcher.on("add", (filePath: string) => {
      this.handleFileChange("created", filePath)
    })

    // Handle file changes (modified)
    this.watcher.on("change", (filePath: string) => {
      this.handleFileChange("modified", filePath)
    })

    // Handle file deletions
    this.watcher.on("unlink", (filePath: string) => {
      this.handleFileChange("deleted", filePath)
    })

    // Handle errors
    this.watcher.on("error", (err: unknown) => {
      console.error("File watcher error:", err)
    })
  }

  private validateFilePath(filePath: string): {
    isValid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    // Check if path is provided
    if (!filePath || filePath.trim() === "") {
      errors.push("File path cannot be empty")
      return { isValid: false, errors, warnings }
    }

    try {
      // Normalize the path to prevent path traversal attacks
      const normalizedPath = path.resolve(filePath)
      const currentWorkingDir = process.cwd()

      // Security check: Ensure the file is within the current working directory
      // This prevents access to system files or files outside the project
      if (!normalizedPath.startsWith(currentWorkingDir)) {
        errors.push(
          "File path must be within the current project directory for security reasons"
        )
        return { isValid: false, errors, warnings }
      }

      // Check for valid OpenAPI file extensions
      const validExtensions = [".json", ".yaml", ".yml"]
      const fileExtension = path.extname(normalizedPath).toLowerCase()

      if (!validExtensions.includes(fileExtension)) {
        warnings.push(
          `File extension '${fileExtension}' is not a typical OpenAPI format. Expected: ${validExtensions.join(", ")}`
        )
      }

      // Check for suspicious path patterns
      const suspiciousPatterns = [
        "../",
        "..\\",
        "/etc/",
        "/sys/",
        "/proc/",
        "C:\\Windows\\",
        "C:\\System32\\",
      ]
      const pathToCheck = filePath.toLowerCase()

      for (const pattern of suspiciousPatterns) {
        if (pathToCheck.includes(pattern.toLowerCase())) {
          errors.push(`Suspicious path pattern detected: ${pattern}`)
          return { isValid: false, errors, warnings }
        }
      }
    } catch (error) {
      errors.push(
        `Invalid file path: ${error instanceof Error ? error.message : "Unknown error"}`
      )
      return { isValid: false, errors, warnings }
    }

    return { isValid: true, errors, warnings }
  }

  private applyDebouncing(
    type: FileChangeEvent["type"],
    filePath: string
  ): void {
    // Clear any existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Default debounce time is 300ms, but can be customized per file
    const debounceMs = 300 // We'll make this configurable later

    // Set a new timer
    const timer = setTimeout(() => {
      // Remove the timer from our map
      this.debounceTimers.delete(filePath)

      // Emit the actual event
      this.eventEmitter.emit({
        type,
        filePath,
        timestamp: new Date(),
      })
    }, debounceMs)

    // Store the timer so we can cancel it if needed
    this.debounceTimers.set(filePath, timer)
  }

  private handleFileChange(
    type: FileChangeEvent["type"],
    filePath: string
  ): void {
    // Only emit events for files we're actually watching
    if (!this.watchedFiles.has(filePath)) {
      return
    }

    // Apply debouncing to prevent spam during file writes
    this.applyDebouncing(type, filePath)
  }

  async watchFile(
    filePath: string,
    options?: WatchOptions
  ): Promise<FileWatchResult> {
    const result: FileWatchResult = {
      success: false,
      filePath,
      errors: [],
      warnings: [],
    }

    try {
      // Step 1: Path validation and security checks
      if (options?.validatePath !== false) {
        const validationResult = this.validateFilePath(filePath)
        if (!validationResult.isValid) {
          result.errors.push(...validationResult.errors)
          return result
        }
        if (validationResult.warnings.length > 0) {
          result.warnings.push(...validationResult.warnings)
        }
      }

      // Step 2: Check if we're already watching this file
      if (this.watchedFiles.has(filePath)) {
        result.warnings.push("File is already being watched")
        result.success = true
        return result
      }

      // Step 3: Normalize the path for consistent tracking
      const normalizedPath = path.resolve(filePath)

      // Step 4: Add the file to chokidar watcher
      this.watcher.add(normalizedPath)

      // Step 5: Track the file in our watchedFiles set
      this.watchedFiles.add(normalizedPath)

      result.success = true
      result.filePath = normalizedPath
    } catch (error) {
      result.errors.push(
        `Failed to watch file: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }

    return result
  }

  async unwatchFile(filePath: string): Promise<void> {
    try {
      // Normalize the path to match how we stored it
      const normalizedPath = path.resolve(filePath)

      // Step 1: Remove from chokidar watcher
      this.watcher.unwatch(normalizedPath)

      // Step 2: Remove from our tracked files set
      this.watchedFiles.delete(normalizedPath)

      // Step 3: Clear any pending debounce timers for this file
      const existingTimer = this.debounceTimers.get(normalizedPath)
      if (existingTimer) {
        clearTimeout(existingTimer)
        this.debounceTimers.delete(normalizedPath)
      }
    } catch (error) {
      console.error(`Error unwatching file ${filePath}:`, error)
      // Don't throw here - unwatching should be forgiving
    }
  }

  isWatching(filePath: string): boolean {
    return this.watchedFiles.has(filePath)
  }

  getWatchedFiles(): string[] {
    return Array.from(this.watchedFiles)
  }

  on(event: "fileChanged", handler: (event: FileChangeEvent) => void): void {
    this.eventEmitter.on(event, handler)
  }

  off(event: "fileChanged", handler: (event: FileChangeEvent) => void): void {
    this.eventEmitter.off(event, handler)
  }

  // Cleanup method for when the service is destroyed
  destroy(): void {
    this.watcher.close()
    this.debounceTimers.forEach((timer) => clearTimeout(timer))
    this.debounceTimers.clear()
  }
}
