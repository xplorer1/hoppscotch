/**
 * Live Specification Source Types
 * 
 * This module defines the core data structures and types for the Live Sync
 * live specification synchronization feature.
 */

/**
 * Status of a live specification source connection
 */
export type LiveSpecSourceStatus = 'connected' | 'error' | 'disconnected' | 'syncing'

/**
 * Type of live specification source
 */
export type LiveSpecSourceType = 'url' | 'file'

/**
 * Sync strategy for handling specification updates
 */
export type SyncStrategy = 'replace-all' | 'incremental'

/**
 * Configuration for URL-based sources
 */
export interface URLSourceConfig {
  url: string
  pollInterval?: number // in milliseconds, default 30000 (30s)
  headers?: Record<string, string> // for authenticated endpoints
  timeout?: number // request timeout in milliseconds
}

/**
 * Configuration for file-based sources
 */
export interface FileSourceConfig {
  filePath: string
  watchEnabled?: boolean // enable file system watching
}

/**
 * Framework types for development server detection
 */
export type FrameworkType = 
  | 'fastapi' 
  | 'express' 
  | 'spring' 
  | 'aspnet' 
  | 'django' 
  | 'flask' 
  | 'rails' 
  | 'laravel'

/**
 * Core live specification source interface
 */
export interface LiveSpecSource {
  id: string
  type: LiveSpecSourceType
  name: string // user-friendly name for the source
  status: LiveSpecSourceStatus
  config: URLSourceConfig | FileSourceConfig
  syncStrategy: SyncStrategy
  lastSync?: Date
  lastError?: string
  createdAt: Date
  updatedAt: Date
  // Additional properties used by components
  url?: string // Direct URL for convenience (when type is 'url')
  filePath?: string // Direct file path for convenience (when type is 'file')
  framework?: FrameworkType // Detected framework
  isActive?: boolean // Whether the source is actively syncing
}

/**
 * Sync history entry for tracking synchronization events
 */
export interface SyncHistoryEntry {
  id: string
  sourceId: string
  timestamp: Date
  status: 'success' | 'error' | 'partial'
  changesSummary?: string[]
  errorMessage?: string
  specVersion?: string // hash or version identifier of the spec
}

/**
 * Result of a synchronization operation
 */
export interface SyncResult {
  success: boolean
  hasChanges: boolean
  changesSummary: string[]
  errors: string[]
  specVersion?: string
  timestamp: Date
}

/**
 * Validation result for source configuration
 */
export interface SourceValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Live specification source service interface
 */
export interface LiveSpecSourceService {
  /**
   * Register a new live specification source
   */
  registerSource(source: Omit<LiveSpecSource, 'id' | 'createdAt' | 'updatedAt'>): Promise<LiveSpecSource>

  /**
   * Unregister and remove a live specification source
   */
  unregisterSource(sourceId: string): Promise<void>

  /**
   * Get all registered sources
   */
  getSources(): LiveSpecSource[]

  /**
   * Get a specific source by ID
   */
  getSource(sourceId: string): LiveSpecSource | null

  /**
   * Update source configuration
   */
  updateSource(sourceId: string, updates: Partial<LiveSpecSource>): Promise<LiveSpecSource>

  /**
   * Manually trigger synchronization for a source
   */
  syncSource(sourceId: string): Promise<SyncResult>

  /**
   * Validate source configuration
   */
  validateSource(config: URLSourceConfig | FileSourceConfig, type: LiveSpecSourceType): Promise<SourceValidationResult>

  /**
   * Get sync history for a source
   */
  getSyncHistory(sourceId: string, limit?: number): SyncHistoryEntry[]

  /**
   * Clear sync history for a source
   */
  clearSyncHistory(sourceId: string): Promise<void>
}

/**
 * Events emitted by the live spec source service
 */
export type LiveSpecSourceServiceEvent =
  | { type: 'source-registered'; source: LiveSpecSource }
  | { type: 'source-unregistered'; sourceId: string }
  | { type: 'source-updated'; source: LiveSpecSource }
  | { type: 'sync-started'; sourceId: string }
  | { type: 'sync-completed'; sourceId: string; result: SyncResult }
  | { type: 'sync-error'; sourceId: string; error: string }
  | { type: 'status-changed'; sourceId: string; status: LiveSpecSourceStatus }

/**
 * Configuration for live sync metadata on collections
 */
export interface LiveCollectionMetadata {
  sourceId?: string
  lastSyncTime?: Date
  isLiveSync?: boolean
  syncStrategy?: SyncStrategy
  customizations?: Record<string, {
    hasCustomHeaders?: boolean
    hasCustomAuth?: boolean
    hasCustomScripts?: boolean
    hasCustomParams?: boolean
  }>
  originalSpecHash?: string // hash of the original spec for change detection
}