<template>
  <div class="live-status-list">
    <!-- Header -->
    <div v-if="showHeader" class="list-header">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <icon-lucide-zap class="svg-icons text-accent" />
          <h3 class="text-lg font-semibold text-primaryLight">
            {{ t("collections.live_sources") }}
          </h3>
          <div class="status-summary">
            <span class="text-sm text-secondaryLight">
              {{
                t("collections.active_sources", {
                  count: activeSources.length,
                  total: liveSources.length,
                })
              }}
            </span>
          </div>
        </div>

        <div class="header-actions">
          <button
            class="action-button"
            :title="t('collections.add_live_source')"
            @click="$emit('add-source')"
          >
            <icon-lucide-plus class="svg-icons" />
            {{ t("collections.add_source") }}
          </button>

          <button
            class="action-button secondary"
            :disabled="isRefreshing"
            :title="t('collections.refresh_all_sources')"
            @click="refreshAll"
          >
            <SmartSpinner v-if="isRefreshing" class="w-4 h-4" />
            <icon-lucide-refresh-cw v-else class="svg-icons" />
          </button>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div v-if="showFilters" class="list-filters">
      <div class="filter-group">
        <label class="filter-label">{{
          t("collections.filter_by_status")
        }}</label>
        <select v-model="statusFilter" class="filter-select">
          <option value="all">{{ t("collections.all_statuses") }}</option>
          <option value="connected">
            {{ t("collections.status_connected") }}
          </option>
          <option value="syncing">{{ t("collections.status_syncing") }}</option>
          <option value="error">{{ t("collections.status_error") }}</option>
          <option value="disconnected">
            {{ t("collections.status_disconnected") }}
          </option>
        </select>
      </div>

      <div class="filter-group">
        <label class="filter-label">{{
          t("collections.filter_by_framework")
        }}</label>
        <select v-model="frameworkFilter" class="filter-select">
          <option value="all">{{ t("collections.all_frameworks") }}</option>
          <option
            v-for="framework in availableFrameworks"
            :key="framework"
            :value="framework"
          >
            {{ framework }}
          </option>
        </select>
      </div>

      <div class="filter-group">
        <label class="checkbox-label">
          <input
            v-model="showOnlyWithChanges"
            type="checkbox"
            class="checkbox"
          />
          <span>{{ t("collections.show_only_with_changes") }}</span>
        </label>
      </div>
    </div>

    <!-- Status List -->
    <div class="status-list" :class="{ 'grid-view': viewMode === 'grid' }">
      <div
        v-for="source in filteredSources"
        :key="source.collection.liveMetadata?.sourceId"
        class="status-item"
        :class="{ 'has-changes': source.hasPendingChanges }"
      >
        <!-- Collection Info -->
        <div class="collection-info">
          <div class="collection-header">
            <div class="flex items-center space-x-2">
              <icon-lucide-folder class="svg-icons text-accent" />
              <span class="collection-name">{{ source.collection.name }}</span>
            </div>
            <LiveStatusIndicator
              :collection="source.collection"
              :status="source.status"
              :last-error="source.lastError"
              size="sm"
              @click="$emit('collection-click', source.collection)"
              @retry="handleRetry(source)"
              @sync="handleSync(source)"
              @configure="handleConfigure(source)"
            />
          </div>

          <!-- Framework & Source Info -->
          <div class="collection-details">
            <div
              v-if="source.collection.liveMetadata?.framework"
              class="framework-info"
            >
              <component
                :is="
                  getFrameworkIcon(
                    source.collection.liveMetadata.framework.name
                  )
                "
                class="svg-icons framework-icon"
              />
              <span class="framework-name">{{
                source.collection.liveMetadata.framework.name
              }}</span>
              <span
                v-if="source.collection.liveMetadata.framework.version"
                class="framework-version"
              >
                v{{ source.collection.liveMetadata.framework.version }}
              </span>
            </div>

            <div class="source-info">
              <icon-lucide-globe
                v-if="source.sourceType === 'url'"
                class="svg-icons"
              />
              <icon-lucide-file v-else class="svg-icons" />
              <span class="source-path">{{
                getSourcePath(source.collection)
              }}</span>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="quick-actions">
          <button
            v-if="source.hasPendingChanges"
            class="quick-action sync"
            :title="t('collections.sync_changes')"
            @click="handleSync(source)"
          >
            <icon-lucide-download class="svg-icons" />
            <span class="action-count">{{ source.pendingChangesCount }}</span>
          </button>

          <button
            v-if="source.hasUserModifications"
            class="quick-action modifications"
            :title="t('collections.view_modifications')"
            @click="handleShowModifications(source)"
          >
            <icon-lucide-edit class="svg-icons" />
            <span class="action-count">{{
              source.userModificationsCount
            }}</span>
          </button>

          <button
            v-if="source.status === 'error'"
            class="quick-action error"
            :title="t('collections.retry_connection')"
            @click="handleRetry(source)"
          >
            <icon-lucide-alert-triangle class="svg-icons" />
          </button>
        </div>

        <!-- Last Sync Info -->
        <div
          v-if="source.collection.liveMetadata?.lastSyncTime"
          class="sync-info"
        >
          <span class="sync-time">
            {{ formatSyncTime(source.collection.liveMetadata.lastSyncTime) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="filteredSources.length === 0" class="empty-state">
      <div v-if="liveSources.length === 0" class="no-sources">
        <icon-lucide-zap class="svg-icons empty-icon" />
        <h4 class="empty-title">{{ t("collections.no_live_sources") }}</h4>
        <p class="empty-description">
          {{ t("collections.no_live_sources_description") }}
        </p>
        <button class="btn-primary" @click="$emit('add-source')">
          <icon-lucide-plus class="svg-icons" />
          {{ t("collections.add_first_source") }}
        </button>
      </div>

      <div v-else class="no-filtered-results">
        <icon-lucide-filter class="svg-icons empty-icon" />
        <h4 class="empty-title">{{ t("collections.no_matching_sources") }}</h4>
        <p class="empty-description">{{ t("collections.adjust_filters") }}</p>
        <button class="btn-secondary" @click="clearFilters">
          {{ t("collections.clear_filters") }}
        </button>
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
  hasUserModifications,
} from "~/newstore/collections"
import LiveStatusIndicator from "./LiveStatusIndicator.vue"
import IconLucideZap from "~icons/lucide/zap"
import IconLucidePlus from "~icons/lucide/plus"
import IconLucideRefreshCw from "~icons/lucide/refresh-cw"
import IconLucideFolder from "~icons/lucide/folder"
import IconLucideGlobe from "~icons/lucide/globe"
import IconLucideFile from "~icons/lucide/file"
import IconLucideDownload from "~icons/lucide/download"
import IconLucideEdit from "~icons/lucide/edit"
import IconLucideAlertTriangle from "~icons/lucide/alert-triangle"
import IconLucideFilter from "~icons/lucide/filter"
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
  collections: LiveSyncCollection[]
  showHeader?: boolean
  showFilters?: boolean
  viewMode?: "list" | "grid"
  autoRefresh?: boolean
  refreshInterval?: number
}

const props = withDefaults(defineProps<Props>(), {
  showHeader: true,
  showFilters: true,
  viewMode: "list",
  autoRefresh: false,
  refreshInterval: 30000,
})

const emit = defineEmits<{
  "add-source": []
  "collection-click": [collection: LiveSyncCollection]
  retry: [collection: LiveSyncCollection]
  sync: [collection: LiveSyncCollection]
  configure: [collection: LiveSyncCollection]
  "show-modifications": [collection: LiveSyncCollection]
  "refresh-all": []
}>()

// Composables
const { t } = useI18n()

// Reactive State
const statusFilter = ref<string>("all")
const frameworkFilter = ref<string>("all")
const showOnlyWithChanges = ref(false)
const isRefreshing = ref(false)

// Computed Properties
const liveSources = computed(() => {
  return props.collections.map((collection) => {
    const metadata = collection.liveMetadata
    const hasPendingChanges = hasPendingCodeChanges(collection)
    const hasUserMods = hasUserModifications(collection)

    // Determine status based on various factors
    let status: "connected" | "syncing" | "error" | "disconnected" | "paused" =
      "disconnected"
    let lastError: string | undefined

    // This would typically come from a live sync service
    // For now, we'll simulate based on metadata
    if (metadata?.lastSyncTime) {
      const timeSinceSync = Date.now() - metadata.lastSyncTime.getTime()
      if (timeSinceSync < 60000) {
        // Less than 1 minute
        status = "connected"
      } else if (timeSinceSync < 300000) {
        // Less than 5 minutes
        status = "connected"
      } else {
        status = "disconnected"
      }
    }

    return {
      collection,
      status,
      lastError,
      hasPendingChanges,
      hasUserModifications: hasUserMods,
      pendingChangesCount:
        metadata?.changeTracking?.pendingChanges?.length || 0,
      userModificationsCount: getUserModificationCount(collection),
      sourceType: getSourceType(collection),
    }
  })
})

const activeSources = computed(() => {
  return liveSources.value.filter(
    (source) => source.status === "connected" || source.status === "syncing"
  )
})

const availableFrameworks = computed(() => {
  const frameworks = new Set<string>()
  liveSources.value.forEach((source) => {
    if (source.collection.liveMetadata?.framework?.name) {
      frameworks.add(source.collection.liveMetadata.framework.name)
    }
  })
  return Array.from(frameworks).sort()
})

const filteredSources = computed(() => {
  let filtered = liveSources.value

  // Filter by status
  if (statusFilter.value !== "all") {
    filtered = filtered.filter((source) => source.status === statusFilter.value)
  }

  // Filter by framework
  if (frameworkFilter.value !== "all") {
    filtered = filtered.filter(
      (source) =>
        source.collection.liveMetadata?.framework?.name ===
        frameworkFilter.value
    )
  }

  // Filter by changes
  if (showOnlyWithChanges.value) {
    filtered = filtered.filter(
      (source) => source.hasPendingChanges || source.hasUserModifications
    )
  }

  return filtered
})

// Methods
const getSourceType = (
  collection: LiveSyncCollection
): "url" | "file" | "unknown" => {
  const metadata = collection.liveMetadata
  if (metadata?.sourceUrl) return "url"
  if (metadata?.filePath) return "file"
  return "unknown"
}

const getSourcePath = (collection: LiveSyncCollection): string => {
  const metadata = collection.liveMetadata
  if (metadata?.sourceUrl) {
    try {
      const url = new URL(metadata.sourceUrl)
      return `${url.hostname}${url.pathname}`
    } catch {
      return metadata.sourceUrl
    }
  }
  if (metadata?.filePath) {
    return metadata.filePath.split("/").pop() || metadata.filePath
  }
  return t("collections.unknown_source")
}

const getUserModificationCount = (collection: LiveSyncCollection): number => {
  const customizations = collection.liveMetadata?.customizations
  if (!customizations) return 0

  let count = 0
  count += Object.keys(customizations.requests || {}).length
  count += Object.keys(customizations.folders || {}).length
  if (Object.keys(customizations.collection || {}).length > 0) count += 1

  return count
}

const formatSyncTime = (date: Date): string => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffMins < 1) return t("collections.just_now")
  if (diffMins < 60) return t("collections.minutes_ago", { count: diffMins })
  if (diffHours < 24) return t("collections.hours_ago", { count: diffHours })

  return date.toLocaleDateString()
}

const getFrameworkIcon = (frameworkName: string) => {
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

const refreshAll = async () => {
  isRefreshing.value = true
  try {
    emit("refresh-all")
    // Simulate refresh delay
    await new Promise((resolve) => setTimeout(resolve, 1000))
  } finally {
    isRefreshing.value = false
  }
}

const clearFilters = () => {
  statusFilter.value = "all"
  frameworkFilter.value = "all"
  showOnlyWithChanges.value = false
}

const handleRetry = (source: any) => {
  emit("retry", source.collection)
}

const handleSync = (source: any) => {
  emit("sync", source.collection)
}

const handleConfigure = (source: any) => {
  emit("configure", source.collection)
}

const handleShowModifications = (source: any) => {
  emit("show-modifications", source.collection)
}

// Auto-refresh functionality
let refreshTimer: NodeJS.Timeout | null = null

const startAutoRefresh = () => {
  if (props.autoRefresh && props.refreshInterval > 0) {
    refreshTimer = setInterval(() => {
      if (!isRefreshing.value) {
        refreshAll()
      }
    }, props.refreshInterval)
  }
}

const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// Watchers
watch(
  () => props.autoRefresh,
  (newValue) => {
    if (newValue) {
      startAutoRefresh()
    } else {
      stopAutoRefresh()
    }
  },
  { immediate: true }
)

watch(
  () => props.refreshInterval,
  () => {
    stopAutoRefresh()
    startAutoRefresh()
  }
)

// Lifecycle
onMounted(() => {
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.live-status-list {
  @apply space-y-4;
}

.list-header {
  @apply pb-4 border-b border-dividerLight;
}

.status-summary {
  @apply px-2 py-1 bg-secondaryLight rounded-full;
}

.header-actions {
  @apply flex items-center space-x-2;
}

.action-button {
  @apply flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors;
}

.action-button:not(.secondary) {
  @apply bg-accent text-accentContrast hover:bg-accentDark;
}

.action-button.secondary {
  @apply bg-secondaryLight text-secondaryDark hover:bg-secondaryDark hover:text-secondaryLight;
}

.action-button:disabled {
  @apply opacity-50 cursor-not-allowed;
}

.list-filters {
  @apply flex flex-wrap items-center gap-4 p-4 bg-primaryLight rounded-lg border border-dividerLight;
}

.filter-group {
  @apply flex items-center space-x-2;
}

.filter-label {
  @apply text-sm font-medium text-primaryLight whitespace-nowrap;
}

.filter-select {
  @apply px-3 py-1 text-sm bg-primaryLight border border-dividerLight rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent;
}

.checkbox-label {
  @apply flex items-center space-x-2 cursor-pointer;
}

.checkbox {
  @apply w-4 h-4 text-accent bg-primaryLight border-dividerLight rounded focus:ring-accent focus:ring-2;
}

.status-list {
  @apply space-y-3;
}

.status-list.grid-view {
  @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 space-y-0;
}

.status-item {
  @apply p-4 bg-primaryLight border border-dividerLight rounded-lg hover:border-accent transition-colors;
}

.status-item.has-changes {
  @apply border-accent border-l-4;
}

.collection-info {
  @apply space-y-3;
}

.collection-header {
  @apply flex items-center justify-between;
}

.collection-name {
  @apply font-medium text-primaryLight truncate;
}

.collection-details {
  @apply space-y-2;
}

.framework-info {
  @apply flex items-center space-x-2 text-sm;
}

.framework-icon {
  @apply w-4 h-4;
}

.framework-name {
  @apply font-medium text-primaryLight;
}

.framework-version {
  @apply text-xs text-secondaryLight;
}

.source-info {
  @apply flex items-center space-x-2 text-sm text-secondaryLight;
}

.source-path {
  @apply font-mono text-xs truncate;
}

.quick-actions {
  @apply flex items-center space-x-2 mt-3;
}

.quick-action {
  @apply relative flex items-center space-x-1 px-2 py-1 text-xs rounded-full transition-colors;
}

.quick-action.sync {
  @apply bg-blue-100 text-blue-700 hover:bg-blue-200;
}

.quick-action.modifications {
  @apply bg-yellow-100 text-yellow-700 hover:bg-yellow-200;
}

.quick-action.error {
  @apply bg-red-100 text-red-700 hover:bg-red-200;
}

.action-count {
  @apply text-xs font-medium;
}

.sync-info {
  @apply mt-2 pt-2 border-t border-dividerLight;
}

.sync-time {
  @apply text-xs text-secondaryLight;
}

.empty-state {
  @apply py-12 text-center;
}

.empty-icon {
  @apply w-12 h-12 mx-auto mb-4 text-secondaryLight;
}

.empty-title {
  @apply text-lg font-medium text-primaryLight mb-2;
}

.empty-description {
  @apply text-secondaryLight mb-6 max-w-md mx-auto;
}

.btn-primary {
  @apply inline-flex items-center space-x-2 px-4 py-2 bg-accent text-accentContrast rounded-lg font-medium hover:bg-accentDark transition-colors;
}

.btn-secondary {
  @apply inline-flex items-center space-x-2 px-4 py-2 bg-secondaryLight text-secondaryDark rounded-lg font-medium hover:bg-secondaryDark hover:text-secondaryLight transition-colors;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .quick-action.sync {
    @apply bg-blue-900 text-blue-300 hover:bg-blue-800;
  }

  .quick-action.modifications {
    @apply bg-yellow-900 text-yellow-300 hover:bg-yellow-800;
  }

  .quick-action.error {
    @apply bg-red-900 text-red-300 hover:bg-red-800;
  }
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .list-filters {
    @apply flex-col items-stretch gap-3;
  }

  .filter-group {
    @apply flex-col items-stretch space-x-0 space-y-1;
  }

  .header-actions {
    @apply flex-col space-x-0 space-y-2;
  }

  .status-list.grid-view {
    @apply grid-cols-1;
  }
}

/* Animation for status changes */
.status-item {
  transition: all 0.3s ease;
}

.status-item.has-changes {
  animation: pulse-border 2s ease-in-out infinite;
}

@keyframes pulse-border {
  0%,
  100% {
    border-left-color: theme("colors.accent");
  }
  50% {
    border-left-color: theme("colors.accent") / 0.5;
  }
}
</style>
