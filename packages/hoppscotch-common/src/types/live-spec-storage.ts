/**
 * Storage interfaces and data models for live specification sources
 */

import { LiveSpecSource, SyncHistoryEntry } from './live-spec-source'

/**
 * Storage key constants for live spec data
 */
export const STORAGE_KEYS = {
  LIVE_SOURCES: 'live-spec-sources',
  SYNC_HISTORY: 'live-spec-sync-history',
  SETTINGS: 'live-spec-settings'
} as const

/**
 * Settings for live specification synchronization
 */
export interface LiveSpecSettings {
  defaultPollInterval: number // default polling interval in milliseconds
  maxSyncHistoryEntries: number // maximum number of history entries to keep per source
  enableAutoSync: boolean // global toggle for automatic synchronization
  enableNotifications: boolean // show toast notifications for sync events
  enableChangeHighlighting: boolean // highlight changed endpoints in UI
  syncTimeout: number // default timeout for sync operations
}

/**
 * Default settings for live specification synchronization
 */
export const DEFAULT_LIVE_SPEC_SETTINGS: LiveSpecSettings = {
  defaultPollInterval: 30000, // 30 seconds
  maxSyncHistoryEntries: 50,
  enableAutoSync: true,
  enableNotifications: true,
  enableChangeHighlighting: true,
  syncTimeout: 10000 // 10 seconds
}

/**
 * Stored data structure for live sources
 */
export interface StoredLiveSourceData {
  sources: LiveSpecSource[]
  lastUpdated: Date
}

/**
 * Stored data structure for sync history
 */
export interface StoredSyncHistoryData {
  entries: SyncHistoryEntry[]
  lastUpdated: Date
}

/**
 * Storage interface for live specification data
 */
export interface LiveSpecStorage {
  /**
   * Load all live sources from storage
   */
  loadSources(): Promise<LiveSpecSource[]>
  
  /**
   * Save all live sources to storage
   */
  saveSources(sources: LiveSpecSource[]): Promise<void>
  
  /**
   * Load sync history for a specific source
   */
  loadSyncHistory(sourceId: string): Promise<SyncHistoryEntry[]>
  
  /**
   * Save sync history entry
   */
  saveSyncHistoryEntry(entry: SyncHistoryEntry): Promise<void>
  
  /**
   * Clear sync history for a source
   */
  clearSyncHistory(sourceId: string): Promise<void>
  
  /**
   * Load settings
   */
  loadSettings(): Promise<LiveSpecSettings>
  
  /**
   * Save settings
   */
  saveSettings(settings: LiveSpecSettings): Promise<void>
  
  /**
   * Clear all data (for cleanup/reset)
   */
  clearAll(): Promise<void>
}

/**
 * In-memory storage implementation for testing and fallback
 */
export class InMemoryLiveSpecStorage implements LiveSpecStorage {
  private sources: LiveSpecSource[] = []
  private syncHistory: Map<string, SyncHistoryEntry[]> = new Map()
  private settings: LiveSpecSettings = { ...DEFAULT_LIVE_SPEC_SETTINGS }

  async loadSources(): Promise<LiveSpecSource[]> {
    return [...this.sources]
  }

  async saveSources(sources: LiveSpecSource[]): Promise<void> {
    this.sources = [...sources]
  }

  async loadSyncHistory(sourceId: string): Promise<SyncHistoryEntry[]> {
    return [...(this.syncHistory.get(sourceId) || [])]
  }

  async saveSyncHistoryEntry(entry: SyncHistoryEntry): Promise<void> {
    const existing = this.syncHistory.get(entry.sourceId) || []
    existing.push(entry)
    
    // Keep only the most recent entries based on settings
    if (existing.length > this.settings.maxSyncHistoryEntries) {
      existing.splice(0, existing.length - this.settings.maxSyncHistoryEntries)
    }
    
    this.syncHistory.set(entry.sourceId, existing)
  }

  async clearSyncHistory(sourceId: string): Promise<void> {
    this.syncHistory.delete(sourceId)
  }

  async loadSettings(): Promise<LiveSpecSettings> {
    return { ...this.settings }
  }

  async saveSettings(settings: LiveSpecSettings): Promise<void> {
    this.settings = { ...settings }
  }

  async clearAll(): Promise<void> {
    this.sources = []
    this.syncHistory.clear()
    this.settings = { ...DEFAULT_LIVE_SPEC_SETTINGS }
  }
}

/**
 * LocalStorage-based implementation
 */
export class LocalStorageLiveSpecStorage implements LiveSpecStorage {
  private getStorageKey(key: string): string {
    return `hopp-${key}`
  }

  async loadSources(): Promise<LiveSpecSource[]> {
    try {
      // TODO: Replace with PersistenceService
      // const data = localStorage.getItem(this.getStorageKey(STORAGE_KEYS.LIVE_SOURCES))
      const data = null
      if (!data) return []
      
      const parsed: StoredLiveSourceData = JSON.parse(data)
      
      // Convert date strings back to Date objects
      return parsed.sources.map(source => ({
        ...source,
        createdAt: new Date(source.createdAt),
        updatedAt: new Date(source.updatedAt),
        lastSync: source.lastSync ? new Date(source.lastSync) : undefined
      }))
    } catch (error) {
      console.error('Failed to load live sources from localStorage:', error)
      return []
    }
  }

  async saveSources(): Promise<void> {
    try {
      // const data: StoredLiveSourceData = {
      //   sources,
      //   lastUpdated: new Date()
      // }
      
      // TODO: Replace with PersistenceService
      // localStorage.setItem(
      //   this.getStorageKey(STORAGE_KEYS.LIVE_SOURCES),
      //   JSON.stringify(data)
      // )
    } catch (error) {
      console.error('Failed to save live sources to localStorage:', error)
      throw error
    }
  }

  async loadSyncHistory(sourceId: string): Promise<SyncHistoryEntry[]> {
    try {
      // TODO: Replace with PersistenceService
      // const data = localStorage.getItem(this.getStorageKey(STORAGE_KEYS.SYNC_HISTORY))
      const data = null
      if (!data) return []
      
      const parsed: StoredSyncHistoryData = JSON.parse(data)
      
      // Filter entries for the specific source and convert dates
      return parsed.entries
        .filter(entry => entry.sourceId === sourceId)
        .map(entry => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }))
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()) // Most recent first
    } catch (error) {
      console.error('Failed to load sync history from localStorage:', error)
      return []
    }
  }

  async saveSyncHistoryEntry(entry: SyncHistoryEntry): Promise<void> {
    try {
      // Load existing history
      // TODO: Replace with PersistenceService
      // const data = localStorage.getItem(this.getStorageKey(STORAGE_KEYS.SYNC_HISTORY))
      const data = null
      const existing: StoredSyncHistoryData = data 
        ? JSON.parse(data)
        : { entries: [], lastUpdated: new Date() }
      
      // Add new entry
      existing.entries.push(entry)
      existing.lastUpdated = new Date()
      
      // Clean up old entries (keep only recent ones per source)
      // const settings = await this.loadSettings()
      const entriesBySource = new Map<string, SyncHistoryEntry[]>()
      
      existing.entries.forEach(e => {
        if (!entriesBySource.has(e.sourceId)) {
          entriesBySource.set(e.sourceId, [])
        }
        entriesBySource.get(e.sourceId)!.push(e)
      })
      
      // Keep only the most recent entries per source
      const cleanedEntries: SyncHistoryEntry[] = []
      entriesBySource.forEach((entries) => {
        const sorted = entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        cleanedEntries.push(...sorted.slice(0, DEFAULT_LIVE_SPEC_SETTINGS.maxSyncHistoryEntries))
      })
      
      existing.entries = cleanedEntries
      
      // TODO: Replace with PersistenceService
      // localStorage.setItem(
      //   this.getStorageKey(STORAGE_KEYS.SYNC_HISTORY),
      //   JSON.stringify(existing)
      // )
    } catch (error) {
      console.error('Failed to save sync history entry to localStorage:', error)
      throw error
    }
  }

  async clearSyncHistory(sourceId: string): Promise<void> {
    try {
      // TODO: Replace with PersistenceService
      // const data = localStorage.getItem(this.getStorageKey(STORAGE_KEYS.SYNC_HISTORY))
      const data = null
      if (!data) return
      
      const parsed: StoredSyncHistoryData = JSON.parse(data)
      parsed.entries = parsed.entries.filter(entry => entry.sourceId !== sourceId)
      parsed.lastUpdated = new Date()
      
      // localStorage.setItem(
      //   this.getStorageKey(STORAGE_KEYS.SYNC_HISTORY),
      //   JSON.stringify(parsed)
      // )
    } catch (error) {
      console.error('Failed to clear sync history from localStorage:', error)
      throw error
    }
  }

  async loadSettings(): Promise<LiveSpecSettings> {
    try {
      // TODO: Replace with PersistenceService
      // const data = localStorage.getItem(this.getStorageKey(STORAGE_KEYS.SETTINGS))
      const data = null
      if (!data) return { ...DEFAULT_LIVE_SPEC_SETTINGS }
      
      const parsed = JSON.parse(data)
      return { ...DEFAULT_LIVE_SPEC_SETTINGS, ...parsed }
    } catch (error) {
      console.error('Failed to load live spec settings from localStorage:', error)
      return { ...DEFAULT_LIVE_SPEC_SETTINGS }
    }
  }

  async saveSettings(settings: LiveSpecSettings): Promise<void> {
    try {
      // TODO: Replace with PersistenceService
      // localStorage.setItem(
      //   this.getStorageKey(STORAGE_KEYS.SETTINGS),
      //   JSON.stringify(settings)
      // )
      
      // Temporary: Acknowledge the parameter to avoid linting error
      void settings
    } catch (error) {
      console.error('Failed to save live spec settings to localStorage:', error)
      throw error
    }
  }

  async clearAll(): Promise<void> {
    try {
      // TODO: Replace with PersistenceService
      // localStorage.removeItem(this.getStorageKey(STORAGE_KEYS.LIVE_SOURCES))
      // localStorage.removeItem(this.getStorageKey(STORAGE_KEYS.SYNC_HISTORY))
      // localStorage.removeItem(this.getStorageKey(STORAGE_KEYS.SETTINGS))
    } catch (error) {
      console.error('Failed to clear live spec data from localStorage:', error)
      throw error
    }
  }
}