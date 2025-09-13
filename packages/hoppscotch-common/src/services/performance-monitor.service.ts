/**
 * Performance Monitor Service for Live Sync
 * Monitors and optimizes performance for development environments
 */

import { reactive } from "vue"
// import type { LiveSpecSource } from "../types/live-spec-source"

export interface PerformanceMetrics {
  sourceId: string
  timestamp: Date
  syncDuration: number
  specSize: number
  endpointCount: number
  memoryUsage: number
  cpuUsage?: number
  networkLatency: number
  cacheHitRate: number
}

export interface PerformanceAlert {
  id: string
  type: "memory" | "sync_slow" | "large_spec" | "high_frequency"
  severity: "low" | "medium" | "high"
  message: string
  sourceId: string
  timestamp: Date
  suggestion: string
}

export interface OptimizationConfig {
  enableContentHashing: boolean
  enableMemoryMonitoring: boolean
  enablePerformanceAlerts: boolean
  maxMemoryUsage: number // MB
  maxSyncDuration: number // ms
  maxSpecSize: number // bytes
  debounceThreshold: number // ms
  cacheEnabled: boolean
  cacheTTL: number // ms
}

class PerformanceMonitorService {
  private metrics = reactive<Map<string, PerformanceMetrics[]>>(new Map())
  private alerts = reactive<PerformanceAlert[]>([])
  private specCache = reactive<
    Map<string, { hash: string; spec: any; timestamp: Date }>
  >(new Map())
  private config = reactive<OptimizationConfig>({
    enableContentHashing: true,
    enableMemoryMonitoring: true,
    enablePerformanceAlerts: true,
    maxMemoryUsage: 500, // 500MB
    maxSyncDuration: 5000, // 5 seconds
    maxSpecSize: 10 * 1024 * 1024, // 10MB
    debounceThreshold: 1000, // 1 second
    cacheEnabled: true,
    cacheTTL: 5 * 60 * 1000, // 5 minutes
  })

  private syncTimers = new Map<
    string,
    { start: number; debounceTimer?: NodeJS.Timeout }
  >()
  private memoryMonitorInterval?: NodeJS.Timeout

  constructor() {
    this.startMemoryMonitoring()
  }

  /**
   * Start performance monitoring for a sync operation
   */
  startSyncMeasurement(sourceId: string): void {
    this.syncTimers.set(sourceId, { start: performance.now() })
  }

  /**
   * End performance monitoring and record metrics
   */
  endSyncMeasurement(
    sourceId: string,
    spec: any,
    _success: boolean = true
  ): PerformanceMetrics | null {
    const timer = this.syncTimers.get(sourceId)
    if (!timer) return null

    const syncDuration = performance.now() - timer.start
    const specSize = this.calculateSpecSize(spec)
    const endpointCount = this.countEndpoints(spec)
    const memoryUsage = this.getCurrentMemoryUsage()
    const networkLatency = this.estimateNetworkLatency(syncDuration, specSize)
    const cacheHitRate = this.calculateCacheHitRate(sourceId)

    const metrics: PerformanceMetrics = {
      sourceId,
      timestamp: new Date(),
      syncDuration,
      specSize,
      endpointCount,
      memoryUsage,
      networkLatency,
      cacheHitRate,
    }

    this.recordMetrics(metrics)
    this.checkPerformanceAlerts(metrics)
    this.syncTimers.delete(sourceId)

    return metrics
  }

  /**
   * Check if spec content has changed using hash comparison
   */
  hasSpecChanged(sourceId: string, newSpec: any): boolean {
    if (!this.config.enableContentHashing) return true

    const newHash = this.calculateSpecHash(newSpec)
    const cached = this.specCache.get(sourceId)

    if (!cached) {
      this.specCache.set(sourceId, {
        hash: newHash,
        spec: newSpec,
        timestamp: new Date(),
      })
      return true
    }

    // Check if cache is still valid
    const cacheAge = Date.now() - cached.timestamp.getTime()
    if (cacheAge > this.config.cacheTTL) {
      this.specCache.delete(sourceId)
      return true
    }

    const hasChanged = cached.hash !== newHash
    if (hasChanged) {
      this.specCache.set(sourceId, {
        hash: newHash,
        spec: newSpec,
        timestamp: new Date(),
      })
    }

    return hasChanged
  }

  /**
   * Get cached spec if available and valid
   */
  getCachedSpec(sourceId: string): any | null {
    if (!this.config.cacheEnabled) return null

    const cached = this.specCache.get(sourceId)
    if (!cached) return null

    const cacheAge = Date.now() - cached.timestamp.getTime()
    if (cacheAge > this.config.cacheTTL) {
      this.specCache.delete(sourceId)
      return null
    }

    return cached.spec
  }

  /**
   * Optimize sync frequency with intelligent debouncing
   */
  shouldSkipSync(sourceId: string): boolean {
    const timer = this.syncTimers.get(sourceId)
    if (!timer) return false

    const timeSinceLastSync = performance.now() - timer.start
    return timeSinceLastSync < this.config.debounceThreshold
  }

  /**
   * Get performance metrics for a source
   */
  getMetrics(sourceId: string, limit: number = 50): PerformanceMetrics[] {
    const metrics = this.metrics.get(sourceId) || []
    return metrics.slice(0, limit)
  }

  /**
   * Get performance summary for a source
   */
  getPerformanceSummary(sourceId: string): {
    averageSyncTime: number
    averageSpecSize: number
    totalSyncs: number
    cacheHitRate: number
    memoryTrend: "stable" | "increasing" | "decreasing"
  } {
    const metrics = this.metrics.get(sourceId) || []

    if (metrics.length === 0) {
      return {
        averageSyncTime: 0,
        averageSpecSize: 0,
        totalSyncs: 0,
        cacheHitRate: 0,
        memoryTrend: "stable",
      }
    }

    const averageSyncTime =
      metrics.reduce((sum, m) => sum + m.syncDuration, 0) / metrics.length
    const averageSpecSize =
      metrics.reduce((sum, m) => sum + m.specSize, 0) / metrics.length
    const averageCacheHitRate =
      metrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / metrics.length

    // Calculate memory trend
    const recentMetrics = metrics.slice(0, 10)
    const olderMetrics = metrics.slice(10, 20)

    let memoryTrend: "stable" | "increasing" | "decreasing" = "stable"
    if (recentMetrics.length > 0 && olderMetrics.length > 0) {
      const recentAvg =
        recentMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) /
        recentMetrics.length
      const olderAvg =
        olderMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) /
        olderMetrics.length

      const difference = recentAvg - olderAvg
      if (difference > 50) memoryTrend = "increasing"
      else if (difference < -50) memoryTrend = "decreasing"
    }

    return {
      averageSyncTime,
      averageSpecSize,
      totalSyncs: metrics.length,
      cacheHitRate: averageCacheHitRate,
      memoryTrend,
    }
  }

  /**
   * Get active performance alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    // Filter alerts from last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    return this.alerts.filter((alert) => alert.timestamp > oneHourAgo)
  }

  /**
   * Clear performance data for a source
   */
  clearMetrics(sourceId: string): void {
    this.metrics.delete(sourceId)
    this.specCache.delete(sourceId)
    this.alerts = this.alerts.filter((alert) => alert.sourceId !== sourceId)
  }

  /**
   * Update performance configuration
   */
  updateConfig(newConfig: Partial<OptimizationConfig>): void {
    Object.assign(this.config, newConfig)

    if (!newConfig.enableMemoryMonitoring && this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval)
      this.memoryMonitorInterval = undefined
    } else if (
      newConfig.enableMemoryMonitoring &&
      !this.memoryMonitorInterval
    ) {
      this.startMemoryMonitoring()
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): OptimizationConfig {
    return { ...this.config }
  }

  /**
   * Force garbage collection and cache cleanup
   */
  performCleanup(): void {
    // Clear old cache entries
    const now = Date.now()
    for (const [sourceId, cached] of this.specCache.entries()) {
      const age = now - cached.timestamp.getTime()
      if (age > this.config.cacheTTL) {
        this.specCache.delete(sourceId)
      }
    }

    // Clear old metrics (keep last 100 per source)
    for (const [sourceId, metrics] of this.metrics.entries()) {
      if (metrics.length > 100) {
        this.metrics.set(sourceId, metrics.slice(0, 100))
      }
    }

    // Clear old alerts
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    this.alerts = this.alerts.filter((alert) => alert.timestamp > oneHourAgo)

    // Suggest garbage collection if available
    if (typeof window !== "undefined" && "gc" in window) {
      try {
        ;(window as any).gc()
      } catch {
        // Ignore if GC is not available
      }
    }
  }

  // Private methods
  private recordMetrics(metrics: PerformanceMetrics): void {
    const sourceMetrics = this.metrics.get(metrics.sourceId) || []
    sourceMetrics.unshift(metrics)

    // Limit metrics history
    if (sourceMetrics.length > 200) {
      sourceMetrics.splice(200)
    }

    this.metrics.set(metrics.sourceId, sourceMetrics)
  }

  private checkPerformanceAlerts(metrics: PerformanceMetrics): void {
    if (!this.config.enablePerformanceAlerts) return

    // Check sync duration
    if (metrics.syncDuration > this.config.maxSyncDuration) {
      this.addAlert({
        type: "sync_slow",
        severity:
          metrics.syncDuration > this.config.maxSyncDuration * 2
            ? "high"
            : "medium",
        message: `Sync took ${Math.round(metrics.syncDuration)}ms`,
        sourceId: metrics.sourceId,
        suggestion: "Consider enabling content hashing or reducing spec size",
      })
    }

    // Check spec size
    if (metrics.specSize > this.config.maxSpecSize) {
      this.addAlert({
        type: "large_spec",
        severity: "medium",
        message: `Large spec detected: ${this.formatBytes(metrics.specSize)}`,
        sourceId: metrics.sourceId,
        suggestion: "Consider using selective sync to reduce payload size",
      })
    }

    // Check memory usage
    if (metrics.memoryUsage > this.config.maxMemoryUsage) {
      this.addAlert({
        type: "memory",
        severity:
          metrics.memoryUsage > this.config.maxMemoryUsage * 1.5
            ? "high"
            : "medium",
        message: `High memory usage: ${Math.round(metrics.memoryUsage)}MB`,
        sourceId: metrics.sourceId,
        suggestion: "Consider clearing cache or reducing sync frequency",
      })
    }

    // Check sync frequency
    const recentSyncs = this.getMetrics(metrics.sourceId, 10)
    if (recentSyncs.length >= 10) {
      const timeSpan =
        recentSyncs[0].timestamp.getTime() - recentSyncs[9].timestamp.getTime()
      const frequency = 10 / (timeSpan / 1000) // syncs per second

      if (frequency > 0.5) {
        // More than 1 sync per 2 seconds
        this.addAlert({
          type: "high_frequency",
          severity: "medium",
          message: `High sync frequency detected: ${frequency.toFixed(2)} syncs/sec`,
          sourceId: metrics.sourceId,
          suggestion: "Increase debounce threshold to reduce sync frequency",
        })
      }
    }
  }

  private addAlert(alert: Omit<PerformanceAlert, "id" | "timestamp">): void {
    const newAlert: PerformanceAlert = {
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      timestamp: new Date(),
    }

    this.alerts.unshift(newAlert)

    // Limit alerts
    if (this.alerts.length > 100) {
      this.alerts.splice(100)
    }
  }

  private calculateSpecHash(spec: any): string {
    // Simple hash function for spec content
    const str = JSON.stringify(spec, Object.keys(spec).sort())
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(36)
  }

  private calculateSpecSize(spec: any): number {
    return new Blob([JSON.stringify(spec)]).size
  }

  private countEndpoints(spec: any): number {
    if (!spec?.paths) return 0

    let count = 0
    for (const path in spec.paths) {
      for (const method in spec.paths[path]) {
        if (
          ["get", "post", "put", "patch", "delete", "options", "head"].includes(
            method
          )
        ) {
          count++
        }
      }
    }
    return count
  }

  private getCurrentMemoryUsage(): number {
    if (typeof performance !== "undefined" && "memory" in performance) {
      const memory = (performance as any).memory
      return memory.usedJSHeapSize / (1024 * 1024) // Convert to MB
    }
    return 0
  }

  private estimateNetworkLatency(
    syncDuration: number,
    _specSize: number
  ): number {
    // Rough estimation: assume processing takes 100ms, rest is network
    const processingTime = Math.min(100, syncDuration * 0.1)
    return Math.max(0, syncDuration - processingTime)
  }

  private calculateCacheHitRate(sourceId: string): number {
    const cached = this.specCache.get(sourceId)
    return cached ? 1.0 : 0.0
  }

  private startMemoryMonitoring(): void {
    if (!this.config.enableMemoryMonitoring) return

    this.memoryMonitorInterval = setInterval(() => {
      const memoryUsage = this.getCurrentMemoryUsage()

      if (memoryUsage > this.config.maxMemoryUsage * 0.8) {
        // Proactively clean up when approaching memory limit
        this.performCleanup()
      }
    }, 30000) // Check every 30 seconds
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes"

    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }
}

// Export singleton instance
export const performanceMonitorService = new PerformanceMonitorService()
export default performanceMonitorService
