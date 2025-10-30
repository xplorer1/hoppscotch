/**
 * Smart Collection Updater Service
 *
 * Intelligently updates collections while preserving user customizations
 */

import type { SpecDiff, EndpointChange } from "~/types/spec-diff"
import type {
  LiveSyncCollection,
  SyncConflict,
} from "~/types/live-collection-metadata"
import type { HoppRESTRequest } from "@hoppscotch/data"
import { makeRESTRequest } from "@hoppscotch/data"
import {
  updateCollectionSyncStatus,
  findCollectionBySourceId,
  getLiveSyncCollections,
  saveRESTRequestAs,
  removeRESTRequest,
} from "~/newstore/collections"
import { changeNotificationService } from "./change-notification.service"

interface UpdateOptions {
  preserveUserCustomizations?: boolean
  conflictResolution?: "user-wins" | "code-wins" | "prompt"
  skipBreakingChanges?: boolean
  backupBeforeUpdate?: boolean
}

interface CollectionUpdateResult {
  success: boolean
  updatedRequests: number
  addedRequests: number
  removedRequests: number
  conflicts: ConflictInfo[]
  errors: string[]
}

interface ConflictInfo {
  requestPath: string
  conflictType: "user-modified" | "both-modified" | "user-added"
  userValue: any
  codeValue: any
  resolution?: "user-wins" | "code-wins" | "merged"
}

interface UserCustomization {
  requestId: string
  path: string
  customizations: {
    headers?: Record<string, string>
    auth?: any
    preRequestScript?: string
    testScript?: string
    name?: string
    description?: string
  }
}

/**
 * Service for intelligently updating collections while preserving user customizations
 */
export class SmartCollectionUpdaterService {
  private userCustomizations = new Map<string, UserCustomization[]>()

  /**
   * Update a collection based on spec changes
   */
  async updateCollection(
    sourceId: string,
    specDiff: SpecDiff,
    options: UpdateOptions = {}
  ): Promise<CollectionUpdateResult> {
    const defaultOptions: UpdateOptions = {
      preserveUserCustomizations: true,
      conflictResolution: "prompt",
      skipBreakingChanges: false,
      backupBeforeUpdate: true,
      ...options,
    }

    try {
      // Find the collection
      const collection = findCollectionBySourceId(sourceId)
      if (!collection) {
        throw new Error(`Collection not found for source: ${sourceId}`)
      }

      const collections = getLiveSyncCollections()
      const collectionIndex = collections.findIndex(
        (col) => col.id === collection.id
      )
      if (collectionIndex === -1) {
        throw new Error(`Collection index not found for source: ${sourceId}`)
      }

      // Backup current state if requested
      if (defaultOptions.backupBeforeUpdate) {
        await this.backupCollection(collection)
      }

      // Track user customizations before update
      if (defaultOptions.preserveUserCustomizations) {
        this.trackUserCustomizations(collection)
      }

      // Process the changes
      const result = await this.processSpecChanges(
        collection,
        collectionIndex,
        specDiff,
        defaultOptions
      )

      // Update collection sync status
      updateCollectionSyncStatus(
        collectionIndex,
        {
          success: result.success,
          specHash: this.generateSpecHash(specDiff),
          changesSummary: result.errors.length
            ? ["Some changes could not be applied"]
            : [
                `${result.updatedRequests} updated`,
                `${result.addedRequests} added`,
                `${result.removedRequests} removed`,
              ],
        },
        result.conflicts as unknown as SyncConflict[]
      )

      // Show notification
      this.showUpdateNotification(collection, result)

      return result
    } catch (error) {
      console.error(`Failed to update collection for ${sourceId}:`, error)
      return {
        success: false,
        updatedRequests: 0,
        addedRequests: 0,
        removedRequests: 0,
        conflicts: [],
        errors: [error instanceof Error ? error.message : String(error)],
      }
    }
  }

  /**
   * Process spec changes and update collection
   */
  private async processSpecChanges(
    collection: LiveSyncCollection,
    collectionIndex: number,
    specDiff: SpecDiff,
    options: UpdateOptions
  ): Promise<CollectionUpdateResult> {
    const result: CollectionUpdateResult = {
      success: true,
      updatedRequests: 0,
      addedRequests: 0,
      removedRequests: 0,
      conflicts: [],
      errors: [],
    }

    // Process each endpoint change
    for (const change of specDiff.endpoints) {
      try {
        await this.processEndpointChange(
          collection,
          collectionIndex,
          change,
          options,
          result
        )
      } catch (error) {
        result.errors.push(`Failed to process ${change.path}: ${error}`)
        result.success = false
      }
    }

    return result
  }

  /**
   * Process a single endpoint change
   */
  private async processEndpointChange(
    collection: LiveSyncCollection,
    collectionIndex: number,
    change: EndpointChange,
    options: UpdateOptions,
    result: CollectionUpdateResult
  ): Promise<void> {
    switch (change.type) {
      case "added":
        await this.handleAddedEndpoint(
          collection,
          collectionIndex,
          change,
          result
        )
        break

      case "modified":
        await this.handleModifiedEndpoint(
          collection,
          collectionIndex,
          change,
          options,
          result
        )
        break

      case "removed":
        await this.handleRemovedEndpoint(
          collection,
          collectionIndex,
          change,
          options,
          result
        )
        break
    }
  }

  /**
   * Handle added endpoints
   */
  private async handleAddedEndpoint(
    collection: LiveSyncCollection,
    collectionIndex: number,
    change: EndpointChange,
    result: CollectionUpdateResult
  ): Promise<void> {
    try {
      // Create new request from endpoint info
      const newRequest = this.createRequestFromEndpoint(change)

      // Add to collection
      const collectionPath = collectionIndex.toString()
      saveRESTRequestAs(collectionPath, newRequest)

      result.addedRequests++
      console.log(`Added new endpoint: ${change.method} ${change.path}`)
    } catch (error) {
      result.errors.push(`Failed to add endpoint ${change.path}: ${error}`)
    }
  }

  /**
   * Handle modified endpoints
   */
  private async handleModifiedEndpoint(
    collection: LiveSyncCollection,
    collectionIndex: number,
    change: EndpointChange,
    options: UpdateOptions,
    result: CollectionUpdateResult
  ): Promise<void> {
    // Skip breaking changes if requested
    if (options.skipBreakingChanges && change.isBreaking) {
      console.log(`Skipping breaking change for: ${change.path}`)
      return
    }

    try {
      // Find existing request
      const existingRequest = this.findRequestInCollection(
        collection,
        change.path,
        change.method
      )

      if (!existingRequest) {
        // Request doesn't exist, treat as added
        await this.handleAddedEndpoint(
          collection,
          collectionIndex,
          change,
          result
        )
        return
      }

      // Check for user customizations
      const hasUserCustomizations = this.hasUserCustomizations(existingRequest)

      if (hasUserCustomizations && options.preserveUserCustomizations) {
        // Handle conflict
        const conflict = await this.handleUpdateConflict(
          collection,
          existingRequest,
          change,
          options.conflictResolution || "prompt"
        )

        if (conflict) {
          result.conflicts.push(conflict)
        }
      } else {
        // No conflicts, update directly
        await this.updateRequestFromEndpoint(existingRequest, change)
        result.updatedRequests++
      }
    } catch (error) {
      result.errors.push(`Failed to modify endpoint ${change.path}: ${error}`)
    }
  }

  /**
   * Handle removed endpoints
   */
  private async handleRemovedEndpoint(
    collection: LiveSyncCollection,
    collectionIndex: number,
    change: EndpointChange,
    options: UpdateOptions,
    result: CollectionUpdateResult
  ): Promise<void> {
    try {
      const existingRequest = this.findRequestInCollection(
        collection,
        change.path,
        change.method
      )

      if (!existingRequest) {
        console.log(`Request not found for removal: ${change.path}`)
        return
      }

      // Check if user has customized this request
      const hasUserCustomizations = this.hasUserCustomizations(existingRequest)

      if (hasUserCustomizations && options.preserveUserCustomizations) {
        // Don't remove user-customized requests, just mark as deprecated
        await this.markRequestAsDeprecated(existingRequest)

        result.conflicts.push({
          requestPath: change.path,
          conflictType: "user-modified",
          userValue: existingRequest,
          codeValue: null,
          resolution: "user-wins",
        })
      } else {
        // Safe to remove - find the request index
        const requestIndex = collection.requests.findIndex(
          (req) => req.id === existingRequest.id
        )
        if (requestIndex >= 0) {
          const collectionPath = collectionIndex.toString()
          removeRESTRequest(collectionPath, requestIndex, existingRequest.id)
        }
        result.removedRequests++
      }
    } catch (error) {
      result.errors.push(`Failed to remove endpoint ${change.path}: ${error}`)
    }
  }

  /**
   * Handle update conflicts
   */
  private async handleUpdateConflict(
    collection: LiveSyncCollection,
    existingRequest: HoppRESTRequest,
    change: EndpointChange,
    resolution: "user-wins" | "code-wins" | "prompt"
  ): Promise<ConflictInfo | null> {
    const conflict: ConflictInfo = {
      requestPath: change.path,
      conflictType: "both-modified",
      userValue: existingRequest,
      codeValue: change,
    }

    switch (resolution) {
      case "user-wins":
        // Keep user version, don't update
        conflict.resolution = "user-wins"
        return conflict

      case "code-wins":
        // Update with API version
        await this.updateRequestFromEndpoint(existingRequest, change)
        conflict.resolution = "code-wins"
        return conflict

      case "prompt":
        // Show conflict resolution dialog (would be handled by UI)
        return conflict

      default:
        return conflict
    }
  }

  /**
   * Create a new request from endpoint change info
   */
  private createRequestFromEndpoint(change: EndpointChange): HoppRESTRequest {
    return makeRESTRequest({
      name: change.summary || `${change.method} ${change.path}`,
      method: change.method as any,
      endpoint: change.path,
      params:
        change.newEndpoint?.parameters?.map((p: any) => ({
          key: p.name,
          value: "",
          active: p.required,
          description: "",
        })) || [],
      headers: [],
      preRequestScript: "",
      testScript: "",
      auth: { authType: "none", authActive: true },
      body: { contentType: null, body: null },
      responses: {},
      requestVariables: [],
    })
  }

  /**
   * Update existing request from endpoint change
   */
  private async updateRequestFromEndpoint(
    request: HoppRESTRequest,
    change: EndpointChange
  ): Promise<void> {
    // Update basic info
    if (change.summary && !this.isUserCustomized(request, "name")) {
      request.name = change.summary
    }

    // Update parameters if not user-customized
    if (
      change.newEndpoint?.parameters &&
      !this.isUserCustomized(request, "params")
    ) {
      request.params = change.newEndpoint.parameters.map((p) => ({
        key: p.name,
        value:
          request.params.find((existing) => existing.key === p.name)?.value ||
          "",
        active: p.required,
        description: "",
      }))
    }

    // Update method if changed
    if (
      change.method !== request.method &&
      !this.isUserCustomized(request, "method")
    ) {
      request.method = change.method as any
    }

    // Update endpoint path if changed
    if (
      change.path !== request.endpoint &&
      !this.isUserCustomized(request, "endpoint")
    ) {
      request.endpoint = change.path
    }
  }

  /**
   * Find request in collection by path and method
   */
  private findRequestInCollection(
    collection: LiveSyncCollection,
    path: string,
    method: string
  ): HoppRESTRequest | null {
    // This is a simplified search - in reality, you'd need to traverse the collection tree
    const allRequests = this.getAllRequestsFromCollection(collection)
    return (
      allRequests.find(
        (req) =>
          req.endpoint === path &&
          req.method.toLowerCase() === method.toLowerCase()
      ) || null
    )
  }

  /**
   * Get all requests from collection (flattened)
   */
  private getAllRequestsFromCollection(
    collection: LiveSyncCollection
  ): HoppRESTRequest[] {
    const requests: HoppRESTRequest[] = []

    // Add direct requests
    requests.push(
      ...((collection.requests as unknown as HoppRESTRequest[]) || [])
    )

    // Add requests from folders (recursive)
    for (const folder of collection.folders || []) {
      requests.push(...this.getAllRequestsFromFolder(folder))
    }

    return requests
  }

  /**
   * Get all requests from folder (recursive)
   */
  private getAllRequestsFromFolder(folder: any): HoppRESTRequest[] {
    const requests: HoppRESTRequest[] = []

    requests.push(...(folder.requests || []))

    for (const subfolder of folder.folders || []) {
      requests.push(...this.getAllRequestsFromFolder(subfolder))
    }

    return requests
  }

  /**
   * Track user customizations for a collection
   */
  private trackUserCustomizations(collection: LiveSyncCollection): void {
    const customizations: UserCustomization[] = []
    const allRequests = this.getAllRequestsFromCollection(collection)

    for (const request of allRequests) {
      const customization = this.extractUserCustomizations(request)
      if (customization) {
        customizations.push(customization)
      }
    }

    if (collection.id) {
      this.userCustomizations.set(collection.id, customizations)
    }
  }

  /**
   * Extract user customizations from a request
   */
  private extractUserCustomizations(
    request: HoppRESTRequest
  ): UserCustomization | null {
    const customizations: UserCustomization["customizations"] = {}
    let hasCustomizations = false

    // Check for custom headers
    if (request.headers.length > 0) {
      customizations.headers = request.headers.reduce(
        (acc, header) => {
          acc[header.key] = header.value
          return acc
        },
        {} as Record<string, string>
      )
      hasCustomizations = true
    }

    // Check for auth
    if (request.auth.authType !== "none") {
      customizations.auth = request.auth
      hasCustomizations = true
    }

    // Check for scripts
    if (request.preRequestScript) {
      customizations.preRequestScript = request.preRequestScript
      hasCustomizations = true
    }

    if (request.testScript) {
      customizations.testScript = request.testScript
      hasCustomizations = true
    }

    return hasCustomizations && request.id
      ? {
          requestId: request.id,
          path: request.endpoint,
          customizations,
        }
      : null
  }

  /**
   * Check if request has user customizations
   */
  private hasUserCustomizations(request: HoppRESTRequest): boolean {
    return !!(
      request.headers.length > 0 ||
      request.auth.authType !== "none" ||
      request.preRequestScript ||
      request.testScript
    )
  }

  /**
   * Check if specific field is user-customized
   */
  private isUserCustomized(request: HoppRESTRequest, field: string): boolean {
    // Simple heuristic - in a full implementation, you'd track this more precisely
    switch (field) {
      case "name":
        return (
          !request.name.includes(request.method) ||
          !request.name.includes(request.endpoint)
        )
      case "params":
        return request.params.some((p) => p.value !== "")
      case "headers":
        return request.headers.length > 0
      case "auth":
        return request.auth.authType !== "none"
      default:
        return false
    }
  }

  /**
   * Mark request as deprecated instead of removing
   */
  private async markRequestAsDeprecated(
    request: HoppRESTRequest
  ): Promise<void> {
    request.name = `[DEPRECATED] ${request.name}`
    // Could also add a header or modify description
  }

  /**
   * Backup collection before update
   */
  private async backupCollection(
    collection: LiveSyncCollection
  ): Promise<void> {
    // In a full implementation, you'd save the collection state
    console.log(`Backing up collection: ${collection.name}`)
  }

  /**
   * Generate hash for spec diff
   */
  private generateSpecHash(specDiff: SpecDiff): string {
    const str = JSON.stringify(specDiff)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return hash.toString(16)
  }

  /**
   * Show update notification
   */
  private showUpdateNotification(
    collection: LiveSyncCollection,
    result: CollectionUpdateResult
  ): void {
    if (result.success && result.conflicts.length === 0) {
      changeNotificationService.showToast({
        type: "success",
        title: "Collection Updated",
        message: `${collection.name}: ${result.addedRequests} added, ${result.updatedRequests} updated, ${result.removedRequests} removed`,
        duration: 5000,
      })
    } else if (result.conflicts.length > 0) {
      changeNotificationService.showToast({
        type: "warning",
        title: "Update with Conflicts",
        message: `${collection.name} updated with ${result.conflicts.length} conflicts requiring attention`,
        duration: 8000,
        actions: [
          {
            label: "Review Conflicts",
            action: () =>
              this.showConflictResolutionDialog(collection, result.conflicts),
          },
        ],
      })
    } else {
      changeNotificationService.showToast({
        type: "error",
        title: "Update Failed",
        message: `Failed to update ${collection.name}: ${result.errors.join(", ")}`,
        duration: 8000,
      })
    }
  }

  /**
   * Show conflict resolution dialog
   */
  private showConflictResolutionDialog(
    collection: LiveSyncCollection,
    conflicts: ConflictInfo[]
  ): void {
    // This would trigger the ConflictResolutionDialog component
    console.log(
      "Showing conflict resolution dialog for:",
      collection.name,
      conflicts
    )
  }
}

// Export singleton instance
export const smartCollectionUpdaterService = new SmartCollectionUpdaterService()
