/**
 * Specification Diff Engine Types
 * 
 * Types for comparing OpenAPI specifications and tracking changes
 */

// Define the different types of changes we can detect
export type ChangeType = 
  | 'endpoint-added' 
  | 'endpoint-removed' 
  | 'endpoint-modified'
  | 'schema-added'
  | 'schema-removed' 
  | 'schema-modified'
  | 'parameter-added'
  | 'parameter-removed'
  | 'parameter-modified'
  | 'response-changed'

// Define severity levels for changes
export type ChangeSeverity = 'breaking' | 'non-breaking' | 'informational'

// Endpoint change types for UI components
export type EndpointChangeType = 'added' | 'modified' | 'removed'

// Detail about a specific field change
export interface ChangeDetail {
  field: string
  oldValue?: any
  newValue?: any
  isBreaking: boolean
}

// Endpoint parameter information
export interface EndpointParameter {
  name: string
  type: string
  required: boolean
}

// New endpoint information for added endpoints
export interface NewEndpointInfo {
  summary?: string
  description?: string
  parameters?: EndpointParameter[]
}

// A change to a specific endpoint
export interface EndpointChange {
  path: string
  method: string
  type: EndpointChangeType
  isBreaking: boolean
  summary?: string
  details?: ChangeDetail[]
  newEndpoint?: NewEndpointInfo
}

// Main diff result used by UI components
export interface SpecDiff {
  hasChanges: boolean
  endpoints: EndpointChange[]
  summary: string
}

// A single change in the specification (legacy format)
export interface SpecChange {
    type: ChangeType
    severity: ChangeSeverity
    path: string // JSONPath to the changed item (e.g., "/paths/users/{id}/get")
    description: string // Human-readable description
    oldValue?: any // What it was before
    newValue?: any // What it is now
    affectedEndpoints?: string[] // Which endpoints are affected by this change
}

// Result of comparing two specifications (legacy format)
export interface SpecDiffResult {
    hasChanges: boolean
    changes: SpecChange[]
    summary: {
        added: number
        modified: number
        removed: number
        breaking: number
        nonBreaking: number
    }
    oldSpecHash: string
    newSpecHash: string
    comparedAt: Date
}
  
  // Configuration for the diff engine
export interface DiffOptions {
    ignoreDescriptions?: boolean // Ignore changes to descriptions/summaries
    ignoreExamples?: boolean // Ignore changes to example values
    detectBreakingChanges?: boolean // Analyze if changes are breaking
    preserveUserCustomizations?: boolean // Try to preserve user modifications
}