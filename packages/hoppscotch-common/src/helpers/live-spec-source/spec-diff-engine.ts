/**
 * OpenAPI Specification Diff Engine
 *
 * Compares two OpenAPI specifications and identifies changes
 */

import {
  SpecChange,
  SpecDiffResult,
  DiffOptions,
  ChangeSeverity,
} from "~/types/spec-diff"

/**
 * Main class for comparing OpenAPI specifications
 */
export class SpecDiffEngine {
  private options: DiffOptions

  constructor(options: DiffOptions = {}) {
    this.options = {
      ignoreDescriptions: false,
      ignoreExamples: false,
      detectBreakingChanges: true,
      preserveUserCustomizations: true,
      ...options,
    }
  }

  /**
   * Compare two OpenAPI specifications
   */
  async compareSpecs(oldSpec: any, newSpec: any): Promise<SpecDiffResult> {
    const changes: SpecChange[] = []

    // Generate hashes for the specs
    const oldSpecHash = this.generateSpecHash(oldSpec)
    const newSpecHash = this.generateSpecHash(newSpec)

    // If hashes are the same, no changes
    if (oldSpecHash === newSpecHash) {
      return {
        hasChanges: false,
        changes: [],
        summary: {
          added: 0,
          modified: 0,
          removed: 0,
          breaking: 0,
          nonBreaking: 0,
        },
        oldSpecHash,
        newSpecHash,
        comparedAt: new Date(),
      }
    }

    // Compare different sections of the spec
    changes.push(...this.compareEndpoints(oldSpec, newSpec))
    changes.push(...this.compareSchemas(oldSpec, newSpec))

    // Generate summary
    const summary = this.generateSummary(changes)

    return {
      hasChanges: changes.length > 0,
      changes,
      summary,
      oldSpecHash,
      newSpecHash,
      comparedAt: new Date(),
    }
  }

  /**
   * Generate a hash for a specification (for quick comparison)
   */
  private generateSpecHash(spec: any): string {
    // Create a normalized version of the spec for hashing
    const normalized = this.normalizeSpec(spec)
    const str = JSON.stringify(normalized)

    // Simple hash function (browser-compatible)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & 0xffffffff // Convert to 32-bit integer
    }
    return hash.toString(16)
  }

  /**
   * Normalize spec for consistent hashing (remove things we want to ignore)
   */
  private normalizeSpec(spec: any): any {
    const normalized = JSON.parse(JSON.stringify(spec))

    if (this.options.ignoreDescriptions) {
      // TODO: Remove description fields recursively
    }

    if (this.options.ignoreExamples) {
      // TODO: Remove example fields recursively
    }

    return normalized
  }

  /**
   * Compare endpoints (paths) between two specs
   */
  private compareEndpoints(oldSpec: any, newSpec: any): SpecChange[] {
    const changes: SpecChange[] = []

    const oldPaths = oldSpec?.paths || {}
    const newPaths = newSpec?.paths || {}

    // Find added endpoints
    for (const path in newPaths) {
      if (!(path in oldPaths)) {
        const methods = Object.keys(newPaths[path]).filter((key) =>
          ["get", "post", "put", "delete", "patch", "options", "head"].includes(
            key
          )
        )

        for (const method of methods) {
          changes.push({
            type: "endpoint-added",
            severity: "non-breaking",
            path: `${method.toUpperCase()} ${path}`,
            description: `Added new endpoint: ${method.toUpperCase()} ${path}`,
            newValue: newPaths[path][method],
            affectedEndpoints: [`${method.toUpperCase()} ${path}`],
          })
        }
      }
    }

    // Find removed endpoints
    for (const path in oldPaths) {
      if (!(path in newPaths)) {
        const methods = Object.keys(oldPaths[path]).filter((key) =>
          ["get", "post", "put", "delete", "patch", "options", "head"].includes(
            key
          )
        )

        for (const method of methods) {
          changes.push({
            type: "endpoint-removed",
            severity: "breaking",
            path: `${method.toUpperCase()} ${path}`,
            description: `Removed endpoint: ${method.toUpperCase()} ${path}`,
            oldValue: oldPaths[path][method],
            affectedEndpoints: [`${method.toUpperCase()} ${path}`],
          })
        }
      }
    }

    // Find modified endpoints
    for (const path in oldPaths) {
      if (path in newPaths) {
        changes.push(
          ...this.compareEndpointMethods(path, oldPaths[path], newPaths[path])
        )
      }
    }

    return changes
  }

  /**
   * Compare methods within a single endpoint path
   */
  private compareEndpointMethods(
    path: string,
    oldMethods: any,
    newMethods: any
  ): SpecChange[] {
    const changes: SpecChange[] = []
    const httpMethods = [
      "get",
      "post",
      "put",
      "delete",
      "patch",
      "options",
      "head",
    ]

    for (const method of httpMethods) {
      const endpointId = `${method.toUpperCase()} ${path}`

      if (method in oldMethods && method in newMethods) {
        // Method exists in both - check for modifications
        const oldMethod = oldMethods[method]
        const newMethod = newMethods[method]

        // Compare operation-level metadata (summary, description, operationId, tags)
        changes.push(
          ...this.compareOperationMetadata(endpointId, oldMethod, newMethod)
        )

        // Compare parameters
        changes.push(
          ...this.compareParameters(
            endpointId,
            oldMethod.parameters || [],
            newMethod.parameters || []
          )
        )

        // Compare request body
        if (
          JSON.stringify(oldMethod.requestBody) !==
          JSON.stringify(newMethod.requestBody)
        ) {
          changes.push({
            type: "endpoint-modified",
            severity: this.determineRequestBodyChangeSeverity(
              oldMethod.requestBody,
              newMethod.requestBody
            ),
            path: endpointId,
            description: `Request body changed for ${endpointId}`,
            oldValue: oldMethod.requestBody,
            newValue: newMethod.requestBody,
            affectedEndpoints: [endpointId],
          })
        }

        // Compare responses
        changes.push(
          ...this.compareResponses(
            endpointId,
            oldMethod.responses || {},
            newMethod.responses || {}
          )
        )
      } else if (method in oldMethods && !(method in newMethods)) {
        // Method was removed
        changes.push({
          type: "endpoint-removed",
          severity: "breaking",
          path: endpointId,
          description: `Removed endpoint: ${endpointId}`,
          oldValue: oldMethods[method],
          affectedEndpoints: [endpointId],
        })
      } else if (!(method in oldMethods) && method in newMethods) {
        // Method was added
        changes.push({
          type: "endpoint-added",
          severity: "non-breaking",
          path: endpointId,
          description: `Added new endpoint: ${endpointId}`,
          newValue: newMethods[method],
          affectedEndpoints: [endpointId],
        })
      }
    }

    return changes
  }

  /**
   * Compare operation-level metadata (summary, description, operationId, tags)
   */
  private compareOperationMetadata(
    endpointId: string,
    oldMethod: any,
    newMethod: any
  ): SpecChange[] {
    const changes: SpecChange[] = []

    // Compare summary
    if (oldMethod.summary !== newMethod.summary) {
      changes.push({
        type: "endpoint-modified",
        severity: "informational",
        path: endpointId, // Use actual endpoint path, not endpointId/summary
        description: `Summary changed for ${endpointId}`,
        oldValue: oldMethod, // Pass full old operation so sync engine can update properly
        newValue: newMethod, // Pass full new operation so sync engine can update properly
        affectedEndpoints: [endpointId],
      })
    }

    // Compare description
    if (oldMethod.description !== newMethod.description) {
      changes.push({
        type: "endpoint-modified",
        severity: "informational",
        path: endpointId, // Use actual endpoint path
        description: `Description changed for ${endpointId}`,
        oldValue: oldMethod,
        newValue: newMethod,
        affectedEndpoints: [endpointId],
      })
    }

    // Compare operationId
    if (oldMethod.operationId !== newMethod.operationId) {
      changes.push({
        type: "endpoint-modified",
        severity: "non-breaking",
        path: endpointId, // Use actual endpoint path
        description: `Operation ID changed for ${endpointId}`,
        oldValue: oldMethod,
        newValue: newMethod,
        affectedEndpoints: [endpointId],
      })
    }

    // Compare tags
    const oldTags = (oldMethod.tags || []).sort().join(",")
    const newTags = (newMethod.tags || []).sort().join(",")
    if (oldTags !== newTags) {
      changes.push({
        type: "endpoint-modified",
        severity: "informational",
        path: endpointId, // Use actual endpoint path
        description: `Tags changed for ${endpointId}`,
        oldValue: oldMethod,
        newValue: newMethod,
        affectedEndpoints: [endpointId],
      })
    }

    return changes
  }

  /**
   * Compare parameters between old and new endpoint
   */
  private compareParameters(
    endpointId: string,
    oldParams: any[],
    newParams: any[]
  ): SpecChange[] {
    const changes: SpecChange[] = []

    // Create maps for easier comparison
    const oldParamMap = new Map(oldParams.map((p) => [`${p.name}-${p.in}`, p]))
    const newParamMap = new Map(newParams.map((p) => [`${p.name}-${p.in}`, p]))

    // Find added parameters
    for (const [key, param] of newParamMap) {
      if (!oldParamMap.has(key)) {
        changes.push({
          type: "parameter-added",
          severity: param.required ? "breaking" : "non-breaking",
          path: `${endpointId}/parameters/${param.name}`,
          description: `Added ${param.required ? "required" : "optional"} parameter: ${param.name} (${param.in})`,
          newValue: param,
          affectedEndpoints: [endpointId],
        })
      }
    }

    // Find removed parameters
    for (const [key, param] of oldParamMap) {
      if (!newParamMap.has(key)) {
        changes.push({
          type: "parameter-removed",
          severity: "breaking",
          path: `${endpointId}/parameters/${param.name}`,
          description: `Removed parameter: ${param.name} (${param.in})`,
          oldValue: param,
          affectedEndpoints: [endpointId],
        })
      }
    }

    // Find modified parameters
    for (const [key, oldParam] of oldParamMap) {
      const newParam = newParamMap.get(key)
      if (newParam && JSON.stringify(oldParam) !== JSON.stringify(newParam)) {
        changes.push({
          type: "parameter-modified",
          severity: this.determineParameterChangeSeverity(oldParam, newParam),
          path: `${endpointId}/parameters/${oldParam.name}`,
          description: `Modified parameter: ${oldParam.name} (${oldParam.in})`,
          oldValue: oldParam,
          newValue: newParam,
          affectedEndpoints: [endpointId],
        })
      }
    }

    return changes
  }

  /**
   * Compare schemas (data models) between two specs
   */
  private compareSchemas(oldSpec: any, newSpec: any): SpecChange[] {
    const changes: SpecChange[] = []

    const oldSchemas = oldSpec?.components?.schemas || {}
    const newSchemas = newSpec?.components?.schemas || {}

    // Find added schemas
    for (const schemaName in newSchemas) {
      if (!(schemaName in oldSchemas)) {
        changes.push({
          type: "schema-added",
          severity: "non-breaking",
          path: `/components/schemas/${schemaName}`,
          description: `Added new schema: ${schemaName}`,
          newValue: newSchemas[schemaName],
          affectedEndpoints: this.findEndpointsUsingSchema(schemaName, newSpec),
        })
      }
    }

    // Find removed schemas
    for (const schemaName in oldSchemas) {
      if (!(schemaName in newSchemas)) {
        changes.push({
          type: "schema-removed",
          severity: "breaking",
          path: `/components/schemas/${schemaName}`,
          description: `Removed schema: ${schemaName}`,
          oldValue: oldSchemas[schemaName],
          affectedEndpoints: this.findEndpointsUsingSchema(schemaName, oldSpec),
        })
      }
    }

    // Find modified schemas
    for (const schemaName in oldSchemas) {
      if (schemaName in newSchemas) {
        const oldSchema = oldSchemas[schemaName]
        const newSchema = newSchemas[schemaName]

        if (JSON.stringify(oldSchema) !== JSON.stringify(newSchema)) {
          changes.push({
            type: "schema-modified",
            severity: this.determineSchemaChangeSeverity(oldSchema, newSchema),
            path: `/components/schemas/${schemaName}`,
            description: `Modified schema: ${schemaName}`,
            oldValue: oldSchema,
            newValue: newSchema,
            affectedEndpoints: this.findEndpointsUsingSchema(
              schemaName,
              newSpec
            ),
          })
        }
      }
    }

    return changes
  }

  /**
   * Compare responses between old and new endpoint
   */
  private compareResponses(
    endpointId: string,
    oldResponses: any,
    newResponses: any
  ): SpecChange[] {
    const changes: SpecChange[] = []

    // Get all unique status codes from both old and new responses
    const allStatusCodes = new Set([
      ...Object.keys(oldResponses),
      ...Object.keys(newResponses),
    ])

    for (const statusCode of allStatusCodes) {
      const oldResponse = oldResponses[statusCode]
      const newResponse = newResponses[statusCode]

      if (!oldResponse && newResponse) {
        // New response status code added
        changes.push({
          type: "endpoint-modified",
          severity: "non-breaking",
          path: `${endpointId}/responses/${statusCode}`,
          description: `Added response status ${statusCode} for ${endpointId}`,
          newValue: newResponse,
          affectedEndpoints: [endpointId],
        })
      } else if (oldResponse && !newResponse) {
        // Response status code removed
        changes.push({
          type: "endpoint-modified",
          severity: "breaking",
          path: `${endpointId}/responses/${statusCode}`,
          description: `Removed response status ${statusCode} from ${endpointId}`,
          oldValue: oldResponse,
          affectedEndpoints: [endpointId],
        })
      } else if (oldResponse && newResponse) {
        // Response exists in both - check for modifications
        changes.push(
          ...this.compareResponseContent(
            endpointId,
            statusCode,
            oldResponse,
            newResponse
          )
        )
      }
    }

    return changes
  }

  private determineRequestBodyChangeSeverity(
    oldBody: any,
    newBody: any
  ): ChangeSeverity {
    // Simple heuristic - you can make this more sophisticated
    if (!oldBody && newBody) return "non-breaking" // Adding request body
    if (oldBody && !newBody) return "breaking" // Removing request body
    return "non-breaking" // Modifying request body
  }

  private determineParameterChangeSeverity(
    oldParam: any,
    newParam: any
  ): ChangeSeverity {
    // If required status changed
    if (oldParam.required !== newParam.required) {
      return newParam.required ? "breaking" : "non-breaking"
    }

    // If type changed
    if (oldParam.schema?.type !== newParam.schema?.type) {
      return "breaking"
    }

    return "non-breaking"
  }

  private generateSummary(changes: SpecChange[]) {
    const summary = {
      added: 0,
      modified: 0,
      removed: 0,
      breaking: 0,
      nonBreaking: 0,
    }

    for (const change of changes) {
      if (change.type.includes("added")) summary.added++
      else if (change.type.includes("removed")) summary.removed++
      else if (change.type.includes("modified")) summary.modified++

      if (change.severity === "breaking") summary.breaking++
      else summary.nonBreaking++
    }

    return summary
  }

  /**
   * Find which endpoints use a specific schema
   */
  private findEndpointsUsingSchema(schemaName: string, spec: any): string[] {
    const endpoints: string[] = []
    const paths = spec?.paths || {}

    for (const path in paths) {
      for (const method in paths[path]) {
        if (
          ["get", "post", "put", "delete", "patch", "options", "head"].includes(
            method
          )
        ) {
          const operation = paths[path][method]

          // Check if this endpoint references the schema
          if (this.operationReferencesSchema(operation, schemaName)) {
            endpoints.push(`${method.toUpperCase()} ${path}`)
          }
        }
      }
    }

    return endpoints
  }

  /**
   * Check if an operation (endpoint) references a specific schema
   */
  private operationReferencesSchema(
    operation: any,
    schemaName: string
  ): boolean {
    const operationStr = JSON.stringify(operation)
    return operationStr.includes(`#/components/schemas/${schemaName}`)
  }

  /**
   * Determine if schema changes are breaking or not
   */
  private determineSchemaChangeSeverity(
    oldSchema: any,
    newSchema: any
  ): ChangeSeverity {
    // Simple heuristics - you can make this more sophisticated

    // If required fields were added, it's breaking
    const oldRequired = oldSchema.required || []
    const newRequired = newSchema.required || []

    if (newRequired.length > oldRequired.length) {
      return "breaking"
    }

    // If properties were removed, it's breaking
    const oldProperties = Object.keys(oldSchema.properties || {})
    const newProperties = Object.keys(newSchema.properties || {})

    if (newProperties.length < oldProperties.length) {
      return "breaking"
    }

    // Otherwise, assume non-breaking
    return "non-breaking"
  }

  /**
   * Compare the content of a specific response status code
   */
  private compareResponseContent(
    endpointId: string,
    statusCode: string,
    oldResponse: any,
    newResponse: any
  ): SpecChange[] {
    const changes: SpecChange[] = []

    // Compare response description
    if (
      oldResponse.description !== newResponse.description &&
      !this.options.ignoreDescriptions
    ) {
      changes.push({
        type: "endpoint-modified",
        severity: "informational",
        path: `${endpointId}/responses/${statusCode}/description`,
        description: `Response description changed for ${statusCode} in ${endpointId}`,
        oldValue: oldResponse.description,
        newValue: newResponse.description,
        affectedEndpoints: [endpointId],
      })
    }

    // Compare response content (media types)
    const oldContent = oldResponse.content || {}
    const newContent = newResponse.content || {}

    changes.push(
      ...this.compareResponseMediaTypes(
        endpointId,
        statusCode,
        oldContent,
        newContent
      )
    )

    // Compare response headers
    const oldHeaders = oldResponse.headers || {}
    const newHeaders = newResponse.headers || {}

    changes.push(
      ...this.compareResponseHeaders(
        endpointId,
        statusCode,
        oldHeaders,
        newHeaders
      )
    )

    return changes
  }

  /**
   * Compare response media types (application/json, text/plain, etc.)
   */
  private compareResponseMediaTypes(
    endpointId: string,
    statusCode: string,
    oldContent: any,
    newContent: any
  ): SpecChange[] {
    const changes: SpecChange[] = []

    const allMediaTypes = new Set([
      ...Object.keys(oldContent),
      ...Object.keys(newContent),
    ])

    for (const mediaType of allMediaTypes) {
      const oldMedia = oldContent[mediaType]
      const newMedia = newContent[mediaType]

      if (!oldMedia && newMedia) {
        // New media type added
        changes.push({
          type: "endpoint-modified",
          severity: "non-breaking",
          path: `${endpointId}/responses/${statusCode}/content/${mediaType}`,
          description: `Added ${mediaType} response type for ${statusCode} in ${endpointId}`,
          newValue: newMedia,
          affectedEndpoints: [endpointId],
        })
      } else if (oldMedia && !newMedia) {
        // Media type removed
        changes.push({
          type: "endpoint-modified",
          severity: "breaking",
          path: `${endpointId}/responses/${statusCode}/content/${mediaType}`,
          description: `Removed ${mediaType} response type for ${statusCode} in ${endpointId}`,
          oldValue: oldMedia,
          affectedEndpoints: [endpointId],
        })
      } else if (oldMedia && newMedia) {
        // Media type exists in both - compare schemas
        if (
          JSON.stringify(oldMedia.schema) !== JSON.stringify(newMedia.schema)
        ) {
          changes.push({
            type: "endpoint-modified",
            severity: this.determineResponseSchemaChangeSeverity(
              oldMedia.schema,
              newMedia.schema
            ),
            path: `${endpointId}/responses/${statusCode}/content/${mediaType}/schema`,
            description: `Response schema changed for ${mediaType} ${statusCode} in ${endpointId}`,
            oldValue: oldMedia.schema,
            newValue: newMedia.schema,
            affectedEndpoints: [endpointId],
          })
        }
      }
    }

    return changes
  }

  /**
   * Compare response headers
   */
  private compareResponseHeaders(
    endpointId: string,
    statusCode: string,
    oldHeaders: any,
    newHeaders: any
  ): SpecChange[] {
    const changes: SpecChange[] = []

    const allHeaders = new Set([
      ...Object.keys(oldHeaders),
      ...Object.keys(newHeaders),
    ])

    for (const headerName of allHeaders) {
      const oldHeader = oldHeaders[headerName]
      const newHeader = newHeaders[headerName]

      if (!oldHeader && newHeader) {
        // New response header added
        changes.push({
          type: "endpoint-modified",
          severity: "non-breaking",
          path: `${endpointId}/responses/${statusCode}/headers/${headerName}`,
          description: `Added response header ${headerName} for ${statusCode} in ${endpointId}`,
          newValue: newHeader,
          affectedEndpoints: [endpointId],
        })
      } else if (oldHeader && !newHeader) {
        // Response header removed
        changes.push({
          type: "endpoint-modified",
          severity: "breaking",
          path: `${endpointId}/responses/${statusCode}/headers/${headerName}`,
          description: `Removed response header ${headerName} from ${statusCode} in ${endpointId}`,
          oldValue: oldHeader,
          affectedEndpoints: [endpointId],
        })
      } else if (
        oldHeader &&
        newHeader &&
        JSON.stringify(oldHeader) !== JSON.stringify(newHeader)
      ) {
        // Response header modified
        changes.push({
          type: "endpoint-modified",
          severity: "non-breaking", // Header changes are usually non-breaking
          path: `${endpointId}/responses/${statusCode}/headers/${headerName}`,
          description: `Modified response header ${headerName} for ${statusCode} in ${endpointId}`,
          oldValue: oldHeader,
          newValue: newHeader,
          affectedEndpoints: [endpointId],
        })
      }
    }

    return changes
  }

  /**
   * Determine severity of response schema changes
   */
  private determineResponseSchemaChangeSeverity(
    oldSchema: any,
    newSchema: any
  ): ChangeSeverity {
    if (!oldSchema && newSchema) return "non-breaking" // Adding schema
    if (oldSchema && !newSchema) return "breaking" // Removing schema

    // If properties were removed from response, it's breaking
    const oldProperties = Object.keys(oldSchema?.properties || {})
    const newProperties = Object.keys(newSchema?.properties || {})

    if (newProperties.length < oldProperties.length) {
      return "breaking"
    }

    // If data types changed, it's breaking
    if (oldSchema?.type !== newSchema?.type) {
      return "breaking"
    }

    return "non-breaking"
  }
}
