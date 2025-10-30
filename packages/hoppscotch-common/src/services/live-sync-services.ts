/**
 * Live Sync Services Registration
 *
 * This file registers all Live Sync services with the global scope
 * so they can be accessed by the UI components
 */

// Import all Live Sync services
import { liveSyncOrchestratorService } from "./live-sync-orchestrator.service"
import { liveSyncManagerService } from "./live-sync-manager.service"
import { liveSyncPollingService } from "./live-sync-polling.service"
import { smartCollectionUpdaterService } from "./smart-collection-updater.service"

// Also import supporting services that Live Sync depends on
import { liveSpecSourceService } from "./live-spec-source.service"
import { syncEngineService } from "./sync-engine.service"
import { changeNotificationService } from "./change-notification.service"
import { performanceMonitorService } from "./performance-monitor.service"
import { errorRecoveryService } from "./error-recovery.service"

/**
 * Initialize and register Live Sync services globally
 * This makes them available to UI components and console debugging
 */
export function initializeLiveSyncServices() {
  console.log("Initializing Live Sync services...")

  // Register services in global scope for UI access
  if (typeof window !== "undefined") {
    // Main Live Sync services
    window.liveSyncOrchestratorService = liveSyncOrchestratorService
    window.liveSyncManagerService = liveSyncManagerService
    window.liveSyncPollingService = liveSyncPollingService
    window.smartCollectionUpdaterService = smartCollectionUpdaterService

    // Supporting services (if not already registered)
    if (!window.liveSpecSourceService) {
      window.liveSpecSourceService = liveSpecSourceService
    }
    if (!window.syncEngineService) {
      window.syncEngineService = syncEngineService
    }
    if (!window.changeNotificationService) {
      window.changeNotificationService = changeNotificationService
    }
    if (!window.performanceMonitorService) {
      window.performanceMonitorService = performanceMonitorService
    }
    if (!window.errorRecoveryService) {
      window.errorRecoveryService = errorRecoveryService
    }

    console.log("Live Sync services registered globally")

    // Log available services for debugging
    console.log("Available Live Sync services:", {
      orchestrator: !!window.liveSyncOrchestratorService,
      manager: !!window.liveSyncManagerService,
      polling: !!window.liveSyncPollingService,
      collectionUpdater: !!window.smartCollectionUpdaterService,
    })
  }
}

/**
 * Auto-initialize services when this module is imported
 */
initializeLiveSyncServices()

// Export services for direct import if needed
export {
  liveSyncOrchestratorService,
  liveSyncManagerService,
  liveSyncPollingService,
  smartCollectionUpdaterService,
  liveSpecSourceService,
  syncEngineService,
  changeNotificationService,
  performanceMonitorService,
  errorRecoveryService,
}

// Type declarations for global scope
declare global {
  interface Window {
    liveSyncOrchestratorService: typeof liveSyncOrchestratorService
    liveSyncManagerService: typeof liveSyncManagerService
    liveSyncPollingService: typeof liveSyncPollingService
    smartCollectionUpdaterService: typeof smartCollectionUpdaterService
    liveSpecSourceService?: typeof liveSpecSourceService
    syncEngineService?: typeof syncEngineService
    changeNotificationService?: typeof changeNotificationService
    performanceMonitorService?: typeof performanceMonitorService
    errorRecoveryService?: typeof errorRecoveryService
  }
}
