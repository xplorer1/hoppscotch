/**
 * Error Recovery Service for Live Sync
 * Handles graceful degradation and intelligent error recovery
 */

import { reactive } from "vue"
import type { LiveSpecSource } from "../types/live-spec-source"
import { frameworkOptimizationService } from "./framework-optimization.service"
import { changeNotificationService } from "./change-notification.service"

export interface ErrorContext {
  sourceId: string
  errorType: string
  errorMessage: string
  timestamp: Date
  retryCount: number
  lastRetryAt?: Date
  isRecoverable: boolean
  suggestedActions: string[]
}

export interface RecoveryStrategy {
  id: string
  name: string
  description: string
  canRecover: (error: ErrorContext) => boolean
  recover: (source: LiveSpecSource, error: ErrorContext) => Promise<boolean>
  priority: number
}

export interface ErrorHandlingConfig {
  maxRetries: number
  retryDelay: number
  exponentialBackoff: boolean
  gracefulDegradation: boolean
  autoRecovery: boolean
  notificationLevel: "all" | "errors-only" | "silent"
}

class ErrorRecoveryService {
  private errorHistory = reactive<Map<string, ErrorContext[]>>(new Map())
  private recoveryStrategies = reactive<RecoveryStrategy[]>([])
  private config = reactive<ErrorHandlingConfig>({
    maxRetries: 3,
    retryDelay: 5000,
    exponentialBackoff: true,
    gracefulDegradation: true,
    autoRecovery: true,
    notificationLevel: "all",
  })

  private retryTimers = new Map<string, NodeJS.Timeout>()

  constructor() {
    this.initializeRecoveryStrategies()
  }

  /**
   * Handle an error with intelligent recovery
   */
  async handleError(
    source: LiveSpecSource,
    error: Error | string,
    errorType: string = "unknown"
  ): Promise<boolean> {
    const errorMessage = error instanceof Error ? error.message : error
    const errorContext: ErrorContext = {
      sourceId: source.id,
      errorType,
      errorMessage,
      timestamp: new Date(),
      retryCount: this.getRetryCount(source.id, errorType),
      isRecoverable: this.isRecoverableError(errorType, errorMessage),
      suggestedActions: this.getSuggestedActions(
        source,
        errorType,
        errorMessage
      ),
    }

    // Add to error history
    this.addToErrorHistory(errorContext)

    // Try automatic recovery if enabled
    if (this.config.autoRecovery && errorContext.isRecoverable) {
      const recovered = await this.attemptRecovery(source, errorContext)
      if (recovered) {
        this.showRecoveryNotification(source, errorContext, true)
        return true
      }
    }

    // Show error notification with recovery options
    this.showErrorNotification(source, errorContext)

    // Schedule retry if within limits
    if (
      errorContext.retryCount < this.config.maxRetries &&
      errorContext.isRecoverable
    ) {
      this.scheduleRetry(source, errorContext)
    } else if (this.config.gracefulDegradation) {
      this.enableGracefulDegradation(source, errorContext)
    }

    return false
  }

  /**
   * Manually trigger recovery for a specific error
   */
  async triggerManualRecovery(
    source: LiveSpecSource,
    errorContext: ErrorContext
  ): Promise<boolean> {
    const recovered = await this.attemptRecovery(source, errorContext)

    if (recovered) {
      this.showRecoveryNotification(source, errorContext, true)
      this.clearErrorHistory(source.id, errorContext.errorType)
    } else {
      this.showRecoveryNotification(source, errorContext, false)
    }

    return recovered
  }

  /**
   * Get error history for a source
   */
  getErrorHistory(sourceId: string): ErrorContext[] {
    return this.errorHistory.get(sourceId) || []
  }

  /**
   * Clear error history for a source
   */
  clearErrorHistory(sourceId: string, errorType?: string): void {
    if (errorType) {
      const history = this.errorHistory.get(sourceId) || []
      const filtered = history.filter((e) => e.errorType !== errorType)
      this.errorHistory.set(sourceId, filtered)
    } else {
      this.errorHistory.delete(sourceId)
    }
  }

  /**
   * Update error handling configuration
   */
  updateConfig(newConfig: Partial<ErrorHandlingConfig>): void {
    Object.assign(this.config, newConfig)
  }

  /**
   * Get current configuration
   */
  getConfig(): ErrorHandlingConfig {
    return { ...this.config }
  }

  // Private methods
  private initializeRecoveryStrategies(): void {
    // Connection retry strategy
    this.recoveryStrategies.push({
      id: "connection_retry",
      name: "Connection Retry",
      description: "Retry connection with exponential backoff",
      priority: 1,
      canRecover: (error) =>
        error.errorType === "connection_failed" ||
        error.errorMessage.includes("ECONNREFUSED") ||
        error.errorMessage.includes("fetch failed"),
      recover: async (source) => {
        try {
          const response = await fetch(source.url || "", { method: "HEAD" })
          return response.ok
        } catch {
          return false
        }
      },
    })

    // Port scanning strategy
    this.recoveryStrategies.push({
      id: "port_scan",
      name: "Port Scanning",
      description: "Try common ports for the framework",
      priority: 2,
      canRecover: (error) =>
        error.errorType === "connection_failed" &&
        error.errorMessage.includes("ECONNREFUSED"),
      recover: async (
        source,
        _error // eslint-disable-line @typescript-eslint/no-unused-vars
      ) => {
        const framework = source.framework
        if (!framework || !source.url) return false

        const config =
          frameworkOptimizationService.getFrameworkConfig(framework)
        if (!config) return false

        for (const port of config.commonPorts) {
          try {
            const testUrl = source.url.replace(/:\d+/, `:${port}`)
            const response = await fetch(testUrl, { method: "HEAD" })
            if (response.ok) {
              // Suggest URL update
              changeNotificationService.showToast({
                type: "info",
                title: "Alternative Port Found",
                message: `Found server on port ${port}. Update your source URL?`,
                actions: [
                  {
                    label: "Update URL",
                    action: () => this.suggestUrlUpdate(source.id, testUrl),
                  },
                ],
              })
              return true
            }
          } catch {
            continue
          }
        }
        return false
      },
    })

    // CORS fix strategy
    this.recoveryStrategies.push({
      id: "cors_guidance",
      name: "CORS Configuration",
      description: "Provide CORS setup guidance",
      priority: 3,
      canRecover: (error) =>
        error.errorMessage.includes("CORS") ||
        error.errorMessage.includes("Access-Control-Allow-Origin"),
      recover: async (
        source,
        _error // eslint-disable-line @typescript-eslint/no-unused-vars
      ) => {
        const framework = source.framework
        if (!framework) return false

        const corsMessage =
          frameworkOptimizationService.getFrameworkErrorMessage(
            framework,
            "cors_error"
          )

        changeNotificationService.showToast({
          type: "warning",
          title: "CORS Configuration Needed",
          message: corsMessage,
          duration: 10000,
          actions: [
            {
              label: "View Setup Guide",
              action: () => this.showSetupGuide(framework),
            },
          ],
        })

        return false // CORS requires manual fix
      },
    })

    // Endpoint discovery strategy
    this.recoveryStrategies.push({
      id: "endpoint_discovery",
      name: "Endpoint Discovery",
      description: "Try alternative OpenAPI endpoints",
      priority: 4,
      canRecover: (error) =>
        error.errorType === "spec_not_found" ||
        error.errorMessage.includes("404"),
      recover: async (
        source,
        _error // eslint-disable-line @typescript-eslint/no-unused-vars
      ) => {
        if (!source.url) return false

        const framework = source.framework
        const config = frameworkOptimizationService.getFrameworkConfig(
          framework || "fastapi"
        )
        const endpoints = config?.defaultEndpoints || [
          "/openapi.json",
          "/api-docs",
        ]

        const baseUrl = source.url.replace(/\/[^\/]*$/, "")

        for (const endpoint of endpoints) {
          try {
            const testUrl = baseUrl + endpoint
            const response = await fetch(testUrl)
            if (response.ok) {
              const spec = await response.json()
              if (spec.openapi || spec.swagger) {
                changeNotificationService.showToast({
                  type: "success",
                  title: "OpenAPI Spec Found",
                  message: `Found spec at ${endpoint}. Update your source URL?`,
                  actions: [
                    {
                      label: "Update URL",
                      action: () => this.suggestUrlUpdate(source.id, testUrl),
                    },
                  ],
                })
                return true
              }
            }
          } catch {
            continue
          }
        }
        return false
      },
    })
  }

  private async attemptRecovery(
    source: LiveSpecSource,
    error: ErrorContext
  ): Promise<boolean> {
    // Sort strategies by priority
    const applicableStrategies = this.recoveryStrategies
      .filter((strategy) => strategy.canRecover(error))
      .sort((a, b) => a.priority - b.priority)

    for (const strategy of applicableStrategies) {
      try {
        const recovered = await strategy.recover(source, error)
        if (recovered) {
          console.log(`Recovery successful using strategy: ${strategy.name}`)
          return true
        }
      } catch (recoveryError) {
        console.warn(
          `Recovery strategy ${strategy.name} failed:`,
          recoveryError
        )
      }
    }

    return false
  }

  private isRecoverableError(errorType: string, errorMessage: string): boolean {
    const recoverableTypes = [
      "connection_failed",
      "timeout",
      "spec_not_found",
      "cors_error",
      "network_error",
    ]

    const unrecoverablePatterns = [
      "authentication failed",
      "permission denied",
      "invalid credentials",
      "malformed spec",
    ]

    if (recoverableTypes.includes(errorType)) {
      return !unrecoverablePatterns.some((pattern) =>
        errorMessage.toLowerCase().includes(pattern)
      )
    }

    return false
  }

  // eslint-disable @typescript-eslint/no-unused-vars
  private getSuggestedActions(
    source: LiveSpecSource,
    errorType: string,
    _errorMessage: string // eslint-disable-line @typescript-eslint/no-unused-vars
  ): string[] {
    // eslint-enable @typescript-eslint/no-unused-vars
    const actions: string[] = []

    switch (errorType) {
      case "connection_failed":
        actions.push("Check if your development server is running")
        actions.push("Verify the URL is correct")
        actions.push("Try common ports for your framework")
        break

      case "cors_error":
        actions.push("Configure CORS in your development server")
        actions.push("Add Hoppscotch origin to allowed origins")
        break

      case "spec_not_found":
        actions.push("Check if OpenAPI documentation is enabled")
        actions.push("Try alternative endpoints (/api-docs, /swagger.json)")
        break

      case "timeout":
        actions.push("Check server performance")
        actions.push("Increase timeout settings")
        break

      default:
        actions.push("Check server logs for more details")
        actions.push("Verify server configuration")
    }

    // Add framework-specific suggestions
    if (source.framework) {
      const frameworkMessage =
        frameworkOptimizationService.getFrameworkErrorMessage(
          source.framework,
          errorType
        )
      if (frameworkMessage !== `An error occurred during sync.`) {
        actions.push(frameworkMessage)
      }
    }

    return actions
  }

  private getRetryCount(sourceId: string, errorType: string): number {
    const history = this.errorHistory.get(sourceId) || []
    return history.filter((e) => e.errorType === errorType).length
  }

  private addToErrorHistory(error: ErrorContext): void {
    const history = this.errorHistory.get(error.sourceId) || []
    history.unshift(error)

    // Limit history size
    if (history.length > 50) {
      history.splice(50)
    }

    this.errorHistory.set(error.sourceId, history)
  }

  private scheduleRetry(source: LiveSpecSource, error: ErrorContext): void {
    // Clear existing timer
    const existingTimer = this.retryTimers.get(source.id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Calculate delay with exponential backoff
    let delay = this.config.retryDelay
    if (this.config.exponentialBackoff) {
      delay = delay * Math.pow(2, error.retryCount)
    }

    const timer = setTimeout(async () => {
      console.log(
        `Retrying sync for source ${source.id} (attempt ${error.retryCount + 1})`
      )

      // This would trigger a new sync attempt
      // Implementation depends on integration with sync engine

      this.retryTimers.delete(source.id)
    }, delay)

    this.retryTimers.set(source.id, timer)
  }

  private enableGracefulDegradation(
    source: LiveSpecSource,
    _error: ErrorContext // eslint-disable-line @typescript-eslint/no-unused-vars
  ): void {
    changeNotificationService.showToast({
      type: "warning",
      title: "Live Sync Degraded",
      message: `Switching to manual sync mode for ${source.name}`,
      actions: [
        {
          label: "Manual Sync",
          action: () => this.triggerManualSync(source.id),
        },
        {
          label: "Retry Setup",
          action: () => this.retrySetup(source.id),
        },
      ],
    })
  }

  private showErrorNotification(
    source: LiveSpecSource,
    error: ErrorContext
  ): void {
    if (this.config.notificationLevel === "silent") return

    const actions = error.suggestedActions.slice(0, 2).map((action) => ({
      label: action.length > 30 ? action.substring(0, 27) + "..." : action,
      action: () => this.showErrorDetails(source, error),
    }))

    actions.push({
      label: "Retry Now",
      action: () => this.triggerManualRecovery(source, error),
    })

    changeNotificationService.showToast({
      type: "error",
      title: `Sync Error: ${source.name}`,
      message: error.errorMessage,
      duration: 8000,
      actions,
    })
  }

  private showRecoveryNotification(
    source: LiveSpecSource,
    error: ErrorContext,
    success: boolean
  ): void {
    changeNotificationService.showToast({
      type: success ? "success" : "error",
      title: success ? "Recovery Successful" : "Recovery Failed",
      message: success
        ? `${source.name} is back online`
        : `Could not recover ${source.name}`,
    })
  }

  private suggestUrlUpdate(sourceId: string, newUrl: string): void {
    // This would integrate with the source management system
    console.log(`Suggesting URL update for ${sourceId}: ${newUrl}`)
  }

  private showSetupGuide(framework: string): void {
    // This would open the setup guide for the framework
    console.log(`Showing setup guide for ${framework}`)
  }

  private showErrorDetails(source: LiveSpecSource, error: ErrorContext): void {
    // This would open a detailed error dialog
    console.log(`Showing error details for ${source.name}:`, error)
  }

  private triggerManualSync(sourceId: string): void {
    // This would trigger a manual sync
    console.log(`Triggering manual sync for ${sourceId}`)
  }

  private retrySetup(sourceId: string): void {
    // This would reopen the setup wizard
    console.log(`Retrying setup for ${sourceId}`)
  }

  /**
   * Handle sync-specific errors (used by polling service)
   */
  handleSyncError(
    sourceId: string,
    errorInfo: {
      type: string
      message: string
      timestamp: Date
      retryCount: number
    }
  ): void {
    console.log(`Sync error for ${sourceId}:`, errorInfo)

    // Record the error
    const errorContext: ErrorContext = {
      sourceId,
      errorType: errorInfo.type,
      errorMessage: errorInfo.message,
      timestamp: errorInfo.timestamp,
      retryCount: errorInfo.retryCount,
      isRecoverable: this.isRecoverableError(errorInfo.type, errorInfo.message),
      suggestedActions: [],
    }

    // Record error in internal tracking (if needed for future analysis)
    // Note: recordError method not yet implemented
    void errorContext

    // If too many retries, suggest recovery actions
    if (errorInfo.retryCount >= 3) {
      console.warn(
        `Multiple sync errors for ${sourceId}, consider checking source configuration`
      )
    }
  }
}

// Export singleton instance
export const errorRecoveryService = new ErrorRecoveryService()
export default errorRecoveryService
