/**
 * Tests for live specification storage implementations
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { 
  InMemoryLiveSpecStorage, 
  DEFAULT_LIVE_SPEC_SETTINGS 
} from '../live-spec-storage'
import { LiveSpecSource, SyncHistoryEntry } from '../live-spec-source'

describe('InMemoryLiveSpecStorage', () => {
  let storage: InMemoryLiveSpecStorage

  beforeEach(() => {
    storage = new InMemoryLiveSpecStorage()
  })

  it('should start with empty sources', async () => {
    const sources = await storage.loadSources()
    expect(sources).toEqual([])
  })

  it('should save and load sources', async () => {
    const testSources: LiveSpecSource[] = [
      {
        id: 'test-1',
        name: 'Test Source',
        type: 'url',
        status: 'connected',
        config: { url: 'https://api.example.com/spec.json' },
        syncStrategy: 'replace-all',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    await storage.saveSources(testSources)
    const loaded = await storage.loadSources()
    
    expect(loaded).toEqual(testSources)
  })

  it('should save and load sync history', async () => {
    const entry: SyncHistoryEntry = {
      id: 'sync-1',
      sourceId: 'source-1',
      timestamp: new Date(),
      status: 'success',
      changesSummary: ['Added endpoint /users']
    }

    await storage.saveSyncHistoryEntry(entry)
    const history = await storage.loadSyncHistory('source-1')
    
    expect(history).toEqual([entry])
  })

  it('should clear sync history for specific source', async () => {
    const entry1: SyncHistoryEntry = {
      id: 'sync-1',
      sourceId: 'source-1',
      timestamp: new Date(),
      status: 'success'
    }

    const entry2: SyncHistoryEntry = {
      id: 'sync-2',
      sourceId: 'source-2',
      timestamp: new Date(),
      status: 'success'
    }

    await storage.saveSyncHistoryEntry(entry1)
    await storage.saveSyncHistoryEntry(entry2)
    
    await storage.clearSyncHistory('source-1')
    
    const history1 = await storage.loadSyncHistory('source-1')
    const history2 = await storage.loadSyncHistory('source-2')
    
    expect(history1).toEqual([])
    expect(history2).toEqual([entry2])
  })

  it('should load and save settings', async () => {
    const customSettings = {
      ...DEFAULT_LIVE_SPEC_SETTINGS,
      defaultPollInterval: 60000
    }

    await storage.saveSettings(customSettings)
    const loaded = await storage.loadSettings()
    
    expect(loaded).toEqual(customSettings)
  })

  it('should clear all data', async () => {
    const testSource: LiveSpecSource = {
      id: 'test-1',
      name: 'Test',
      type: 'url',
      status: 'connected',
      config: { url: 'https://api.example.com/spec.json' },
      syncStrategy: 'replace-all',
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const testEntry: SyncHistoryEntry = {
      id: 'sync-1',
      sourceId: 'test-1',
      timestamp: new Date(),
      status: 'success'
    }

    await storage.saveSources([testSource])
    await storage.saveSyncHistoryEntry(testEntry)
    
    await storage.clearAll()
    
    const sources = await storage.loadSources()
    const history = await storage.loadSyncHistory('test-1')
    const settings = await storage.loadSettings()
    
    expect(sources).toEqual([])
    expect(history).toEqual([])
    expect(settings).toEqual(DEFAULT_LIVE_SPEC_SETTINGS)
  })

  it('should limit sync history entries based on settings', async () => {
    // Set max entries to 2
    await storage.saveSettings({
      ...DEFAULT_LIVE_SPEC_SETTINGS,
      maxSyncHistoryEntries: 2
    })

    // Add 3 entries
    for (let i = 1; i <= 3; i++) {
      const entry: SyncHistoryEntry = {
        id: `sync-${i}`,
        sourceId: 'source-1',
        timestamp: new Date(Date.now() + i * 1000), // Different timestamps
        status: 'success'
      }
      await storage.saveSyncHistoryEntry(entry)
    }

    const history = await storage.loadSyncHistory('source-1')
    expect(history).toHaveLength(2)
    
    // Should keep the most recent entries (order may vary in in-memory implementation)
    const historyIds = history.map(h => h.id).sort()
    expect(historyIds).toEqual(['sync-2', 'sync-3'])
  })
})

// Note: LocalStorageLiveSpecStorage tests would require mocking localStorage
// which is more complex and would be better tested in an integration environment