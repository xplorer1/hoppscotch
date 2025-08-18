/**
 * Live Collection Metadata Types
 * 
 * This module extends the existing collection types with live sync metadata
 * and framework awareness for the API Studio feature.
 */

import { HoppCollection } from "@hoppscotch/data"
import { LiveCollectionMetadata } from "./live-spec-source"

/**
 * Framework detection information for code-first development
 */
export interface FrameworkInfo {
  name: string // e.g., 'FastAPI', 'Express', 'Spring Boot', 'ASP.NET Core'
  version?: string // detected framework version
  icon?: string // icon identifier for UI display
  setupGuide?: string // URL or identifier for setup documentation
  commonEndpoints?: string[] // typical OpenAPI endpoints for this framework
  confidence?: number
  detectionPatterns?: {
    packageJson?: string[] // npm package names that indicate this framework
    requirements?: string[] // Python requirements.txt patterns
    gradle?: string[] // Gradle dependency patterns
    maven?: string[] // Maven dependency patterns
    filePatterns?: string[] // File patterns that indicate this framework
  }
}

/**
 * User customizations tracking for intelligent merging
 */
export interface CollectionCustomizations {
  // Request-level customizations
  requests?: Record<string, {
    hasCustomHeaders?: boolean
    hasCustomAuth?: boolean
    hasCustomScripts?: boolean
    hasCustomParams?: boolean
    hasCustomBody?: boolean
    customizedAt?: Date
  }>
  
  // Collection-level customizations
  collection?: {
    hasCustomAuth?: boolean
    hasCustomHeaders?: boolean
    hasCustomName?: boolean
    hasCustomDescription?: boolean
    customizedAt?: Date
  }
  
  // Folder-level customizations
  folders?: Record<string, {
    hasCustomAuth?: boolean
    hasCustomHeaders?: boolean
    hasCustomName?: boolean
    customizedAt?: Date
  }>
}

/**
 * Extended live collection metadata with framework awareness
 */
export interface ExtendedLiveCollectionMetadata extends LiveCollectionMetadata {
  // Framework detection and awareness
  framework?: FrameworkInfo
  
  // Enhanced customization tracking
  customizations?: CollectionCustomizations
  
  // Code generation context
  codeGeneration?: {
    sourceCodePath?: string // path to the source code that generates this spec
    buildCommand?: string // command to regenerate the spec
    lastCodeChange?: Date // when the source code was last modified
    specGenerationTime?: Date // when the spec was last generated
  }
  
  // Sync configuration
  syncConfig?: {
    autoSync?: boolean // automatically sync when changes detected
    syncInterval?: number // polling interval in milliseconds
    conflictResolution?: 'user-wins' | 'code-wins' | 'prompt' // how to handle conflicts
    preserveCustomizations?: boolean // whether to preserve user customizations
  }
  
  // Change tracking
  changeTracking?: {
    lastSpecHash?: string // hash of the last synced spec
    pendingChanges?: string[] // list of pending changes from code
    userModifications?: string[] // list of user modifications since last sync
    conflictingChanges?: string[] // changes that conflict between code and user
  }
}

/**
 * Collection with live sync metadata
 */
export interface LiveSyncCollection extends HoppCollection {
  liveMetadata?: ExtendedLiveCollectionMetadata
}

/**
 * Framework detection result
 */
export interface FrameworkDetectionResult {
  detected: boolean
  frameworks: FrameworkInfo[]
  confidence: number // 0-1 confidence score
  detectionMethod: 'package-analysis' | 'file-pattern' | 'url-analysis' | 'manual'
  suggestions?: string[] // setup suggestions based on detected framework
}

/**
 * Sync conflict information
 */
export interface SyncConflict {
  type: 'endpoint-modified' | 'endpoint-removed' | 'auth-changed' | 'headers-changed'
  path: string // path to the conflicting item
  codeVersion: any // what the code wants to set
  userVersion: any // what the user has customized
  description: string // human-readable description of the conflict
  resolution?: 'use-code' | 'use-user' | 'merge' // how the conflict was resolved
}

/**
 * Enhanced sync result with conflict information
 */
export interface EnhancedSyncResult {
  success: boolean
  hasChanges: boolean
  changesSummary: string[]
  conflicts: SyncConflict[]
  errors: string[]
  warnings: string[]
  framework?: FrameworkInfo
  specVersion?: string
  timestamp: Date
  preservedCustomizations?: string[] // list of customizations that were preserved
}