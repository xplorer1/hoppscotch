<template>
  <div class="team-live-source-manager">
    <div class="manager-header">
      <div class="header-content">
        <h3>{{ t("collections.team_live_sources") }}</h3>
        <p>{{ t("collections.team_live_sources_description") }}</p>
      </div>

      <div class="header-actions">
        <button class="btn btn-primary" @click="showShareDialog = true">
          <icon name="share" />
          {{ t("collections.share_source") }}
        </button>
      </div>
    </div>

    <div class="manager-content">
      <!-- Team Sources List -->
      <div class="sources-section">
        <div class="section-header">
          <h4>{{ t("collections.shared_sources") }}</h4>
          <div class="source-filters">
            <select v-model="statusFilter" class="filter-select">
              <option value="all">{{ t("collections.all_statuses") }}</option>
              <option value="connected">
                {{ t("collections.connected") }}
              </option>
              <option value="syncing">{{ t("collections.syncing") }}</option>
              <option value="error">{{ t("collections.error") }}</option>
            </select>
          </div>
        </div>

        <div v-if="filteredTeamSources.length === 0" class="empty-state">
          <icon name="users" class="empty-icon" />
          <h5>{{ t("collections.no_team_sources") }}</h5>
          <p>{{ t("collections.no_team_sources_description") }}</p>
        </div>

        <div v-else class="sources-list">
          <div
            v-for="source in filteredTeamSources"
            :key="source.id"
            class="source-item"
            :class="{ 'has-conflicts': hasActiveConflicts(source.id) }"
          >
            <div class="source-info">
              <div class="source-header">
                <div class="source-title">
                  <icon :name="getFrameworkIcon(source.framework)" />
                  <span class="source-name">{{ source.name }}</span>
                  <div class="source-badges">
                    <span
                      v-if="source.sharedBy === currentUserId"
                      class="badge owner"
                    >
                      {{ t("collections.owner") }}
                    </span>
                    <span
                      v-if="hasActiveConflicts(source.id)"
                      class="badge conflict"
                    >
                      {{ t("collections.conflict") }}
                    </span>
                  </div>
                </div>

                <div class="source-actions">
                  <LiveStatusIndicator
                    :collection="{ liveMetadata: { sourceId: source.id } }"
                    :status="getSourceStatus(source)"
                    size="sm"
                    @retry="handleRetry(source)"
                    @sync="handleSync(source)"
                  />

                  <button
                    v-if="source.permissions.canEdit"
                    class="btn btn-ghost btn-sm"
                    @click="editSource(source)"
                  >
                    <icon name="edit" />
                  </button>

                  <button
                    class="btn btn-ghost btn-sm"
                    @click="showSourceMenu(source)"
                  >
                    <icon name="more-vertical" />
                  </button>
                </div>
              </div>

              <div class="source-details">
                <div class="detail-item">
                  <icon name="link" />
                  <span>{{ getSourceUrl(source) }}</span>
                </div>
                <div class="detail-item">
                  <icon name="user" />
                  <span
                    >{{ t("collections.shared_by") }}:
                    {{ getUserName(source.sharedBy) }}</span
                  >
                </div>
                <div class="detail-item">
                  <icon name="clock" />
                  <span
                    >{{ t("collections.shared_at") }}:
                    {{ formatDate(source.sharedAt) }}</span
                  >
                </div>
                <div class="detail-item">
                  <icon name="users" />
                  <span
                    >{{ source.subscribers.length }}
                    {{ t("collections.subscribers") }}</span
                  >
                </div>
              </div>

              <div v-if="hasActiveConflicts(source.id)" class="conflict-alert">
                <icon name="alert-triangle" />
                <span>{{ t("collections.active_conflicts") }}</span>
                <button
                  class="btn btn-warning btn-sm"
                  @click="showConflictResolution(source.id)"
                >
                  {{ t("collections.resolve_conflicts") }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Team Activity -->
      <div class="activity-section">
        <div class="section-header">
          <h4>{{ t("collections.team_activity") }}</h4>
          <button class="btn btn-ghost btn-sm" @click="refreshActivity">
            <icon name="refresh-cw" />
            {{ t("action.refresh") }}
          </button>
        </div>

        <div class="activity-list">
          <div
            v-for="event in teamEvents"
            :key="event.id"
            class="activity-item"
            :class="`activity-${event.type}`"
          >
            <div class="activity-icon">
              <icon :name="getEventIcon(event.type)" />
            </div>
            <div class="activity-content">
              <div class="activity-message">
                {{ getEventMessage(event) }}
              </div>
              <div class="activity-time">
                {{ formatRelativeTime(event.timestamp) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Share Source Dialog -->
    <HoppModal
      v-if="showShareDialog"
      :title="t('collections.share_live_source')"
      @close="showShareDialog = false"
    >
      <div class="share-dialog">
        <div class="form-group">
          <label>{{ t("collections.select_source") }}</label>
          <select v-model="selectedSourceId" class="form-select">
            <option value="">{{ t("collections.choose_source") }}</option>
            <option
              v-for="source in availableSources"
              :key="source.id"
              :value="source.id"
            >
              {{ source.name }}
            </option>
          </select>
        </div>

        <div v-if="selectedSourceId" class="permissions-section">
          <h5>{{ t("collections.team_permissions") }}</h5>
          <div class="permission-options">
            <label class="permission-option">
              <input v-model="sharePermissions.canEdit" type="checkbox" />
              <span>{{ t("collections.can_edit_source") }}</span>
              <p class="permission-description">
                {{ t("collections.can_edit_description") }}
              </p>
            </label>

            <label class="permission-option">
              <input v-model="sharePermissions.canSync" type="checkbox" />
              <span>{{ t("collections.can_sync_source") }}</span>
              <p class="permission-description">
                {{ t("collections.can_sync_description") }}
              </p>
            </label>

            <label class="permission-option">
              <input v-model="sharePermissions.canDelete" type="checkbox" />
              <span>{{ t("collections.can_delete_source") }}</span>
              <p class="permission-description">
                {{ t("collections.can_delete_description") }}
              </p>
            </label>
          </div>
        </div>

        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="showShareDialog = false">
            {{ t("action.cancel") }}
          </button>
          <button
            :disabled="!selectedSourceId || isSharing"
            class="btn btn-primary"
            @click="shareSource"
          >
            <icon v-if="isSharing" name="loader" class="animate-spin" />
            <icon v-else name="share" />
            {{ t("collections.share_source") }}
          </button>
        </div>
      </div>
    </HoppModal>

    <!-- Conflict Resolution Dialog -->
    <ConflictResolutionDialog
      v-if="showConflictDialog"
      :conflicts="activeConflicts"
      @resolve="handleConflictResolution"
      @close="showConflictDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue"
import { useI18n } from "~/composables/i18n"
import { useToast } from "~/composables/toast"
import {
  teamLiveSyncService,
  type TeamLiveSource,
  type TeamSyncEvent,
  type ConflictResolution,
} from "../../services/team-live-sync.service"
import { liveSpecSourceService } from "../../services/live-spec-source.service"
import type {
  LiveSpecSource,
  FrameworkType,
} from "../../types/live-spec-source"
import LiveStatusIndicator from "./LiveStatusIndicator.vue"
import ConflictResolutionDialog from "./ConflictResolutionDialog.vue"

interface Props {
  teamId: string
}

const props = defineProps<Props>()

const t = useI18n()
const toast = useToast()

// State
const statusFilter = ref<string>("all")
const showShareDialog = ref(false)
const showConflictDialog = ref(false)
const selectedSourceId = ref<string>("")
const isSharing = ref(false)
const currentUserId = ref("current-user") // TODO: Get from auth service

const sharePermissions = ref({
  canEdit: false,
  canSync: true,
  canDelete: false,
})

// Data
const teamSources = ref<TeamLiveSource[]>([])
const teamEvents = ref<TeamSyncEvent[]>([])
const activeConflicts = ref<ConflictResolution[]>([])
const availableSources = ref<LiveSpecSource[]>([])

// Computed
const filteredTeamSources = computed(() => {
  if (statusFilter.value === "all") {
    return teamSources.value
  }
  return teamSources.value.filter(
    (source) => source.status === statusFilter.value
  )
})

// Methods
function loadTeamSources() {
  teamSources.value = teamLiveSyncService.getTeamSources(props.teamId)
  activeConflicts.value = teamLiveSyncService.getActiveConflicts(props.teamId)
  teamEvents.value = teamLiveSyncService.getTeamSyncEvents(props.teamId, 20)
}

function loadAvailableSources() {
  availableSources.value = liveSpecSourceService.getSources()
}

function getFrameworkIcon(framework?: FrameworkType): string {
  const icons = {
    fastapi: "python",
    express: "nodejs",
    spring: "java",
    aspnet: "microsoft",
    django: "python",
    flask: "python",
    rails: "ruby",
    laravel: "php",
  }
  return framework ? icons[framework] || "code" : "code"
}

function getSourceStatus(source: TeamLiveSource): string {
  if (hasActiveConflicts(source.id)) return "error"
  return source.status
}

function getSourceUrl(source: TeamLiveSource): string {
  return source.url || source.filePath || "Unknown"
}

function getUserName(userId: string): string {
  // TODO: Get actual user name from user service
  return userId === currentUserId.value ? "You" : `User ${userId.slice(-4)}`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat().format(date)
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function hasActiveConflicts(sourceId: string): boolean {
  return activeConflicts.value.some(
    (conflict) => conflict.sourceId === sourceId
  )
}

function getEventIcon(eventType: string): string {
  const icons = {
    sync_started: "play",
    sync_completed: "check",
    sync_failed: "x",
    source_shared: "share",
    source_updated: "edit",
  }
  return icons[eventType] || "activity"
}

function getEventMessage(event: TeamSyncEvent): string {
  const userName = getUserName(event.userId)
  const source = teamSources.value.find((s) => s.id === event.sourceId)
  const sourceName = source?.name || "Unknown Source"

  switch (event.type) {
    case "sync_started":
      return `${userName} started syncing ${sourceName}`
    case "sync_completed":
      return `${userName} completed sync of ${sourceName}`
    case "sync_failed":
      return `${userName}'s sync of ${sourceName} failed`
    case "source_shared":
      return `${userName} shared ${sourceName} with the team`
    case "source_updated":
      return `${userName} updated ${sourceName}`
    default:
      return `${userName} performed an action on ${sourceName}`
  }
}

async function shareSource() {
  if (!selectedSourceId.value) return

  isSharing.value = true

  try {
    await teamLiveSyncService.shareSourceWithTeam(
      selectedSourceId.value,
      props.teamId,
      sharePermissions.value
    )

    toast.success(t("collections.source_shared_successfully"))
    showShareDialog.value = false
    selectedSourceId.value = ""
    sharePermissions.value = { canEdit: false, canSync: true, canDelete: false }

    loadTeamSources()
  } catch (error) {
    toast.error(t("collections.failed_to_share_source"))
  } finally {
    isSharing.value = false
  }
}

async function handleSync(source: TeamLiveSource) {
  try {
    await teamLiveSyncService.syncTeamSource(
      source.id,
      props.teamId,
      currentUserId.value
    )
    loadTeamSources()
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t("collections.sync_failed")
    )
  }
}

function handleRetry(source: TeamLiveSource) {
  handleSync(source)
}

function editSource(source: TeamLiveSource) {
  // TODO: Open source edit dialog
  console.log("Edit source:", source)
}

function showSourceMenu(source: TeamLiveSource) {
  // TODO: Show context menu
  console.log("Show menu for source:", source)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function showConflictResolution(_sourceId: string) {
  showConflictDialog.value = true
}

function handleConflictResolution(conflictId: string, resolution: string) {
  teamLiveSyncService.resolveConflict(conflictId, resolution)
  loadTeamSources()
}

function refreshActivity() {
  loadTeamSources()
}

// Lifecycle
onMounted(() => {
  loadTeamSources()
  loadAvailableSources()

  // Subscribe to team updates
  teamLiveSyncService.subscribeToTeamUpdates(props.teamId, currentUserId.value)
})
</script>

<style scoped>
.team-live-source-manager {
  @apply space-y-6;
}

.manager-header {
  @apply flex items-start justify-between pb-4 border-b border-gray-200 dark:border-gray-700;
}

.header-content h3 {
  @apply text-lg font-semibold mb-1;
}

.header-content p {
  @apply text-gray-600 dark:text-gray-400;
}

.header-actions {
  @apply flex gap-2;
}

.manager-content {
  @apply grid grid-cols-1 lg:grid-cols-3 gap-6;
}

.sources-section {
  @apply lg:col-span-2 space-y-4;
}

.activity-section {
  @apply space-y-4;
}

.section-header {
  @apply flex items-center justify-between;
}

.section-header h4 {
  @apply font-semibold;
}

.source-filters {
  @apply flex gap-2;
}

.filter-select {
  @apply px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm;
}

.empty-state {
  @apply text-center py-12;
}

.empty-icon {
  @apply w-12 h-12 mx-auto mb-4 text-gray-400;
}

.empty-state h5 {
  @apply font-semibold mb-2;
}

.empty-state p {
  @apply text-gray-600 dark:text-gray-400;
}

.sources-list {
  @apply space-y-4;
}

.source-item {
  @apply border border-gray-200 dark:border-gray-700 rounded-lg p-4;
}

.source-item.has-conflicts {
  @apply border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900 dark:bg-opacity-10;
}

.source-header {
  @apply flex items-start justify-between mb-3;
}

.source-title {
  @apply flex items-center gap-2;
}

.source-name {
  @apply font-medium;
}

.source-badges {
  @apply flex gap-2;
}

.badge {
  @apply px-2 py-1 text-xs font-medium rounded;
}

.badge.owner {
  @apply bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100;
}

.badge.conflict {
  @apply bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100;
}

.source-actions {
  @apply flex items-center gap-2;
}

.source-details {
  @apply space-y-2 text-sm text-gray-600 dark:text-gray-400;
}

.detail-item {
  @apply flex items-center gap-2;
}

.detail-item icon {
  @apply w-4 h-4 flex-shrink-0;
}

.conflict-alert {
  @apply flex items-center gap-2 mt-3 p-2 bg-orange-100 dark:bg-orange-900 dark:bg-opacity-20 rounded text-orange-800 dark:text-orange-200;
}

.activity-list {
  @apply space-y-3 max-h-96 overflow-y-auto;
}

.activity-item {
  @apply flex gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded;
}

.activity-icon {
  @apply flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center;
}

.activity-sync_started .activity-icon {
  @apply bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400;
}

.activity-sync_completed .activity-icon {
  @apply bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400;
}

.activity-sync_failed .activity-icon {
  @apply bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400;
}

.activity-source_shared .activity-icon {
  @apply bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400;
}

.activity-content {
  @apply flex-1;
}

.activity-message {
  @apply font-medium text-sm;
}

.activity-time {
  @apply text-xs text-gray-500 mt-1;
}

.share-dialog {
  @apply space-y-6;
}

.form-group {
  @apply space-y-2;
}

.form-group label {
  @apply block text-sm font-medium;
}

.form-select {
  @apply w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700;
}

.permissions-section {
  @apply space-y-4;
}

.permissions-section h5 {
  @apply font-semibold;
}

.permission-options {
  @apply space-y-3;
}

.permission-option {
  @apply flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800;
}

.permission-option input {
  @apply mt-1;
}

.permission-description {
  @apply text-sm text-gray-600 dark:text-gray-400 mt-1;
}

.dialog-actions {
  @apply flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700;
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

.btn-warning {
  @apply bg-orange-500 text-white hover:bg-orange-600;
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
