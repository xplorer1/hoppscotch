import { describe, it, expect, beforeEach, afterEach, vi, Mock } from "vitest"
import { FileWatcherImpl, FileChangeEvent } from "../file-watcher.service"
import * as chokidar from "chokidar"
import path from "path"

// Mock chokidar
vi.mock("chokidar")

describe("FileWatcherImpl", () => {
  let fileWatcher: FileWatcherImpl
  let mockWatcher: {
    watch: Mock
    add: Mock
    unwatch: Mock
    on: Mock
    close: Mock
  }

  beforeEach(() => {
    // Create mock watcher
    mockWatcher = {
      watch: vi.fn(),
      add: vi.fn(),
      unwatch: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
    }

    // Mock chokidar.watch to return our mock watcher
    ;(chokidar.watch as Mock).mockReturnValue(mockWatcher)

    fileWatcher = new FileWatcherImpl()
  })

  afterEach(() => {
    fileWatcher.destroy()
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("should initialize chokidar watcher with correct options", () => {
      expect(chokidar.watch).toHaveBeenCalledWith([], {
        ignored: /(^|[/\\])\../,
        persistent: true,
        ignoreInitial: true,
        followSymlinks: false,
        usePolling: false,
        atomic: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 10,
        },
      })
    })

    it("should set up event listeners", () => {
      expect(mockWatcher.on).toHaveBeenCalledWith("add", expect.any(Function))
      expect(mockWatcher.on).toHaveBeenCalledWith(
        "change",
        expect.any(Function)
      )
      expect(mockWatcher.on).toHaveBeenCalledWith(
        "unlink",
        expect.any(Function)
      )
      expect(mockWatcher.on).toHaveBeenCalledWith("error", expect.any(Function))
    })
  })

  describe("watchFile", () => {
    it("should successfully watch a valid file", async () => {
      const testFile = path.join(process.cwd(), "test-spec.json")

      const result = await fileWatcher.watchFile(testFile)

      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(mockWatcher.add).toHaveBeenCalledWith(testFile)
      expect(fileWatcher.isWatching(testFile)).toBe(true)
    })

    it("should reject empty file paths", async () => {
      const result = await fileWatcher.watchFile("")

      expect(result.success).toBe(false)
      expect(result.errors).toContain("File path cannot be empty")
    })

    it("should reject paths outside project directory", async () => {
      const result = await fileWatcher.watchFile("/etc/passwd")

      expect(result.success).toBe(false)
      expect(result.errors).toContain(
        "File path must be within the current project directory for security reasons"
      )
    })

    it("should warn about non-OpenAPI file extensions", async () => {
      const testFile = path.join(process.cwd(), "test.txt")

      const result = await fileWatcher.watchFile(testFile)

      expect(result.success).toBe(true)
      expect(result.warnings).toContain(
        "File extension '.txt' is not a typical OpenAPI format. Expected: .json, .yaml, .yml"
      )
    })

    it("should handle already watched files gracefully", async () => {
      const testFile = path.join(process.cwd(), "test-spec.json")

      // Watch the file first time
      await fileWatcher.watchFile(testFile)

      // Watch the same file again
      const result = await fileWatcher.watchFile(testFile)

      expect(result.success).toBe(true)
      expect(result.warnings).toContain("File is already being watched")
    })

    it("should skip validation when validatePath is false", async () => {
      const result = await fileWatcher.watchFile("/etc/passwd", {
        validatePath: false,
      })

      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe("unwatchFile", () => {
    it("should successfully unwatch a file", async () => {
      const testFile = path.join(process.cwd(), "test-spec.json")

      // First watch the file
      await fileWatcher.watchFile(testFile)
      expect(fileWatcher.isWatching(testFile)).toBe(true)

      // Then unwatch it
      await fileWatcher.unwatchFile(testFile)

      expect(mockWatcher.unwatch).toHaveBeenCalledWith(testFile)
      expect(fileWatcher.isWatching(testFile)).toBe(false)
    })

    it("should handle unwatching non-existent files gracefully", async () => {
      const testFile = path.join(process.cwd(), "non-existent.json")

      // Should not throw
      await expect(fileWatcher.unwatchFile(testFile)).resolves.toBeUndefined()
    })
  })

  describe("getWatchedFiles", () => {
    it("should return list of watched files", async () => {
      const file1 = path.join(process.cwd(), "spec1.json")
      const file2 = path.join(process.cwd(), "spec2.yaml")

      await fileWatcher.watchFile(file1)
      await fileWatcher.watchFile(file2)

      const watchedFiles = fileWatcher.getWatchedFiles()
      expect(watchedFiles).toContain(file1)
      expect(watchedFiles).toContain(file2)
      expect(watchedFiles).toHaveLength(2)
    })
  })

  describe("event handling", () => {
    it("should emit file change events", (done) => {
      const testFile = path.join(process.cwd(), "test-spec.json")

      // Set up event listener
      fileWatcher.on("fileChanged", (event: FileChangeEvent) => {
        expect(event.type).toBe("modified")
        expect(event.filePath).toBe(testFile)
        expect(event.timestamp).toBeInstanceOf(Date)
        done()
      })

      // Watch the file first
      fileWatcher.watchFile(testFile).then(() => {
        // Simulate a file change event from chokidar
        const changeHandler = mockWatcher.on.mock.calls.find(
          (call) => call[0] === "change"
        )[1]
        changeHandler(testFile)
      })
    })

    it("should not emit events for unwatched files", (done) => {
      const testFile = path.join(process.cwd(), "test-spec.json")
      const unwatchedFile = path.join(process.cwd(), "unwatched.json")

      let eventEmitted = false

      // Set up event listener
      fileWatcher.on("fileChanged", () => {
        eventEmitted = true
      })

      // Watch only one file
      fileWatcher.watchFile(testFile).then(() => {
        // Simulate a file change event for unwatched file
        const changeHandler = mockWatcher.on.mock.calls.find(
          (call) => call[0] === "change"
        )[1]
        changeHandler(unwatchedFile)

        // Wait a bit and check that no event was emitted
        setTimeout(() => {
          expect(eventEmitted).toBe(false)
          done()
        }, 50)
      })
    })

    it("should handle debouncing correctly", (done) => {
      const testFile = path.join(process.cwd(), "test-spec.json")
      let eventCount = 0

      // Set up event listener
      fileWatcher.on("fileChanged", () => {
        eventCount++
      })

      fileWatcher.watchFile(testFile).then(() => {
        const changeHandler = mockWatcher.on.mock.calls.find(
          (call) => call[0] === "change"
        )[1]

        // Simulate rapid file changes
        changeHandler(testFile)
        changeHandler(testFile)
        changeHandler(testFile)

        // Wait for debounce period to pass
        setTimeout(() => {
          // Should only emit one event due to debouncing
          expect(eventCount).toBe(1)
          done()
        }, 400) // Wait longer than debounce period (300ms)
      })
    })
  })

  describe("destroy", () => {
    it("should clean up resources", () => {
      fileWatcher.destroy()

      expect(mockWatcher.close).toHaveBeenCalled()
    })
  })
})
