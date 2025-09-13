<template>
  <div class="diff-viewer">
    <div class="diff-header">
      <div class="diff-title">
        <h3>API Changes</h3>
        <p class="diff-subtitle">
          Comparing {{ sourceName }} with current collection
        </p>
      </div>

      <div class="diff-stats">
        <div class="stat stat-added">
          <icon name="plus" />
          <span>{{ stats.added }} Added</span>
        </div>
        <div class="stat stat-modified">
          <icon name="edit" />
          <span>{{ stats.modified }} Modified</span>
        </div>
        <div class="stat stat-removed">
          <icon name="minus" />
          <span>{{ stats.removed }} Removed</span>
        </div>
        <div v-if="stats.breaking > 0" class="stat stat-breaking">
          <icon name="alert-triangle" />
          <span>{{ stats.breaking }} Breaking</span>
        </div>
      </div>
    </div>

    <div class="diff-content">
      <div class="diff-filters">
        <div class="filter-group">
          <label class="filter-label">Show:</label>
          <label class="filter-checkbox">
            <input v-model="filters.added" type="checkbox" />
            <span>Added</span>
          </label>
          <label class="filter-checkbox">
            <input v-model="filters.modified" type="checkbox" />
            <span>Modified</span>
          </label>
          <label class="filter-checkbox">
            <input v-model="filters.removed" type="checkbox" />
            <span>Removed</span>
          </label>
          <label class="filter-checkbox">
            <input v-model="filters.breakingOnly" type="checkbox" />
            <span>Breaking Only</span>
          </label>
        </div>
      </div>

      <div class="diff-list">
        <div
          v-for="change in filteredChanges"
          :key="change.path + change.method"
          class="diff-item"
          :class="getDiffItemClass(change)"
        >
          <div class="diff-item-header" @click="toggleExpanded(change)">
            <div class="endpoint-info">
              <span class="method-badge" :class="change.method.toLowerCase()">
                {{ change.method.toUpperCase() }}
              </span>
              <span class="endpoint-path">{{ change.path }}</span>
              <div class="change-badges">
                <span class="change-badge" :class="change.type">
                  {{ getChangeLabel(change.type) }}
                </span>
                <span v-if="change.isBreaking" class="breaking-badge">
                  Breaking
                </span>
              </div>
            </div>

            <div class="expand-toggle">
              <icon
                :name="isExpanded(change) ? 'chevron-down' : 'chevron-right'"
              />
            </div>
          </div>

          <div v-if="isExpanded(change)" class="diff-item-content">
            <div v-if="change.summary" class="change-summary">
              <h5>Summary</h5>
              <p>{{ change.summary }}</p>
            </div>

            <div
              v-if="change.details && change.details.length > 0"
              class="change-details"
            >
              <h5>Changes</h5>
              <ul class="change-list">
                <li
                  v-for="detail in change.details"
                  :key="detail.field"
                  class="change-detail"
                  :class="{ breaking: detail.isBreaking }"
                >
                  <div class="detail-field">
                    <code>{{ detail.field }}</code>
                    <span v-if="detail.isBreaking" class="breaking-indicator">
                      <icon name="alert-triangle" />
                    </span>
                  </div>
                  <div class="detail-change">
                    <div v-if="detail.oldValue !== undefined" class="old-value">
                      <span class="label">Before:</span>
                      <code>{{ formatValue(detail.oldValue) }}</code>
                    </div>
                    <div v-if="detail.newValue !== undefined" class="new-value">
                      <span class="label">After:</span>
                      <code>{{ formatValue(detail.newValue) }}</code>
                    </div>
                  </div>
                </li>
              </ul>
            </div>

            <div
              v-if="change.type === 'added' && change.newEndpoint"
              class="endpoint-preview"
            >
              <h5>New Endpoint</h5>
              <div class="endpoint-details">
                <div v-if="change.newEndpoint.summary" class="endpoint-summary">
                  <strong>{{ change.newEndpoint.summary }}</strong>
                </div>
                <div
                  v-if="change.newEndpoint.description"
                  class="endpoint-description"
                >
                  {{ change.newEndpoint.description }}
                </div>
                <div
                  v-if="change.newEndpoint.parameters?.length"
                  class="endpoint-parameters"
                >
                  <h6>Parameters</h6>
                  <ul>
                    <li
                      v-for="param in change.newEndpoint.parameters"
                      :key="param.name"
                    >
                      <code>{{ param.name }}</code>
                      <span class="param-type">({{ param.type }})</span>
                      <span v-if="param.required" class="required">*</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="diff-actions">
      <button class="btn btn-secondary" @click="$emit('close')">Close</button>
      <button
        v-if="hasBreakingChanges"
        class="btn btn-warning"
        @click="$emit('skip-breaking')"
      >
        Skip Breaking Changes
      </button>
      <button class="btn btn-primary" @click="$emit('apply-changes')">
        Apply Changes
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import type { SpecDiff, EndpointChange } from "../../types/spec-diff"

interface Props {
  diff: SpecDiff
  sourceName: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  "apply-changes": []
  "skip-breaking": []
}>()

const expandedItems = ref<Set<string>>(new Set())

const filters = reactive({
  added: true,
  modified: true,
  removed: true,
  breakingOnly: false,
})

const stats = computed(() => {
  const endpoints = props.diff.endpoints || []
  return {
    added: endpoints.filter((e) => e.type === "added").length,
    modified: endpoints.filter((e) => e.type === "modified").length,
    removed: endpoints.filter((e) => e.type === "removed").length,
    breaking: endpoints.filter((e) => e.isBreaking).length,
  }
})

const hasBreakingChanges = computed(() => stats.value.breaking > 0)

const filteredChanges = computed(() => {
  let changes = props.diff.endpoints || []

  // Filter by type
  changes = changes.filter((change) => {
    if (filters.breakingOnly && !change.isBreaking) return false

    switch (change.type) {
      case "added":
        return filters.added
      case "modified":
        return filters.modified
      case "removed":
        return filters.removed
      default:
        return true
    }
  })

  return changes
})

function getDiffItemClass(change: EndpointChange): string {
  const classes = [`diff-${change.type}`]
  if (change.isBreaking) classes.push("breaking")
  return classes.join(" ")
}

function getChangeLabel(type: string): string {
  switch (type) {
    case "added":
      return "Added"
    case "modified":
      return "Modified"
    case "removed":
      return "Removed"
    default:
      return "Changed"
  }
}

function getItemKey(change: EndpointChange): string {
  return `${change.method}:${change.path}`
}

function isExpanded(change: EndpointChange): boolean {
  return expandedItems.value.has(getItemKey(change))
}

function toggleExpanded(change: EndpointChange): void {
  const key = getItemKey(change)
  if (expandedItems.value.has(key)) {
    expandedItems.value.delete(key)
  } else {
    expandedItems.value.add(key)
  }
}

function formatValue(value: any): string {
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}
</script>

<style scoped>
.diff-viewer {
  @apply bg-white dark:bg-gray-900 rounded-lg shadow-lg max-w-4xl mx-auto;
}

.diff-header {
  @apply p-6 border-b border-gray-200 dark:border-gray-700;
}

.diff-title h3 {
  @apply text-xl font-semibold mb-1;
}

.diff-subtitle {
  @apply text-gray-600 dark:text-gray-400;
}

.diff-stats {
  @apply flex gap-4 mt-4;
}

.stat {
  @apply flex items-center gap-2 px-3 py-2 rounded text-sm font-medium;
}

.stat-added {
  @apply bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100;
}

.stat-modified {
  @apply bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100;
}

.stat-removed {
  @apply bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100;
}

.stat-breaking {
  @apply bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100;
}

.diff-content {
  @apply p-6;
}

.diff-filters {
  @apply mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded;
}

.filter-group {
  @apply flex items-center gap-4;
}

.filter-label {
  @apply font-medium text-sm;
}

.filter-checkbox {
  @apply flex items-center gap-2 text-sm cursor-pointer;
}

.filter-checkbox input {
  @apply rounded;
}

.diff-list {
  @apply space-y-4;
}

.diff-item {
  @apply border rounded-lg overflow-hidden;
}

.diff-item.diff-added {
  @apply border-green-200 dark:border-green-800;
}

.diff-item.diff-modified {
  @apply border-blue-200 dark:border-blue-800;
}

.diff-item.diff-removed {
  @apply border-red-200 dark:border-red-800;
}

.diff-item.breaking {
  @apply ring-2 ring-orange-300 dark:ring-orange-600;
}

.diff-item-header {
  @apply p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between;
}

.endpoint-info {
  @apply flex items-center gap-3;
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

.change-badges {
  @apply flex gap-2;
}

.change-badge {
  @apply px-2 py-1 text-xs font-medium rounded;
}

.change-badge.added {
  @apply bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100;
}

.change-badge.modified {
  @apply bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100;
}

.change-badge.removed {
  @apply bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100;
}

.breaking-badge {
  @apply px-2 py-1 text-xs font-medium rounded bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100;
}

.expand-toggle {
  @apply text-gray-400;
}

.diff-item-content {
  @apply p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800;
}

.change-summary h5,
.change-details h5,
.endpoint-preview h5 {
  @apply font-semibold mb-2;
}

.change-summary {
  @apply mb-4;
}

.change-list {
  @apply space-y-3;
}

.change-detail {
  @apply p-3 bg-white dark:bg-gray-900 rounded border;
}

.change-detail.breaking {
  @apply border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900 dark:bg-opacity-20;
}

.detail-field {
  @apply flex items-center gap-2 mb-2;
}

.detail-field code {
  @apply font-mono text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded;
}

.breaking-indicator {
  @apply text-orange-500;
}

.detail-change {
  @apply space-y-1;
}

.old-value,
.new-value {
  @apply flex items-start gap-2;
}

.label {
  @apply text-sm font-medium text-gray-600 dark:text-gray-400 min-w-16;
}

.old-value code {
  @apply bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100;
}

.new-value code {
  @apply bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100;
}

.endpoint-preview {
  @apply mt-4;
}

.endpoint-details {
  @apply space-y-2;
}

.endpoint-summary {
  @apply text-lg;
}

.endpoint-description {
  @apply text-gray-600 dark:text-gray-400;
}

.endpoint-parameters h6 {
  @apply font-medium mb-1;
}

.endpoint-parameters ul {
  @apply space-y-1;
}

.param-type {
  @apply text-gray-500 text-sm;
}

.required {
  @apply text-red-500 font-bold;
}

.diff-actions {
  @apply p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3;
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

.btn-warning {
  @apply bg-orange-500 text-white hover:bg-orange-600;
}
</style>
