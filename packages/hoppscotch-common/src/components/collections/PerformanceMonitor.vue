<template>
  <div class="performance-monitor">
    <div class="monitor-header">
      <h3>{{ t("collections.performance_monitor") }}</h3>
      <div class="header-actions">
        <button class="btn btn-ghost btn-sm" @click="refreshMetrics">
          <icon name="refresh-cw" />
          {{ t("action.refresh") }}
        </button>

        <button class="btn btn-ghost btn-sm" @click="performCleanup">
          <icon name="trash-2" />
          {{ t("collections.cleanup") }}
        </button>
      </div>
    </div>

    <div class="monitor-content">
      <!-- Performance Summary -->
      <div class="summary-section">
        <div class="summary-cards">
          <div class="summary-card">
            <div class="card-icon">
              <icon name="zap" class="text-blue-500" />
            </div>
            <div class="card-content">
              <span class="card-value">{{
                formatDuration(summary.averageSyncTime)
              }}</span>
              <span class="card-label">{{
                t("collections.avg_sync_time")
              }}</span>
            </div>
          </div>

          <div class="summary-card">
            <div class="card-icon">
              <icon name="database" class="text-green-500" />
            </div>
            <div class="card-content">
              <span class="card-value">{{
                formatBytes(summary.averageSpecSize)
              }}</span>
              <span class="card-label">{{
                t("collections.avg_spec_size")
              }}</span>
            </div>
          </div>

          <div class="summary-card">
            <div class="card-icon">
              <icon name="activity" class="text-purple-500" />
            </div>
            <div class="card-content">
              <span class="card-value">{{ summary.totalSyncs }}</span>
              <span class="card-label">{{ t("collections.total_syncs") }}</span>
            </div>
          </div>

          <div class="summary-card">
            <div class="card-icon">
              <icon
                name="cpu"
                :class="getMemoryTrendClass(summary.memoryTrend)"
              />
            </div>
            <div class="card-content">
              <span class="card-value"
                >{{ Math.round(summary.cacheHitRate * 100) }}%</span
              >
              <span class="card-label">{{
                t("collections.cache_hit_rate")
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance Alerts -->
      <div v-if="activeAlerts.length > 0" class="alerts-section">
        <h4>{{ t("collections.performance_alerts") }}</h4>
        <div class="alerts-list">
          <div
            v-for="alert in activeAlerts"
            :key="alert.id"
            class="alert-item"
            :class="`alert-${alert.severity}`"
          >
            <div class="alert-content">
              <div class="alert-header">
                <icon :name="getAlertIcon(alert.type)" />
                <span class="alert-title">{{ getAlertTitle(alert.type) }}</span>
                <span class="alert-severity">{{ alert.severity }}</span>
              </div>
              <div class="alert-message">{{ alert.message }}</div>
              <div class="alert-suggestion">
                <icon name="lightbulb" />
                <span>{{ alert.suggestion }}</span>
              </div>
            </div>
            <div class="alert-time">
              {{ formatRelativeTime(alert.timestamp) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Performance Chart -->
      <div class="chart-section">
        <h4>{{ t("collections.sync_performance") }}</h4>
        <div class="chart-container">
          <div class="chart-placeholder">
            <div class="chart-bars">
              <div
                v-for="(metric, index) in recentMetrics"
                :key="index"
                class="chart-bar"
                :style="{ height: getBarHeight(metric.syncDuration) + '%' }"
                :title="`${formatDuration(metric.syncDuration)} - ${formatRelativeTime(metric.timestamp)}`"
              ></div>
            </div>
            <div class="chart-labels">
              <span>{{ t("collections.sync_duration_trend") }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Detailed Metrics -->
      <div class="metrics-section">
        <div class="section-header">
          <h4>{{ t("collections.detailed_metrics") }}</h4>
          <div class="metrics-filters">
            <select v-model="metricsLimit" class="filter-select">
              <option value="10">{{ t("collections.last_10") }}</option>
              <option value="25">{{ t("collections.last_25") }}</option>
              <option value="50">{{ t("collections.last_50") }}</option>
            </select>
          </div>
        </div>

        <div class="metrics-table">
          <div class="table-header">
            <div class="table-cell">{{ t("collections.timestamp") }}</div>
            <div class="table-cell">{{ t("collections.sync_time") }}</div>
            <div class="table-cell">{{ t("collections.spec_size") }}</div>
            <div class="table-cell">{{ t("collections.endpoints") }}</div>
            <div class="table-cell">{{ t("collections.memory") }}</div>
            <div class="table-cell">{{ t("collections.cache") }}</div>
          </div>

          <div class="table-body">
            <div
              v-for="metric in displayedMetrics"
              :key="metric.timestamp.getTime()"
              class="table-row"
            >
              <div class="table-cell">
                {{ formatTime(metric.timestamp) }}
              </div>
              <div class="table-cell">
                <span :class="getSyncTimeClass(metric.syncDuration)">
                  {{ formatDuration(metric.syncDuration) }}
                </span>
              </div>
              <div class="table-cell">
                {{ formatBytes(metric.specSize) }}
              </div>
              <div class="table-cell">
                {{ metric.endpointCount }}
              </div>
              <div class="table-cell">
                <span :class="getMemoryClass(metric.memoryUsage)">
                  {{ Math.round(metric.memoryUsage) }}MB
                </span>
              </div>
              <div class="table-cell">
                <span :class="getCacheClass(metric.cacheHitRate)">
                  {{ Math.round(metric.cacheHitRate * 100) }}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Configuration -->
      <div class="config-section">
        <h4>{{ t("collections.performance_settings") }}</h4>
        <div class="config-grid">
          <div class="config-group">
            <label class="config-label">
              <input
                v-model="config.enableContentHashing"
                type="checkbox"
                @change="updateConfig"
              />
              <span>{{ t("collections.enable_content_hashing") }}</span>
            </label>
            <p class="config-description">
              {{ t("collections.content_hashing_description") }}
            </p>
          </div>

          <div class="config-group">
            <label class="config-label">
              <input
                v-model="config.enableMemoryMonitoring"
                type="checkbox"
                @change="updateConfig"
              />
              <span>{{ t("collections.enable_memory_monitoring") }}</span>
            </label>
            <p class="config-description">
              {{ t("collections.memory_monitoring_description") }}
            </p>
          </div>

          <div class="config-group">
            <label class="config-label">
              <input
                v-model="config.enablePerformanceAlerts"
                type="checkbox"
                @change="updateConfig"
              />
              <span>{{ t("collections.enable_performance_alerts") }}</span>
            </label>
            <p class="config-description">
              {{ t("collections.performance_alerts_description") }}
            </p>
          </div>

          <div class="config-group">
            <label class="config-label">{{
              t("collections.max_sync_duration")
            }}</label>
            <div class="config-input">
              <input
                v-model.number="config.maxSyncDuration"
                type="number"
                min="1000"
                max="30000"
                step="500"
                @change="updateConfig"
              />
              <span class="input-unit">ms</span>
            </div>
          </div>

          <div class="config-group">
            <label class="config-label">{{
              t("collections.max_memory_usage")
            }}</label>
            <div class="config-input">
              <input
                v-model.number="config.maxMemoryUsage"
                type="number"
                min="100"
                max="2000"
                step="50"
                @change="updateConfig"
              />
              <span class="input-unit">MB</span>
            </div>
          </div>

          <div class="config-group">
            <label class="config-label">{{ t("collections.cache_ttl") }}</label>
            <div class="config-input">
              <input
                v-model.number="cacheTTLMinutes"
                type="number"
                min="1"
                max="60"
                step="1"
                @change="updateCacheTTL"
              />
              <span class="input-unit">min</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import { useI18n } from "~/composables/i18n"
import { useToast } from "~/composables/toast"
import {
  performanceMonitorService,
  type PerformanceMetrics,
  type PerformanceAlert,
} from "../../services/performance-monitor.service"

interface Props {
  sourceId?: string // If provided, show metrics for specific source only
}

const props = defineProps<Props>()

const t = useI18n()
const toast = useToast()

// State
const metrics = ref<PerformanceMetrics[]>([])
const activeAlerts = ref<PerformanceAlert[]>([])
const metricsLimit = ref(25)
const config = ref(performanceMonitorService.getConfig())
const refreshInterval = ref<NodeJS.Timeout>()

// Computed
const summary = computed(() => {
  if (props.sourceId) {
    return performanceMonitorService.getPerformanceSummary(props.sourceId)
  }

  // Aggregate summary for all sources
  return {
    averageSyncTime:
      metrics.value.reduce((sum, m) => sum + m.syncDuration, 0) /
      (metrics.value.length || 1),
    averageSpecSize:
      metrics.value.reduce((sum, m) => sum + m.specSize, 0) /
      (metrics.value.length || 1),
    totalSyncs: metrics.value.length,
    cacheHitRate:
      metrics.value.reduce((sum, m) => sum + m.cacheHitRate, 0) /
      (metrics.value.length || 1),
    memoryTrend: "stable" as const,
  }
})

const recentMetrics = computed(() => {
  return metrics.value.slice(0, 20)
})

const displayedMetrics = computed(() => {
  return metrics.value.slice(0, metricsLimit.value)
})

const cacheTTLMinutes = computed({
  get: () => Math.round(config.value.cacheTTL / (60 * 1000)),
  set: (value: number) => {
    config.value.cacheTTL = value * 60 * 1000
  },
})

// Methods
function refreshMetrics() {
  if (props.sourceId) {
    metrics.value = performanceMonitorService.getMetrics(props.sourceId, 100)
  } else {
    // Get metrics from all sources (this would need integration with source service)
    metrics.value = []
  }

  activeAlerts.value = performanceMonitorService.getActiveAlerts()

  if (props.sourceId) {
    activeAlerts.value = activeAlerts.value.filter(
      (alert) => alert.sourceId === props.sourceId
    )
  }
}

function performCleanup() {
  performanceMonitorService.performCleanup()
  refreshMetrics()
  toast.success(t("collections.cleanup_completed"))
}

function updateConfig() {
  performanceMonitorService.updateConfig(config.value)
  toast.success(t("collections.settings_updated"))
}

function updateCacheTTL() {
  updateConfig()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"

  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return t("time.just_now")
  if (minutes < 60) return t("time.minutes_ago", { count: minutes })

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("time.hours_ago", { count: hours })

  const days = Math.floor(hours / 24)
  return t("time.days_ago", { count: days })
}

function getBarHeight(duration: number): number {
  const maxDuration = Math.max(
    ...recentMetrics.value.map((m) => m.syncDuration),
    1000
  )
  return (duration / maxDuration) * 100
}

function getMemoryTrendClass(trend: string): string {
  const classes = {
    stable: "text-green-500",
    increasing: "text-orange-500",
    decreasing: "text-blue-500",
  }
  return classes[trend] || "text-gray-500"
}

function getAlertIcon(type: string): string {
  const icons = {
    memory: "cpu",
    sync_slow: "clock",
    large_spec: "database",
    high_frequency: "zap",
  }
  return icons[type] || "alert-circle"
}

function getAlertTitle(type: string): string {
  const titles = {
    memory: t("collections.memory_alert"),
    sync_slow: t("collections.slow_sync_alert"),
    large_spec: t("collections.large_spec_alert"),
    high_frequency: t("collections.high_frequency_alert"),
  }
  return titles[type] || t("collections.performance_alert")
}

function getSyncTimeClass(duration: number): string {
  if (duration > config.value.maxSyncDuration) return "text-red-500"
  if (duration > config.value.maxSyncDuration * 0.7) return "text-orange-500"
  return "text-green-500"
}

function getMemoryClass(usage: number): string {
  if (usage > config.value.maxMemoryUsage) return "text-red-500"
  if (usage > config.value.maxMemoryUsage * 0.8) return "text-orange-500"
  return "text-green-500"
}

function getCacheClass(hitRate: number): string {
  if (hitRate > 0.8) return "text-green-500"
  if (hitRate > 0.5) return "text-orange-500"
  return "text-red-500"
}

// Lifecycle
onMounted(() => {
  refreshMetrics()

  // Auto-refresh every 30 seconds
  refreshInterval.value = setInterval(refreshMetrics, 30000)
})

onUnmounted(() => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
  }
})
</script>

<style scoped>
.performance-monitor {
  @apply space-y-6;
}

.monitor-header {
  @apply flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700;
}

.monitor-header h3 {
  @apply text-lg font-semibold;
}

.header-actions {
  @apply flex gap-2;
}

.monitor-content {
  @apply space-y-8;
}

.summary-cards {
  @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4;
}

.summary-card {
  @apply p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3;
}

.card-icon {
  @apply flex-shrink-0;
}

.card-content {
  @apply flex flex-col;
}

.card-value {
  @apply text-xl font-bold;
}

.card-label {
  @apply text-sm text-gray-600 dark:text-gray-400;
}

.alerts-section {
  @apply space-y-4;
}

.alerts-section h4 {
  @apply font-semibold;
}

.alerts-list {
  @apply space-y-3;
}

.alert-item {
  @apply flex items-start justify-between p-4 rounded-lg border;
}

.alert-item.alert-low {
  @apply border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900 dark:bg-opacity-20;
}

.alert-item.alert-medium {
  @apply border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900 dark:bg-opacity-20;
}

.alert-item.alert-high {
  @apply border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900 dark:bg-opacity-20;
}

.alert-content {
  @apply flex-1 space-y-2;
}

.alert-header {
  @apply flex items-center gap-2;
}

.alert-title {
  @apply font-medium;
}

.alert-severity {
  @apply px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 uppercase;
}

.alert-message {
  @apply text-sm;
}

.alert-suggestion {
  @apply flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400;
}

.alert-time {
  @apply text-xs text-gray-500 flex-shrink-0;
}

.chart-section {
  @apply space-y-4;
}

.chart-section h4 {
  @apply font-semibold;
}

.chart-container {
  @apply p-4 bg-gray-50 dark:bg-gray-800 rounded-lg;
}

.chart-placeholder {
  @apply space-y-4;
}

.chart-bars {
  @apply flex items-end gap-1 h-32;
}

.chart-bar {
  @apply flex-1 bg-blue-500 rounded-t min-h-1;
}

.chart-labels {
  @apply text-center text-sm text-gray-600 dark:text-gray-400;
}

.metrics-section {
  @apply space-y-4;
}

.section-header {
  @apply flex items-center justify-between;
}

.section-header h4 {
  @apply font-semibold;
}

.metrics-filters {
  @apply flex gap-2;
}

.filter-select {
  @apply px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm;
}

.metrics-table {
  @apply border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden;
}

.table-header {
  @apply grid grid-cols-6 gap-4 p-3 bg-gray-50 dark:bg-gray-800 font-medium text-sm;
}

.table-body {
  @apply divide-y divide-gray-200 dark:divide-gray-700;
}

.table-row {
  @apply grid grid-cols-6 gap-4 p-3 hover:bg-gray-50 dark:hover:bg-gray-800;
}

.table-cell {
  @apply text-sm;
}

.config-section {
  @apply space-y-4;
}

.config-section h4 {
  @apply font-semibold;
}

.config-grid {
  @apply grid grid-cols-1 md:grid-cols-2 gap-6;
}

.config-group {
  @apply space-y-2;
}

.config-label {
  @apply flex items-center gap-2 font-medium cursor-pointer;
}

.config-description {
  @apply text-sm text-gray-600 dark:text-gray-400;
}

.config-input {
  @apply flex items-center gap-2;
}

.config-input input {
  @apply px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700;
}

.input-unit {
  @apply text-sm text-gray-500;
}

.btn {
  @apply px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-2;
}

.btn-ghost {
  @apply text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800;
}

.btn-sm {
  @apply px-2 py-1 text-sm;
}
</style>
