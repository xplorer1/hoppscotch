<template>
  <div class="change-highlight" :class="changeTypeClass">
    <div class="change-indicator" :title="changeTooltip">
      <icon :name="changeIcon" class="change-icon" />
      <span v-if="showLabel" class="change-label">{{ changeLabel }}</span>
    </div>

    <div v-if="showDetails" class="change-details">
      <div class="change-summary">
        <h4>{{ changeSummary }}</h4>
        <p class="change-description">{{ changeDescription }}</p>
      </div>

      <div v-if="endpointChanges.length > 0" class="endpoint-changes">
        <div
          v-for="change in endpointChanges"
          :key="change.path + change.method"
          class="endpoint-change"
          :class="getEndpointChangeClass(change)"
        >
          <div class="endpoint-info">
            <span class="method-badge" :class="change.method.toLowerCase()">
              {{ change.method.toUpperCase() }}
            </span>
            <span class="endpoint-path">{{ change.path }}</span>
          </div>

          <div class="change-type">
            <icon :name="getEndpointChangeIcon(change)" />
            <span>{{ getEndpointChangeLabel(change) }}</span>
          </div>

          <div v-if="change.isBreaking" class="breaking-badge">
            <icon name="alert-triangle" />
            Breaking
          </div>
        </div>
      </div>

      <div class="change-actions">
        <button
          v-if="canUndo"
          class="btn btn-secondary btn-sm"
          @click="$emit('undo')"
        >
          <icon name="undo" />
          Undo Changes
        </button>

        <button class="btn btn-primary btn-sm" @click="$emit('view-diff')">
          <icon name="eye" />
          View Full Diff
        </button>

        <button class="btn btn-ghost btn-sm" @click="$emit('dismiss')">
          <icon name="x" />
          Dismiss
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { SpecDiff, EndpointChange } from "../../types/spec-diff"

interface Props {
  changes: SpecDiff
  showDetails?: boolean
  showLabel?: boolean
  canUndo?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showDetails: false,
  showLabel: true,
  canUndo: false,
})

defineEmits<{
  undo: []
  "view-diff": []
  dismiss: []
}>()

const endpointChanges = computed(() => props.changes.endpoints || [])

const hasBreakingChanges = computed(() =>
  endpointChanges.value.some((change) => change.isBreaking)
)

const changeTypeClass = computed(() => {
  if (hasBreakingChanges.value) return "change-breaking"

  const hasModifications = endpointChanges.value.some(
    (c) => c.type === "modified"
  )
  const hasAdditions = endpointChanges.value.some((c) => c.type === "added")
  const hasRemovals = endpointChanges.value.some((c) => c.type === "removed")

  if (hasRemovals) return "change-removed"
  if (hasModifications) return "change-modified"
  if (hasAdditions) return "change-added"

  return "change-none"
})

const changeIcon = computed(() => {
  if (hasBreakingChanges.value) return "alert-triangle"

  const hasModifications = endpointChanges.value.some(
    (c) => c.type === "modified"
  )
  const hasAdditions = endpointChanges.value.some((c) => c.type === "added")
  const hasRemovals = endpointChanges.value.some((c) => c.type === "removed")

  if (hasRemovals) return "minus-circle"
  if (hasModifications) return "edit"
  if (hasAdditions) return "plus-circle"

  return "check-circle"
})

const changeLabel = computed(() => {
  const count = endpointChanges.value.length
  if (count === 0) return "Up to date"

  if (hasBreakingChanges.value) return "Breaking changes"

  return `${count} change${count === 1 ? "" : "s"}`
})

const changeTooltip = computed(() => {
  const count = endpointChanges.value.length
  if (count === 0) return "No changes detected"

  const added = endpointChanges.value.filter((c) => c.type === "added").length
  const modified = endpointChanges.value.filter(
    (c) => c.type === "modified"
  ).length
  const removed = endpointChanges.value.filter(
    (c) => c.type === "removed"
  ).length
  const breaking = endpointChanges.value.filter((c) => c.isBreaking).length

  const parts = []
  if (added > 0) parts.push(`${added} added`)
  if (modified > 0) parts.push(`${modified} modified`)
  if (removed > 0) parts.push(`${removed} removed`)
  if (breaking > 0) parts.push(`${breaking} breaking`)

  return parts.join(", ")
})

const changeSummary = computed(() => {
  const count = endpointChanges.value.length
  if (hasBreakingChanges.value) {
    return `Breaking Changes Detected (${count} endpoint${count === 1 ? "" : "s"})`
  }
  return `API Updated (${count} endpoint${count === 1 ? "" : "s"} changed)`
})

const changeDescription = computed(() => {
  if (hasBreakingChanges.value) {
    return "These changes may break existing requests. Review carefully before applying."
  }
  return "Your API code has been updated. Changes have been synchronized to your collection."
})

function getEndpointChangeClass(change: EndpointChange): string {
  const classes = [`change-${change.type}`]
  if (change.isBreaking) classes.push("breaking")
  return classes.join(" ")
}

function getEndpointChangeIcon(change: EndpointChange): string {
  switch (change.type) {
    case "added":
      return "plus"
    case "removed":
      return "minus"
    case "modified":
      return "edit"
    default:
      return "circle"
  }
}

function getEndpointChangeLabel(change: EndpointChange): string {
  switch (change.type) {
    case "added":
      return "Added"
    case "removed":
      return "Removed"
    case "modified":
      return "Modified"
    default:
      return "Changed"
  }
}
</script>

<style scoped>
.change-highlight {
  @apply border-l-4 bg-opacity-10 rounded-r;
}

.change-highlight.change-added {
  @apply border-green-500 bg-green-500;
}

.change-highlight.change-modified {
  @apply border-blue-500 bg-blue-500;
}

.change-highlight.change-removed {
  @apply border-red-500 bg-red-500;
}

.change-highlight.change-breaking {
  @apply border-orange-500 bg-orange-500;
}

.change-highlight.change-none {
  @apply border-gray-300 bg-gray-300;
}

.change-indicator {
  @apply flex items-center gap-2 p-2 cursor-pointer;
}

.change-icon {
  @apply w-4 h-4;
}

.change-label {
  @apply text-sm font-medium;
}

.change-details {
  @apply p-4 border-t border-gray-200 dark:border-gray-700;
}

.change-summary h4 {
  @apply text-lg font-semibold mb-1;
}

.change-description {
  @apply text-sm text-gray-600 dark:text-gray-400 mb-4;
}

.endpoint-changes {
  @apply space-y-2 mb-4;
}

.endpoint-change {
  @apply flex items-center justify-between p-3 rounded border;
}

.endpoint-change.change-added {
  @apply bg-green-50 border-green-200 dark:bg-green-900 dark:bg-opacity-20 dark:border-green-800;
}

.endpoint-change.change-modified {
  @apply bg-blue-50 border-blue-200 dark:bg-blue-900 dark:bg-opacity-20 dark:border-blue-800;
}

.endpoint-change.change-removed {
  @apply bg-red-50 border-red-200 dark:bg-red-900 dark:bg-opacity-20 dark:border-red-800;
}

.endpoint-change.breaking {
  @apply ring-2 ring-orange-300 dark:ring-orange-600;
}

.endpoint-info {
  @apply flex items-center gap-2;
}

.method-badge {
  @apply px-2 py-1 text-xs font-mono font-bold rounded uppercase;
}

.method-badge.get {
  @apply bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100;
}
.method-badge.post {
  @apply bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100;
}
.method-badge.put {
  @apply bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100;
}
.method-badge.patch {
  @apply bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100;
}
.method-badge.delete {
  @apply bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100;
}

.endpoint-path {
  @apply font-mono text-sm;
}

.change-type {
  @apply flex items-center gap-1 text-sm;
}

.breaking-badge {
  @apply flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100 rounded text-xs font-medium;
}

.change-actions {
  @apply flex gap-2 justify-end;
}

.btn {
  @apply px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1;
}

.btn-sm {
  @apply text-sm px-2 py-1;
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
