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

// Define severity levels for changes
export type ChangeSeverity = 'breaking' | 'non-breaking' | 'informational'

// A single change in the specification
export interface SpecChange {
    type: ChangeType
    severity: ChangeSeverity
    path: string // JSONPath to the changed item (e.g., "/paths/users/{id}/get")
    description: string // Human-readable description
    oldValue?: any // What it was before
    newValue?: any // What it is now
    affectedEndpoints?: string[] // Which endpoints are affected by this change
}

// Result of comparing two specifications
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