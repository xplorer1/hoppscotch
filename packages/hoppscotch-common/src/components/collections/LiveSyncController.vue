<template>
  <div class="live-sync-controller">
    <!-- Global Live Sync Status -->
    <div class="live-sync-header">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div
            class="w-3 h-3 rounded-full"
            :class="globalStatus.isActive ? 'bg-green-500' : 'bg-gray-400'"
          />
          <h3 class="text-lg font-semibold">Live Sync</h3>
          <span class="text-sm text-gray-500">
            {{ globalStatus.activeSessions }} active
          </span>
        </div>

        <button
          class="px-4 py-2 rounded-md text-sm font-medium"
          :class="
            globalStatus.isActive
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          "
          @click="toggleGlobalLiveSync"
        >
          {{ globalStatus.isActive ? "Stop All" : "Start All" }}
        </button>
      </div>
    </div>

    <!-- Active Sessions List -->
    <div v-if="activeSessions.length > 0" class="active-sessions">
      <h4 class="text-md font-medium mb-3">Active Sources</h4>

      <div class="space-y-3">
        <div
          v-for="session in activeSessions"
          :key="session.sourceId"
          class="session-card p-4 border rounded-lg"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center space-x-2">
                <div
                  class="w-2 h-2 rounded-full"
                  :class="getStatusColor(session.status)"
                />
                <span class="font-medium">{{ session.source.name }}</span>
                <span class="text-xs text-gray-500">
                  {{ session.source.type }}
                </span>
              </div>

              <div class="text-sm text-gray-600 mt-1">
                <span
                  >Poll: {{ formatPollInterval(session.pollInterval) }}</span
                >
                <span class="mx-2">•</span>
                <span>Started: {{ formatTime(session.startedAt) }}</span>
                <span v-if="session.lastSyncAt" class="mx-2">•</span>
                <span v-if="session.lastSyncAt">
                  Last sync: {{ formatTime(session.lastSyncAt) }}
                </span>
              </div>
            </div>

            <div class="flex items-center space-x-2">
              <!-- Manual Sync Button -->
              <button
                class="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="Manual Sync"
                @click="triggerManualSync(session.sourceId)"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>

              <!-- Pause/Resume Button -->
              <button
                class="p-2 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded"
                :title="session.status === 'active' ? 'Pause' : 'Resume'"
                @click="toggleSession(session.sourceId, session.status)"
              >
                <svg
                  v-if="session.status === 'active'"
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <svg
                  v-else
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6-8h1m4 0h1M9 6h1m4 0h1M9 2h1m4 0h1"
                  />
                </svg>
              </button>

              <!-- Settings Button -->
              <button
                class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded"
                title="Settings"
                @click="showSettings(session.sourceId)"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>

              <!-- Stop Button -->
              <button
                class="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                title="Stop"
                @click="stopSession(session.sourceId)"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 10h6v4H9z"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Error Display -->
          <div v-if="session.errorCount > 0" class="mt-2 text-sm text-red-600">
            {{ session.errorCount }} error(s) occurred
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state text-center py-8">
      <div class="text-gray-400 mb-4">
        <svg
          class="w-12 h-12 mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>
      <h3 class="text-lg font-medium text-gray-900 mb-2">
        No Active Live Sync
      </h3>
      <p class="text-gray-500 mb-4">
        Start live sync on your API sources to automatically detect changes
      </p>
      <button
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        @click="showSourceSelector"
      >
        Add Live Source
      </button>
    </div>

    <!-- Global Stats -->
    <div class="global-stats mt-6 p-4 bg-gray-50 rounded-lg">
      <div class="grid grid-cols-3 gap-4 text-center">
        <div>
          <div class="text-2xl font-bold text-blue-600">
            {{ globalStats.totalSessions }}
          </div>
          <div class="text-sm text-gray-600">Total Sessions</div>
        </div>
        <div>
          <div class="text-2xl font-bold text-green-600">
            {{ globalStats.totalSyncsToday }}
          </div>
          <div class="text-sm text-gray-600">Syncs Today</div>
        </div>
        <div>
          <div class="text-2xl font-bold text-purple-600">
            {{ pollingStats.totalActivePolls }}
          </div>
          <div class="text-sm text-gray-600">Active Polls</div>
        </div>
      </div>

      <div
        v-if="globalStats.lastActivity"
        class="text-center mt-3 text-sm text-gray-500"
      >
        Last activity: {{ formatTime(globalStats.lastActivity) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { liveSyncOrchestratorService } from "~/services/live-sync-orchestrator.service"
import { liveSyncManagerService } from "~/services/live-sync-manager.service"

// Reactive state
const comprehensiveStatus = ref(
  liveSyncOrchestratorService.getComprehensiveStatus()
)

// Computed properties
const globalStatus = computed(
  () => comprehensiveStatus.value.manager.globalStats
)
const globalStats = computed(
  () => comprehensiveStatus.value.manager.globalStats
)
const pollingStats = computed(() => comprehensiveStatus.value.polling.stats)
const activeSessions = computed(
  () => comprehensiveStatus.value.manager.activeSessions.value
)

// Methods
const toggleGlobalLiveSync = async () => {
  if (globalStatus.value.isGloballyEnabled) {
    await liveSyncManagerService.stopAllLiveSync()
  } else {
    liveSyncManagerService.setGlobalEnabled(true)
  }
  updateStatus()
}

const triggerManualSync = async (sourceId: string) => {
  await liveSyncOrchestratorService.triggerManualSyncAndUpdate(sourceId)
  updateStatus()
}

const toggleSession = async (sourceId: string, currentStatus: string) => {
  if (currentStatus === "active") {
    await liveSyncManagerService.pauseLiveSync(sourceId)
  } else {
    await liveSyncManagerService.resumeLiveSync(sourceId)
  }
  updateStatus()
}

const stopSession = async (sourceId: string) => {
  await liveSyncOrchestratorService.stopCompleteLiveSync(sourceId)
  updateStatus()
}

const showSettings = (sourceId: string) => {
  // This would open a settings dialog
  console.log("Show settings for:", sourceId)
}

const showSourceSelector = () => {
  // This would open the LiveSyncImporter component
  console.log("Show source selector")
}

// Utility functions
const getStatusColor = (status: string) => {
  switch (status) {
    case "active":
      return "bg-green-500"
    case "paused":
      return "bg-yellow-500"
    case "error":
      return "bg-red-500"
    default:
      return "bg-gray-400"
  }
}

const formatPollInterval = (interval: number) => {
  const seconds = interval / 1000
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m`
}

const formatTime = (date: Date) => {
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    Math.floor((date.getTime() - Date.now()) / 1000),
    "second"
  )
}

const updateStatus = () => {
  comprehensiveStatus.value =
    liveSyncOrchestratorService.getComprehensiveStatus()
}

// Lifecycle
let statusUpdateInterval: NodeJS.Timeout

onMounted(() => {
  updateStatus()
  // Update status every 5 seconds
  statusUpdateInterval = setInterval(updateStatus, 5000)
})

onUnmounted(() => {
  if (statusUpdateInterval) {
    clearInterval(statusUpdateInterval)
  }
})
</script>

<style scoped>
.live-sync-controller {
  @apply space-y-6;
}

.live-sync-header {
  @apply pb-4 border-b border-gray-200;
}

.session-card {
  @apply transition-all duration-200 hover:shadow-md;
}

.session-card:hover {
  @apply border-blue-200;
}

.empty-state {
  @apply border-2 border-dashed border-gray-300 rounded-lg;
}

.global-stats {
  @apply border border-gray-200;
}
</style>
