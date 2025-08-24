<template>
  <div class="live-status-indicator" :class="statusClass">
    <!-- Main Status Badge -->
    <div
      class="status-badge"
      :class="[statusClass, { 'with-tooltip': showTooltip }]"
      @mouseenter="showTooltip = true"
      @mouseleave="showTooltip = false"
      @click="$emit('click')"
    >
      <!-- Framework Icon -->
      <div v-if="collection.liveMetadata?.framework" class="framework-icon">
        <component
          :is="
            getFrameworkIconComponent(collection.liveMetadata.framework.name)
          "
          class="svg-icons"
        />
      </div>

      <!-- Status Icon -->
      <div class="status-icon">
        <SmartSpinner v-if="status === 'syncing'" class="w-3 h-3" />
        <icon-lucide-check-circle
          v-else-if="status === 'connected'"
          class="svg-icons"
        />
        <icon-lucide-alert-circle
          v-else-if="status === 'error'"
          class="svg-icons"
        />
        <icon-lucide-x-circle
          v-else-if="status === 'disconnected'"
          class="svg-icons"
        />
        <icon-lucide-pause-circle v-else class="svg-icons" />
      </div>

      <!-- Change Indicator -->
      <div
        v-if="hasPendingChanges"
        class="change-indicator"
        :title="t('collections.pending_changes')"
      >
        <icon-lucide-dot class="svg-icons pulse" />
      </div>
    </div>

    <!-- Tooltip -->
    <div v-if="showTooltip" class="status-tooltip" :class="tooltipPosition">
      <div class="tooltip-content">
        <!-- Header -->
        <div class="tooltip-header">
          <div class="flex items-center space-x-2">
            <component
              :is="
                getFrameworkIconComponent(
                  collection.liveMetadata.framework.name
                )
              "
              v-if="collection.liveMetadata?.framework"
              class="svg-icons text-accent"
            />
            <span class="font-medium text-primaryLight">
              {{ getStatusTitle() }}
            </span>
          </div>
          <div class="status-dot" :class="statusClass"></div>
        </div>

        <!-- Framework Info -->
        <div v-if="collection.liveMetadata?.framework" class="tooltip-section">
          <div class="section-label">{{ t("collections.framework") }}</div>
          <div class="section-content">
            <span class="framework-name">{{
              collection.liveMetadata.framework.name
            }}</span>
            <span
              v-if="collection.liveMetadata.framework.version"
              class="framework-version"
            >
              v{{ collection.liveMetadata.framework.version }}
            </span>
          </div>
        </div>

        <!-- Source Info -->
        <div class="tooltip-section">
          <div class="section-label">{{ t("collections.source") }}</div>
          <div class="section-content">
            <div class="source-info">
              <icon-lucide-globe
                v-if="sourceType === 'url'"
                class="svg-icons"
              />
              <icon-lucide-file v-else class="svg-icons" />
              <span class="source-path">{{ getSourcePath() }}</span>
            </div>
          </div>
        </div>

        <!-- Last Sync Info -->
        <div
          v-if="collection.liveMetadata?.lastSyncTime"
          class="tooltip-section"
        >
          <div class="section-label">{{ t("collections.last_sync") }}</div>
          <div class="section-content">
            <span class="sync-time">{{
              formatSyncTime(collection.liveMetadata.lastSyncTime)
            }}</span>
          </div>
        </div>

        <!-- Pending Changes -->
        <div v-if="hasPendingChanges" class="tooltip-section">
          <div class="section-label">
            {{ t("collections.pending_changes") }}
          </div>
          <div class="section-content">
            <div class="changes-list">
              <div
                v-for="change in pendingChanges.slice(0, 3)"
                :key="change"
                class="change-item"
              >
                <icon-lucide-dot class="svg-icons text-accent" />
                <span>{{ change }}</span>
              </div>
              <div v-if="pendingChanges.length > 3" class="more-changes">
                {{
                  t("collections.and_more_changes", {
                    count: pendingChanges.length - 3,
                  })
                }}
              </div>
            </div>
          </div>
        </div>

        <!-- User Modifications -->
        <div v-if="hasUserModifications" class="tooltip-section">
          <div class="section-label">
            {{ t("collections.user_modifications") }}
          </div>
          <div class="section-content">
            <div class="modifications-summary">
              <span class="modification-count">
                {{ getUserModificationCount() }}
                {{ t("collections.customizations") }}
              </span>
            </div>
          </div>
        </div>

        <!-- Error Info -->
        <div
          v-if="status === 'error' && lastError"
          class="tooltip-section error"
        >
          <div class="section-label">{{ t("collections.error") }}</div>
          <div class="section-content">
            <span class="error-message">{{ lastError }}</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="tooltip-actions">
          <button
            v-if="status === 'error' || status === 'disconnected'"
            class="action-button primary"
            @click="$emit('retry')"
          >
            <icon-lucide-refresh-cw class="svg-icons" />
            {{ t("action.retry") }}
          </button>

          <button
            v-if="hasPendingChanges"
            class="action-button secondary"
            @click="$emit('sync')"
          >
            <icon-lucide-download class="svg-icons" />
            {{ t("collections.sync_now") }}
          </button>

          <button class="action-button secondary" @click="$emit('configure')">
            <icon-lucide-settings class="svg-icons" />
            {{ t("action.configure") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue"
import { useI18n } from "@composables/i18n"
import { LiveSyncCollection } from "~/types/live-collection-metadata"
import {
  hasPendingCodeChanges,
  hasUserModifications as hasUserMods,
} from "~/newstore/collections"
import IconLucideCheckCircle from "~icons/lucide/check-circle"
import IconLucideAlertCircle from "~icons/lucide/alert-circle"
import IconLucideXCircle from "~icons/lucide/x-circle"
import IconLucidePauseCircle from "~icons/lucide/pause-circle"
import IconLucideDot from "~icons/lucide/dot"
import IconLucideGlobe from "~icons/lucide/globe"
import IconLucideFile from "~icons/lucide/file"
import IconLucideRefreshCw from "~icons/lucide/refresh-cw"
import IconLucideDownload from "~icons/lucide/download"
import IconLucideSettings from "~icons/lucide/settings"
import SmartSpinner from "@components/smart/Spinner.vue"

// Framework Icons
import IconSimpleFastapi from "~icons/simple-icons/fastapi"
import IconSimpleExpress from "~icons/simple-icons/express"
import IconSimpleSpring from "~icons/simple-icons/spring"
import IconSimpleDotnet from "~icons/simple-icons/dotnet"
import IconSimpleDjango from "~icons/simple-icons/django"
import IconSimpleFlask from "~icons/simple-icons/flask"
import IconSimpleNestjs from "~icons/simple-icons/nestjs"
import IconLucideCode from "~icons/lucide/code"

// Props & Emits
interface Props {
  collection: LiveSyncCollection
  status?: "connected" | "syncing" | "error" | "disconnected" | "paused"
  lastError?: string
  tooltipPosition?: "top" | "bottom" | "left" | "right"
  size?: "sm" | "md" | "lg"
}

const props = withDefaults(defineProps<Props>(), {
  status: "disconnected",
  lastError: undefined,
  tooltipPosition: "bottom",
  size: "md",
})

defineEmits<{
  click: []
  retry: []
  sync: []
  configure: []
}>()

// Composables
const { t } = useI18n()

// Reactive State
const showTooltip = ref(false)
const tooltipTimer = ref<NodeJS.Timeout | null>(null)

// Computed Properties
const statusClass = computed(() => {
  const baseClass = `status-${props.status}`
  const sizeClass = `size-${props.size}`
  return [baseClass, sizeClass]
})

const sourceType = computed(() => {
  const metadata = props.collection.liveMetadata
  if (metadata?.sourceUrl) return "url"
  if (metadata?.filePath) return "file"
  return "unknown"
})

const hasPendingChanges = computed(() => {
  return hasPendingCodeChanges(props.collection)
})

const hasUserModifications = computed(() => {
  return hasUserMods(props.collection)
})

const pendingChanges = computed(() => {
  return props.collection.liveMetadata?.changeTracking?.pendingChanges || []
})

// Methods
const getStatusTitle = () => {
  const titles = {
    connected: t("collections.status_connected"),
    syncing: t("collections.status_syncing"),
    error: t("collections.status_error"),
    disconnected: t("collections.status_disconnected"),
    paused: t("collections.status_paused"),
  }
  return titles[props.status] || t("collections.status_unknown")
}

const getSourcePath = () => {
  const metadata = props.collection.liveMetadata
  if (metadata?.sourceUrl) {
    try {
      const url = new URL(metadata.sourceUrl)
      return `${url.hostname}${url.pathname}`
    } catch {
      return metadata.sourceUrl
    }
  }
  if (metadata?.filePath) {
    // Show just the filename for brevity
    return metadata.filePath.split("/").pop() || metadata.filePath
  }
  return t("collections.unknown_source")
}

const formatSyncTime = (date: Date) => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return t("collections.just_now")
  if (diffMins < 60) return t("collections.minutes_ago", { count: diffMins })
  if (diffHours < 24) return t("collections.hours_ago", { count: diffHours })
  if (diffDays < 7) return t("collections.days_ago", { count: diffDays })

  return date.toLocaleDateString()
}

const getUserModificationCount = () => {
  const customizations = props.collection.liveMetadata?.customizations
  if (!customizations) return 0

  let count = 0
  count += Object.keys(customizations.requests || {}).length
  count += Object.keys(customizations.folders || {}).length
  if (Object.keys(customizations.collection || {}).length > 0) count += 1

  return count
}

const getFrameworkIconComponent = (frameworkName: string) => {
  const iconMap: Record<string, any> = {
    FastAPI: IconSimpleFastapi,
    fastapi: IconSimpleFastapi,
    Express: IconSimpleExpress,
    express: IconSimpleExpress,
    "Spring Boot": IconSimpleSpring,
    spring: IconSimpleSpring,
    "ASP.NET Core": IconSimpleDotnet,
    aspnet: IconSimpleDotnet,
    Django: IconSimpleDjango,
    django: IconSimpleDjango,
    Flask: IconSimpleFlask,
    flask: IconSimpleFlask,
    NestJS: IconSimpleNestjs,
    nestjs: IconSimpleNestjs,
  }

  return iconMap[frameworkName] || IconLucideCode
}

// Auto-hide tooltip after delay
const scheduleTooltipHide = () => {
  if (tooltipTimer.value) {
    clearTimeout(tooltipTimer.value)
  }
  tooltipTimer.value = setTimeout(() => {
    showTooltip.value = false
  }, 3000) // Hide after 3 seconds
}

// Watchers
watch(showTooltip, (show) => {
  if (show) {
    scheduleTooltipHide()
  } else if (tooltipTimer.value) {
    clearTimeout(tooltipTimer.value)
    tooltipTimer.value = null
  }
})

// Lifecycle
onMounted(() => {
  // Auto-refresh sync time display every minute
  const refreshInterval = setInterval(() => {
    // Force reactivity update for time formatting
    if (props.collection.liveMetadata?.lastSyncTime) {
      // This will trigger the computed property to recalculate
    }
  }, 60000)

  onUnmounted(() => {
    clearInterval(refreshInterval)
    if (tooltipTimer.value) {
      clearTimeout(tooltipTimer.value)
    }
  })
})
</script>

<style scoped>
.live-status-indicator {
  @apply relative inline-block;
}

.status-badge {
  @apply relative flex items-center space-x-1 px-2 py-1 rounded-full border cursor-pointer transition-all duration-200;
}

.status-badge.size-sm {
  @apply px-1.5 py-0.5 text-xs;
}

.status-badge.size-md {
  @apply px-2 py-1 text-sm;
}

.status-badge.size-lg {
  @apply px-3 py-1.5 text-base;
}

/* Status Colors */
.status-badge.status-connected {
  @apply bg-green-50 border-green-200 text-green-700 hover:bg-green-100;
}

.status-badge.status-syncing {
  @apply bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100;
}

.status-badge.status-error {
  @apply bg-red-50 border-red-200 text-red-700 hover:bg-red-100;
}

.status-badge.status-disconnected {
  @apply bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100;
}

.status-badge.status-paused {
  @apply bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100;
}

.framework-icon {
  @apply w-4 h-4 flex items-center justify-center;
}

.status-icon {
  @apply w-4 h-4 flex items-center justify-center;
}

.change-indicator {
  @apply absolute -top-1 -right-1 w-3 h-3 flex items-center justify-center;
}

.change-indicator .pulse {
  @apply animate-pulse text-accent;
}

/* Tooltip */
.status-tooltip {
  @apply absolute z-50 w-80 bg-primaryLight border border-dividerLight rounded-lg shadow-lg p-4;
}

.status-tooltip.top {
  @apply bottom-full left-1/2 transform -translate-x-1/2 mb-2;
}

.status-tooltip.bottom {
  @apply top-full left-1/2 transform -translate-x-1/2 mt-2;
}

.status-tooltip.left {
  @apply right-full top-1/2 transform -translate-y-1/2 mr-2;
}

.status-tooltip.right {
  @apply left-full top-1/2 transform -translate-y-1/2 ml-2;
}

.tooltip-content {
  @apply space-y-3;
}

.tooltip-header {
  @apply flex items-center justify-between pb-2 border-b border-dividerLight;
}

.status-dot {
  @apply w-2 h-2 rounded-full;
}

.status-dot.status-connected {
  @apply bg-green-500;
}

.status-dot.status-syncing {
  @apply bg-blue-500 animate-pulse;
}

.status-dot.status-error {
  @apply bg-red-500;
}

.status-dot.status-disconnected {
  @apply bg-gray-400;
}

.status-dot.status-paused {
  @apply bg-yellow-500;
}

.tooltip-section {
  @apply space-y-1;
}

.tooltip-section.error {
  @apply p-2 bg-red-50 border border-red-200 rounded;
}

.section-label {
  @apply text-xs font-medium text-secondaryLight uppercase tracking-wide;
}

.section-content {
  @apply text-sm text-primaryLight;
}

.framework-name {
  @apply font-medium text-primaryLight;
}

.framework-version {
  @apply text-xs text-secondaryLight ml-2;
}

.source-info {
  @apply flex items-center space-x-2;
}

.source-path {
  @apply font-mono text-xs text-secondaryLight truncate;
}

.sync-time {
  @apply text-secondaryLight;
}

.changes-list {
  @apply space-y-1;
}

.change-item {
  @apply flex items-center space-x-2 text-xs;
}

.more-changes {
  @apply text-xs text-secondaryLight italic;
}

.modifications-summary {
  @apply text-xs;
}

.modification-count {
  @apply font-medium text-accent;
}

.error-message {
  @apply text-xs text-red-600 font-mono;
}

.tooltip-actions {
  @apply flex items-center space-x-2 pt-2 border-t border-dividerLight;
}

.action-button {
  @apply flex items-center space-x-1 px-2 py-1 text-xs rounded transition-colors;
}

.action-button.primary {
  @apply bg-accent text-accentContrast hover:bg-accentDark;
}

.action-button.secondary {
  @apply bg-secondaryLight text-secondaryDark hover:bg-secondaryDark hover:text-secondaryLight;
}

.action-button .svg-icons {
  @apply w-3 h-3;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .status-badge.status-connected {
    @apply bg-green-900 border-green-700 text-green-300 hover:bg-green-800;
  }

  .status-badge.status-syncing {
    @apply bg-blue-900 border-blue-700 text-blue-300 hover:bg-blue-800;
  }

  .status-badge.status-error {
    @apply bg-red-900 border-red-700 text-red-300 hover:bg-red-800;
  }

  .status-badge.status-disconnected {
    @apply bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700;
  }

  .status-badge.status-paused {
    @apply bg-yellow-900 border-yellow-700 text-yellow-300 hover:bg-yellow-800;
  }

  .tooltip-section.error {
    @apply bg-red-900 border-red-700;
  }
}

/* Animation for syncing status */
@keyframes pulse-glow {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.05);
  }
}

.status-badge.status-syncing {
  animation: pulse-glow 2s ease-in-out infinite;
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .status-tooltip {
    @apply w-72;
  }

  .status-tooltip.left,
  .status-tooltip.right {
    @apply left-1/2 right-auto top-full transform -translate-x-1/2 translate-y-0 mt-2;
  }
}
</style>
