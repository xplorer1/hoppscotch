<template>
  <HoppModal
    :title="t('collections.resolve_conflicts')"
    @close="$emit('close')"
  >
    <div class="conflict-resolution-dialog">
      <div v-if="conflicts.length === 0" class="no-conflicts">
        <icon name="check-circle" class="success-icon" />
        <h4>{{ t("collections.no_active_conflicts") }}</h4>
        <p>{{ t("collections.all_conflicts_resolved") }}</p>
      </div>

      <div v-else class="conflicts-list">
        <div
          v-for="conflict in conflicts"
          :key="conflict.conflictId"
          class="conflict-item"
          :class="`conflict-${conflict.conflictType}`"
        >
          <div class="conflict-header">
            <div class="conflict-info">
              <icon :name="getConflictIcon(conflict.conflictType)" />
              <div class="conflict-details">
                <h5>{{ getConflictTitle(conflict.conflictType) }}</h5>
                <p>{{ conflict.description }}</p>
              </div>
            </div>
            <div class="conflict-badge">
              {{ getConflictTypeLabel(conflict.conflictType) }}
            </div>
          </div>

          <div class="conflict-content">
            <div
              v-if="conflict.conflictType === 'concurrent_sync'"
              class="concurrent-conflict"
            >
              <div class="conflict-explanation">
                <icon name="users" />
                <span>{{ t("collections.concurrent_sync_explanation") }}</span>
              </div>
            </div>

            <div
              v-else-if="conflict.conflictType === 'user_vs_code_changes'"
              class="user-code-conflict"
            >
              <div class="conflict-sides">
                <div class="conflict-side">
                  <h6>{{ t("collections.team_changes") }}</h6>
                  <div class="change-preview">
                    <icon name="users" />
                    <span>{{
                      t("collections.team_member_modifications")
                    }}</span>
                  </div>
                </div>

                <div class="conflict-divider">
                  <icon name="zap" />
                </div>

                <div class="conflict-side">
                  <h6>{{ t("collections.code_changes") }}</h6>
                  <div class="change-preview">
                    <icon name="code" />
                    <span>{{
                      t("collections.development_server_updates")
                    }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else-if="conflict.conflictType === 'breaking_changes'"
              class="breaking-conflict"
            >
              <div class="breaking-warning">
                <icon name="alert-triangle" />
                <span>{{ t("collections.breaking_changes_warning") }}</span>
              </div>
            </div>
          </div>

          <div class="conflict-actions">
            <div class="resolution-options">
              <div
                v-for="option in conflict.options"
                :key="option.id"
                class="resolution-option"
              >
                <button
                  class="resolution-button"
                  :class="getResolutionButtonClass(option.id)"
                  @click="resolveConflict(conflict.conflictId, option)"
                >
                  <icon :name="getResolutionIcon(option.id)" />
                  <div class="resolution-content">
                    <span class="resolution-label">{{ option.label }}</span>
                    <span class="resolution-description">{{
                      option.description
                    }}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="$emit('close')">
          {{ t("action.close") }}
        </button>

        <button
          v-if="conflicts.length > 0"
          class="btn btn-ghost"
          @click="resolveAllConflicts"
        >
          {{ t("collections.resolve_all_automatically") }}
        </button>
      </div>
    </div>
  </HoppModal>
</template>

<script setup lang="ts">
import { useI18n } from "~/composables/i18n"
import { useToast } from "~/composables/toast"
import type { ConflictResolution } from "../../services/team-live-sync.service"

interface Props {
  conflicts: ConflictResolution[]
}

const props = defineProps<Props>()

defineEmits<{
  resolve: [conflictId: string, resolution: string]
  close: []
}>()

const t = useI18n()
const toast = useToast()

function getConflictIcon(conflictType: string): string {
  const icons = {
    concurrent_sync: "users",
    user_vs_code_changes: "git-merge",
    breaking_changes: "alert-triangle",
  }
  return icons[conflictType] || "alert-circle"
}

function getConflictTitle(conflictType: string): string {
  const titles = {
    concurrent_sync: t("collections.concurrent_sync_conflict"),
    user_vs_code_changes: t("collections.user_code_conflict"),
    breaking_changes: t("collections.breaking_changes_conflict"),
  }
  return titles[conflictType] || t("collections.unknown_conflict")
}

function getConflictTypeLabel(conflictType: string): string {
  const labels = {
    concurrent_sync: t("collections.concurrent"),
    user_vs_code_changes: t("collections.merge_conflict"),
    breaking_changes: t("collections.breaking"),
  }
  return labels[conflictType] || t("collections.conflict")
}

function getResolutionButtonClass(optionId: string): string {
  const classes = {
    keep_user_changes: "resolution-keep",
    apply_code_changes: "resolution-apply",
    merge_changes: "resolution-merge",
    wait_and_retry: "resolution-wait",
    cancel_sync: "resolution-cancel",
  }
  return classes[optionId] || "resolution-default"
}

function getResolutionIcon(optionId: string): string {
  const icons = {
    keep_user_changes: "shield",
    apply_code_changes: "download",
    merge_changes: "git-merge",
    wait_and_retry: "clock",
    cancel_sync: "x",
  }
  return icons[optionId] || "circle"
}

async function resolveConflict(
  conflictId: string,
  option: ConflictResolution["options"][0]
) {
  try {
    await option.action()
    emit("resolve", conflictId, option.id)

    toast.success(t("collections.conflict_resolved"))
  } catch (error) {
    toast.error(t("collections.conflict_resolution_failed"))
  }
}

function resolveAllConflicts() {
  // Auto-resolve all conflicts with safe defaults
  props.conflicts.forEach((conflict) => {
    // Choose the safest option (usually the first one)
    const safeOption = conflict.options[0]
    if (safeOption) {
      resolveConflict(conflict.conflictId, safeOption)
    }
  })
}
</script>

<style scoped>
.conflict-resolution-dialog {
  @apply space-y-6 max-w-2xl;
}

.no-conflicts {
  @apply text-center py-8;
}

.success-icon {
  @apply w-16 h-16 mx-auto mb-4 text-green-500;
}

.no-conflicts h4 {
  @apply text-lg font-semibold mb-2;
}

.no-conflicts p {
  @apply text-gray-600 dark:text-gray-400;
}

.conflicts-list {
  @apply space-y-6;
}

.conflict-item {
  @apply border rounded-lg overflow-hidden;
}

.conflict-concurrent_sync {
  @apply border-blue-200 dark:border-blue-800;
}

.conflict-user_vs_code_changes {
  @apply border-orange-200 dark:border-orange-800;
}

.conflict-breaking_changes {
  @apply border-red-200 dark:border-red-800;
}

.conflict-header {
  @apply flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-800;
}

.conflict-info {
  @apply flex gap-3;
}

.conflict-info icon {
  @apply w-5 h-5 mt-1 flex-shrink-0;
}

.conflict-details h5 {
  @apply font-semibold mb-1;
}

.conflict-details p {
  @apply text-sm text-gray-600 dark:text-gray-400;
}

.conflict-badge {
  @apply px-2 py-1 text-xs font-medium rounded bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200;
}

.conflict-content {
  @apply p-4;
}

.concurrent-conflict,
.breaking-conflict {
  @apply flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900 dark:bg-opacity-20 rounded text-blue-800 dark:text-blue-200;
}

.user-code-conflict {
  @apply space-y-4;
}

.conflict-sides {
  @apply grid grid-cols-3 gap-4 items-center;
}

.conflict-side {
  @apply text-center;
}

.conflict-side h6 {
  @apply font-semibold mb-2;
}

.change-preview {
  @apply flex items-center justify-center gap-2 p-3 bg-gray-100 dark:bg-gray-700 rounded;
}

.conflict-divider {
  @apply flex justify-center;
}

.conflict-divider icon {
  @apply w-6 h-6 text-orange-500;
}

.breaking-warning {
  @apply flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900 dark:bg-opacity-20 rounded text-red-800 dark:text-red-200;
}

.conflict-actions {
  @apply p-4 border-t border-gray-200 dark:border-gray-700;
}

.resolution-options {
  @apply space-y-3;
}

.resolution-option {
  @apply w-full;
}

.resolution-button {
  @apply w-full flex items-start gap-3 p-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition-colors text-left;
}

.resolution-button:hover {
  @apply bg-gray-50 dark:bg-gray-800;
}

.resolution-keep {
  @apply border-blue-200 dark:border-blue-800;
}

.resolution-apply {
  @apply border-green-200 dark:border-green-800;
}

.resolution-merge {
  @apply border-purple-200 dark:border-purple-800;
}

.resolution-wait {
  @apply border-yellow-200 dark:border-yellow-800;
}

.resolution-cancel {
  @apply border-red-200 dark:border-red-800;
}

.resolution-content {
  @apply flex-1;
}

.resolution-label {
  @apply block font-medium mb-1;
}

.resolution-description {
  @apply block text-sm text-gray-600 dark:text-gray-400;
}

.dialog-footer {
  @apply flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700;
}

.btn {
  @apply px-4 py-2 rounded font-medium transition-colors;
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
</style>
