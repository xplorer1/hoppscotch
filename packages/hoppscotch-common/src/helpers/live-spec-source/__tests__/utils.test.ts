/**
 * Tests for live specification source utility functions
 */

import { describe, it, expect } from "vitest"
import {
  generateSourceId,
  generateSyncHistoryId,
  createDefaultURLConfig,
  createDefaultFileConfig,
  createLiveSpecSource,
  getSourceDisplayPath,
  isURLSource,
  isFileSource,
  getPollInterval,
  getTimeout,
  shouldMonitorSource,
  createSyncHistoryEntry,
  formatSyncTime,
  generateContentHash,
  sanitizeSourceName,
  areConfigsEqual,
} from "../utils"
import {
  LiveSpecSource,
  URLSourceConfig,
  FileSourceConfig,
} from "~/types/live-spec-source"

describe("ID generation", () => {
  it("should generate unique source IDs", () => {
    const id1 = generateSourceId()
    const id2 = generateSourceId()

    expect(id1).toMatch(/^live-spec-[a-f0-9-]+$/)
    expect(id2).toMatch(/^live-spec-[a-f0-9-]+$/)
    expect(id1).not.toBe(id2)
  })

  it("should generate unique sync history IDs", () => {
    const id1 = generateSyncHistoryId()
    const id2 = generateSyncHistoryId()

    expect(id1).toMatch(/^sync-[a-f0-9-]+$/)
    expect(id2).toMatch(/^sync-[a-f0-9-]+$/)
    expect(id1).not.toBe(id2)
  })
})

describe("Default configurations", () => {
  it("should create default URL config", () => {
    const config = createDefaultURLConfig("https://api.example.com/spec.json")

    expect(config).toEqual({
      url: "https://api.example.com/spec.json",
      pollInterval: 30000,
      timeout: 10000,
      headers: {},
    })
  })

  it("should create default file config", () => {
    const config = createDefaultFileConfig("./spec.json")

    expect(config).toEqual({
      filePath: "./spec.json",
      watchEnabled: true,
    })
  })
})

describe("createLiveSpecSource", () => {
  it("should create a URL source", () => {
    const config: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
    }

    const source = createLiveSpecSource("My API", "url", config)

    expect(source).toEqual({
      name: "My API",
      type: "url",
      status: "disconnected",
      config,
      syncStrategy: "replace-all",
      lastSync: undefined,
      lastError: undefined,
    })
  })

  it("should create a file source", () => {
    const config: FileSourceConfig = {
      filePath: "./spec.json",
    }

    const source = createLiveSpecSource("Local Spec", "file", config)

    expect(source).toEqual({
      name: "Local Spec",
      type: "file",
      status: "disconnected",
      config,
      syncStrategy: "replace-all",
      lastSync: undefined,
      lastError: undefined,
    })
  })

  it("should trim source name", () => {
    const config: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
    }

    const source = createLiveSpecSource("  My API  ", "url", config)
    expect(source.name).toBe("My API")
  })
})

describe("Source type checking", () => {
  const urlSource: LiveSpecSource = {
    id: "test-1",
    name: "URL Source",
    type: "url",
    status: "connected",
    config: { url: "https://api.example.com/spec.json" },
    syncStrategy: "replace-all",
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const fileSource: LiveSpecSource = {
    id: "test-2",
    name: "File Source",
    type: "file",
    status: "connected",
    config: { filePath: "./spec.json" },
    syncStrategy: "replace-all",
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it("should identify URL sources", () => {
    expect(isURLSource(urlSource)).toBe(true)
    expect(isURLSource(fileSource)).toBe(false)
  })

  it("should identify file sources", () => {
    expect(isFileSource(fileSource)).toBe(true)
    expect(isFileSource(urlSource)).toBe(false)
  })

  it("should get display path for URL source", () => {
    expect(getSourceDisplayPath(urlSource)).toBe(
      "https://api.example.com/spec.json"
    )
  })

  it("should get display path for file source", () => {
    expect(getSourceDisplayPath(fileSource)).toBe("./spec.json")
  })

  it("should get poll interval for URL source", () => {
    expect(getPollInterval(urlSource)).toBe(30000) // default

    const customUrlSource = {
      ...urlSource,
      config: { ...(urlSource.config as URLSourceConfig), pollInterval: 60000 },
    }
    expect(getPollInterval(customUrlSource)).toBe(60000)
  })

  it("should return 0 poll interval for file source", () => {
    expect(getPollInterval(fileSource)).toBe(0)
  })

  it("should get timeout for URL source", () => {
    expect(getTimeout(urlSource)).toBe(10000) // default

    const customUrlSource = {
      ...urlSource,
      config: { ...(urlSource.config as URLSourceConfig), timeout: 5000 },
    }
    expect(getTimeout(customUrlSource)).toBe(5000)
  })

  it("should return 0 timeout for file source", () => {
    expect(getTimeout(fileSource)).toBe(0)
  })
})

describe("shouldMonitorSource", () => {
  it("should not monitor disconnected sources", () => {
    const source: LiveSpecSource = {
      id: "test",
      name: "Test",
      type: "url",
      status: "disconnected",
      config: { url: "https://api.example.com/spec.json", pollInterval: 30000 },
      syncStrategy: "replace-all",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    expect(shouldMonitorSource(source)).toBe(false)
  })

  it("should not monitor error sources", () => {
    const source: LiveSpecSource = {
      id: "test",
      name: "Test",
      type: "url",
      status: "error",
      config: { url: "https://api.example.com/spec.json", pollInterval: 30000 },
      syncStrategy: "replace-all",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    expect(shouldMonitorSource(source)).toBe(false)
  })

  it("should monitor connected URL sources with poll interval", () => {
    const source: LiveSpecSource = {
      id: "test",
      name: "Test",
      type: "url",
      status: "connected",
      config: { url: "https://api.example.com/spec.json", pollInterval: 30000 },
      syncStrategy: "replace-all",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    expect(shouldMonitorSource(source)).toBe(true)
  })

  it("should monitor connected file sources with watch enabled", () => {
    const source: LiveSpecSource = {
      id: "test",
      name: "Test",
      type: "file",
      status: "connected",
      config: { filePath: "./spec.json", watchEnabled: true },
      syncStrategy: "replace-all",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    expect(shouldMonitorSource(source)).toBe(true)
  })
})

describe("createSyncHistoryEntry", () => {
  it("should create a basic sync history entry", () => {
    const entry = createSyncHistoryEntry("source-1", "success")

    expect(entry.id).toMatch(/^sync-[a-f0-9-]+$/)
    expect(entry.sourceId).toBe("source-1")
    expect(entry.status).toBe("success")
    expect(entry.timestamp).toBeInstanceOf(Date)
  })

  it("should create sync history entry with options", () => {
    const entry = createSyncHistoryEntry("source-1", "error", {
      errorMessage: "Network timeout",
      specVersion: "abc123",
    })

    expect(entry.errorMessage).toBe("Network timeout")
    expect(entry.specVersion).toBe("abc123")
  })
})

describe("formatSyncTime", () => {
  it('should format recent time as "Just now"', () => {
    const now = new Date()
    expect(formatSyncTime(now)).toBe("Just now")
  })

  it("should format minutes ago", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    expect(formatSyncTime(fiveMinutesAgo)).toBe("5 minutes ago")
  })

  it("should format hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    expect(formatSyncTime(twoHoursAgo)).toBe("2 hours ago")
  })

  it("should format days ago", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    expect(formatSyncTime(threeDaysAgo)).toBe("3 days ago")
  })
})

describe("generateContentHash", () => {
  it("should generate consistent hash for same content", () => {
    const content = "test content"
    const hash1 = generateContentHash(content)
    const hash2 = generateContentHash(content)

    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-z0-9]+$/)
  })

  it("should generate different hashes for different content", () => {
    const hash1 = generateContentHash("content 1")
    const hash2 = generateContentHash("content 2")

    expect(hash1).not.toBe(hash2)
  })

  it("should handle empty content", () => {
    const hash = generateContentHash("")
    expect(hash).toBe("0")
  })
})

describe("sanitizeSourceName", () => {
  it("should trim whitespace", () => {
    expect(sanitizeSourceName("  My API  ")).toBe("My API")
  })

  it("should remove special characters", () => {
    expect(sanitizeSourceName("My API @#$%")).toBe("My API ")
  })

  it("should normalize whitespace", () => {
    expect(sanitizeSourceName("My    API")).toBe("My API")
  })

  it("should limit length", () => {
    const longName = "A".repeat(150)
    const sanitized = sanitizeSourceName(longName)
    expect(sanitized.length).toBe(100)
  })
})

describe("areConfigsEqual", () => {
  it("should compare URL configs correctly", () => {
    const config1: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
      pollInterval: 30000,
      timeout: 10000,
      headers: { Authorization: "Bearer token" },
    }

    const config2: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
      pollInterval: 30000,
      timeout: 10000,
      headers: { Authorization: "Bearer token" },
    }

    expect(areConfigsEqual(config1, config2, "url")).toBe(true)
  })

  it("should detect URL config differences", () => {
    const config1: URLSourceConfig = {
      url: "https://api.example.com/spec.json",
    }

    const config2: URLSourceConfig = {
      url: "https://api.different.com/spec.json",
    }

    expect(areConfigsEqual(config1, config2, "url")).toBe(false)
  })

  it("should compare file configs correctly", () => {
    const config1: FileSourceConfig = {
      filePath: "./spec.json",
      watchEnabled: true,
    }

    const config2: FileSourceConfig = {
      filePath: "./spec.json",
      watchEnabled: true,
    }

    expect(areConfigsEqual(config1, config2, "file")).toBe(true)
  })

  it("should detect file config differences", () => {
    const config1: FileSourceConfig = {
      filePath: "./spec.json",
      watchEnabled: true,
    }

    const config2: FileSourceConfig = {
      filePath: "./spec.json",
      watchEnabled: false,
    }

    expect(areConfigsEqual(config1, config2, "file")).toBe(false)
  })
})
