<template>
  <HoppModal :title="t('collections.error_recovery')" @close="$emit('close')">
    <div class="error-recovery-dialog">
      <div v-if="errorHistory.length === 0" class="no-errors">
        <icon name="check-circle" class="success-icon" />
        <h4>{{ t("collections.no_recent_errors") }}</h4>
        <p>{{ t("collections.all_systems_operational") }}</p>
      </div>

      <div v-else class="error-list">
        <div class="error-summary">
          <div class="summary-stats">
            <div class="stat">
              <span class="stat-number">{{ errorHistory.length }}</span>
              <span class="stat-label">{{
                t("collections.total_errors")
              }}</span>
            </div>
            <div class="stat">
              <span class="stat-number">{{ recoverableErrors }}</span>
              <span class="stat-label">{{ t("collections.recoverable") }}</span>
            </div>
            <div class="stat">
              <span class="stat-number">{{ recentErrors }}</span>
              <span class="stat-label">{{ t("collections.last_hour") }}</span>
            </div>
          </div>
        </div>

        <div class="error-items">
          <div
            v-for="error in sortedErrors"
            :key="error.sourceId + error.timestamp.getTime()"
            class="error-item"
            :class="getErrorClass(error)"
          >
            <div class="error-header">
              <div class="error-info">
                <div class="error-type">
                  <icon :name="getErrorIcon(error.errorType)" />
                  <span class="error-title">{{
                    getErrorTitle(error.errorType)
                  }}</span>
                  <span v-if="error.isRecoverable" class="recoverable-badge">
                    {{ t("collections.recoverable") }}
                  </span>
                </div>
                <div class="error-meta">
                  <span class="source-name">{{
                    getSourceName(error.sourceId)
                  }}</span>
                  <span class="error-time">{{
                    formatRelativeTime(error.timestamp)
                  }}</span>
                  <span v-if="error.retryCount > 0" class="retry-count">
                    {{ error.retryCount }} {{ t("collections.retries") }}
                  </span>
                </div>
              </div>

              <div class="error-actions">
                <button
                  v-if="error.isRecoverable"
                  class="btn btn-primary btn-sm"
                  :disabled="isRecovering"
                  @click="triggerRecovery(error)"
                >
                  <icon
                    v-if="isRecovering"
                    name="loader"
                    class="animate-spin"
                  />
                  <icon v-else name="refresh-cw" />
                  {{ t("collections.recover") }}
                </button>

                <button
                  class="btn btn-ghost btn-sm"
                  @click="toggleErrorDetails(error)"
                >
                  <icon
                    :name="isExpanded(error) ? 'chevron-up' : 'chevron-down'"
                  />
                </button>
              </div>
            </div>

            <div class="error-message">
              {{ error.errorMessage }}
            </div>

            <div v-if="isExpanded(error)" class="error-details">
              <div class="suggested-actions">
                <h5>{{ t("collections.suggested_actions") }}</h5>
                <ul class="action-list">
                  <li
                    v-for="action in error.suggestedActions"
                    :key="action"
                    class="action-item"
                  >
                    <icon name="arrow-right" />
                    <span>{{ action }}</span>
                  </li>
                </ul>
              </div>

              <div class="error-timeline">
                <h5>{{ t("collections.error_timeline") }}</h5>
                <div class="timeline-item">
                  <div class="timeline-marker error"></div>
                  <div class="timeline-content">
                    <span class="timeline-time">{{
                      formatTime(error.timestamp)
                    }}</span>
                    <span class="timeline-event">{{
                      t("collections.error_occurred")
                    }}</span>
                  </div>
                </div>
                <div v-if="error.lastRetryAt" class="timeline-item">
                  <div class="timeline-marker retry"></div>
                  <div class="timeline-content">
                    <span class="timeline-time">{{
                      formatTime(error.lastRetryAt)
                    }}</span>
                    <span class="timeline-event">{{
                      t("collections.last_retry")
                    }}</span>
                  </div>
                </div>
              </div>

              <div class="technical-details">
                <h5>{{ t("collections.technical_details") }}</h5>
                <div class="detail-grid">
                  <div class="detail-item">
                    <span class="detail-label"
                      >{{ t("collections.error_type") }}:</span
                    >
                    <span class="detail-value">{{ error.errorType }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label"
                      >{{ t("collections.source_id") }}:</span
                    >
                    <span class="detail-value">{{ error.sourceId }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label"
                      >{{ t("collections.retry_count") }}:</span
                    >
                    <span class="detail-value">{{ error.retryCount }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label"
                      >{{ t("collections.recoverable") }}:</span
                    >
                    <span class="detail-value">{{
                      error.isRecoverable ? t("action.yes") : t("action.no")
                    }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <div class="footer-actions">
          <button class="btn btn-ghost" @click="clearAllErrors">
            <icon name="trash-2" />
            {{ t("collections.clear_all") }}
          </button>

          <button class="btn btn-secondary" @click="exportErrorLog">
            <icon name="download" />
            {{ t("collections.export_log") }}
          </button>

          <button class="btn btn-primary" @click="$emit('close')">
            {{ t("action.close") }}
          </button>
        </div>
      </div>
    </div>
  </HoppModal>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue"
import { useI18n } from "~/composables/i18n"
import { useToast } from "~/composables/toast"
import {
  errorRecoveryService,
  type ErrorContext,
} from "../../services/error-recovery.service"
import { liveSpecSourceService } from "../../services/live-spec-source.service"

interface Props {
  sourceId?: string // If provided, show errors for specific source only
}

const props = defineProps<Props>()

defineEmits<{
  close: []
}>()

const t = useI18n()
const toast = useToast()

// State
const errorHistory = ref<ErrorContext[]>([])
const expandedErrors = ref<Set<string>>(new Set())
const isRecovering = ref(false)

// Computed
const sortedErrors = computed(() => {
  return [...errorHistory.value].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  )
})

const recoverableErrors = computed(() => {
  return errorHistory.value.filter((e) => e.isRecoverable).length
})

const recentErrors = computed(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  return errorHistory.value.filter((e) => e.timestamp > oneHourAgo).length
})

// Methods
function loadErrorHistory() {
  if (props.sourceId) {
    errorHistory.value = errorRecoveryService.getErrorHistory(props.sourceId)
  } else {
    // Get all errors from all sources
    const allSources = liveSpecSourceService.getSources()
    errorHistory.value = allSources.flatMap((source) =>
      errorRecoveryService.getErrorHistory(source.id)
    )
  }
}

function getErrorClass(error: ErrorContext): string {
  const classes = [`error-${error.errorType}`]
  if (error.isRecoverable) classes.push("recoverable")
  if (error.retryCount > 0) classes.push("has-retries")
  return classes.join(" ")
}

function getErrorIcon(errorType: string): string {
  const icons = {
    connection_failed: "wifi-off",
    cors_error: "shield-off",
    spec_not_found: "file-x",
    timeout: "clock",
    network_error: "globe",
    authentication_failed: "lock",
    permission_denied: "shield-x",
  }
  return icons[errorType] || "alert-circle"
}

function getErrorTitle(errorType: string): string {
  const titles = {
    connection_failed: t("collections.connection_failed"),
    cors_error: t("collections.cors_error"),
    spec_not_found: t("collections.spec_not_found"),
    timeout: t("collections.timeout_error"),
    network_error: t("collections.network_error"),
    authentication_failed: t("collections.auth_failed"),
    permission_denied: t("collections.permission_denied"),
  }
  return titles[errorType] || t("collections.unknown_error")
}

function getSourceName(sourceId: string): string {
  const source = liveSpecSourceService.getSource(sourceId)
  return source?.name || sourceId
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

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

function getErrorKey(error: ErrorContext): string {
  return `${error.sourceId}-${error.errorType}-${error.timestamp.getTime()}`
}

function isExpanded(error: ErrorContext): boolean {
  return expandedErrors.value.has(getErrorKey(error))
}

function toggleErrorDetails(error: ErrorContext): void {
  const key = getErrorKey(error)
  if (expandedErrors.value.has(key)) {
    expandedErrors.value.delete(key)
  } else {
    expandedErrors.value.add(key)
  }
}

async function triggerRecovery(error: ErrorContext): Promise<void> {
  const source = liveSpecSourceService.getSource(error.sourceId)
  if (!source) {
    toast.error(t("collections.source_not_found"))
    return
  }

  isRecovering.value = true

  try {
    const recovered = await errorRecoveryService.triggerManualRecovery(
      source,
      error
    )

    if (recovered) {
      toast.success(t("collections.recovery_successful"))
      loadErrorHistory() // Refresh the list
    } else {
      toast.error(t("collections.recovery_failed"))
    }
  } catch (err) {
    toast.error(t("collections.recovery_error"))
  } finally {
    isRecovering.value = false
  }
}

function clearAllErrors(): void {
  if (props.sourceId) {
    errorRecoveryService.clearErrorHistory(props.sourceId)
  } else {
    const allSources = liveSpecSourceService.getSources()
    allSources.forEach((source) => {
      errorRecoveryService.clearErrorHistory(source.id)
    })
  }

  loadErrorHistory()
  toast.success(t("collections.errors_cleared"))
}

function exportErrorLog(): void {
  const logData = {
    timestamp: new Date().toISOString(),
    errors: errorHistory.value,
    config: errorRecoveryService.getConfig(),
  }

  const blob = new Blob([JSON.stringify(logData, null, 2)], {
    type: "application/json",
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `hoppscotch-error-log-${new Date().toISOString().split("T")[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  toast.success(t("collections.log_exported"))
}

// Lifecycle
onMounted(() => {
  loadErrorHistory()
})
</script>

<style scoped>
.error-recovery-dialog {
  @apply max-w-4xl space-y-6;
}

.no-errors {
  @apply text-center py-12;
}

.success-icon {
  @apply w-16 h-16 mx-auto mb-4 text-green-500;
}

.no-errors h4 {
  @apply text-lg font-semibold mb-2;
}

.no-errors p {
  @apply text-gray-600 dark:text-gray-400;
}

.error-summary {
  @apply mb-6;
}

.summary-stats {
  @apply flex gap-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg;
}

.stat {
  @apply text-center;
}

.stat-number {
  @apply block text-2xl font-bold text-blue-600 dark:text-blue-400;
}

.stat-label {
  @apply block text-sm text-gray-600 dark:text-gray-400 mt-1;
}

.error-items {
  @apply space-y-4 max-h-96 overflow-y-auto;
}

.error-item {
  @apply border rounded-lg overflow-hidden;
}

.error-item.error-connection_failed {
  @apply border-red-200 dark:border-red-800;
}

.error-item.error-cors_error {
  @apply border-orange-200 dark:border-orange-800;
}

.error-item.error-spec_not_found {
  @apply border-yellow-200 dark:border-yellow-800;
}

.error-item.recoverable {
  @apply bg-blue-50 dark:bg-blue-900 dark:bg-opacity-10;
}

.error-header {
  @apply flex items-start justify-between p-4;
}

.error-info {
  @apply flex-1;
}

.error-type {
  @apply flex items-center gap-2 mb-2;
}

.error-title {
  @apply font-semibold;
}

.recoverable-badge {
  @apply px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100 rounded;
}

.error-meta {
  @apply flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400;
}

.source-name {
  @apply font-medium;
}

.retry-count {
  @apply px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs;
}

.error-actions {
  @apply flex items-center gap-2;
}

.error-message {
  @apply px-4 pb-4 text-sm text-gray-700 dark:text-gray-300 font-mono bg-gray-50 dark:bg-gray-800;
}

.error-details {
  @apply p-4 border-t border-gray-200 dark:border-gray-700 space-y-4;
}

.suggested-actions h5,
.error-timeline h5,
.technical-details h5 {
  @apply font-semibold mb-3;
}

.action-list {
  @apply space-y-2;
}

.action-item {
  @apply flex items-start gap-2 text-sm;
}

.action-item icon {
  @apply w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500;
}

.timeline-item {
  @apply flex items-center gap-3 py-2;
}

.timeline-marker {
  @apply w-3 h-3 rounded-full flex-shrink-0;
}

.timeline-marker.error {
  @apply bg-red-500;
}

.timeline-marker.retry {
  @apply bg-blue-500;
}

.timeline-content {
  @apply flex items-center gap-3 text-sm;
}

.timeline-time {
  @apply font-mono text-gray-500;
}

.detail-grid {
  @apply grid grid-cols-2 gap-3;
}

.detail-item {
  @apply flex justify-between text-sm;
}

.detail-label {
  @apply font-medium text-gray-600 dark:text-gray-400;
}

.detail-value {
  @apply font-mono;
}

.dialog-footer {
  @apply pt-4 border-t border-gray-200 dark:border-gray-700;
}

.footer-actions {
  @apply flex justify-between;
}

.btn {
  @apply px-4 py-2 rounded font-medium transition-colors flex items-center gap-2;
}

.btn:disabled {
  @apply opacity-50 cursor-not-allowed;
}

.btn-primary {
  @apply bg-blue-500 text-white hover:bg-blue-600;
}

.btn-secondary {
  @apply bg-gray-500 text-white hover:bg-gray-600;
}

.btn-ghost {
  @apply text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800;
}

.btn-sm {
  @apply px-2 py-1 text-sm;
}

.animate-spin {
  @apply animate-spin;
}
</style>
