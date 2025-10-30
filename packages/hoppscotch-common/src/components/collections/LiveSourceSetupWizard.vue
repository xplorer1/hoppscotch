<template>
  <div class="live-source-setup-wizard">
    <div class="wizard-header">
      <h3>Setup Live Sync</h3>
      <p>Configure your live synchronization settings</p>
    </div>

    <div class="wizard-content">
      <div class="setup-form">
        <div class="form-group">
          <label>Collection Name</label>
          <input
            v-model="config.collectionName"
            type="text"
            placeholder="Enter a name for this live sync collection"
            class="form-input"
          />
        </div>

        <div class="form-group">
          <label>Sync Frequency</label>
          <select v-model="config.syncFrequency" class="form-select">
            <option value="realtime">Real-time</option>
            <option value="5s">Every 5 seconds</option>
            <option value="30s">Every 30 seconds</option>
            <option value="manual">Manual only</option>
          </select>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              v-model="config.preserveCustomizations"
              type="checkbox"
              class="form-checkbox"
            />
            Preserve Customizations
          </label>
          <p class="help-text">
            Keep your custom headers, auth, and scripts when syncing
          </p>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              v-model="config.autoImport"
              type="checkbox"
              class="form-checkbox"
            />
            Auto Import Changes
          </label>
          <p class="help-text">
            Automatically import new endpoints when detected
          </p>
        </div>
      </div>

      <div class="wizard-actions">
        <button class="btn btn-secondary" @click="handleCancel">Cancel</button>
        <button
          :disabled="!canSetup || isLoading"
          class="btn btn-primary"
          @click="handleSetup"
        >
          <icon v-if="isLoading" name="loader" class="animate-spin" />
          Setup Live Sync
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue"
// import { useI18n } from "@composables/i18n"
import type { LiveSpecSource } from "../../types/live-spec-source"
import { liveSpecSourceService } from "../../services/live-spec-source.service"

interface Props {
  initialConfig?: Partial<LiveSpecSource>
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  initialConfig: () => ({}),
  isLoading: false,
})

// Define emits explicitly
const emit = defineEmits<{
  (e: "setup-complete", source: LiveSpecSource): void
  (e: "cancel"): void
}>()

// const t = useI18n()

// Store emit function to avoid scoping issues

const config = reactive({
  collectionName:
    props.initialConfig?.name || props.initialConfig?.specTitle || "",
  syncFrequency: "realtime",
  preserveCustomizations: true,
  autoImport: true,
  ...props.initialConfig,
})

const canSetup = computed(() => {
  return config.collectionName.trim().length > 0
})

// Watch for specTitle updates to auto-fill collection name
watch(
  () => props.initialConfig?.specTitle,
  (specTitle) => {
    if (specTitle && !config.collectionName.trim()) {
      config.collectionName = specTitle
    }
  },
  { immediate: true }
)

async function handleSetup() {
  if (!canSetup.value) return

  try {
    const sourceType = props.initialConfig?.type || "url"

    // Create proper config based on source type
    const sourceConfig =
      sourceType === "url"
        ? {
            url: props.initialConfig?.url || "",
            pollInterval:
              config.syncFrequency === "realtime"
                ? 5000 // Real-time set to 5s minimum due to validation
                : config.syncFrequency === "5s"
                  ? 5000
                  : config.syncFrequency === "30s"
                    ? 30000
                    : 5000, // Default to 5s minimum
            timeout: 10000,
            headers: {},
          }
        : {
            filePath: props.initialConfig?.filePath || "",
            watchEnabled: true,
          }

    const source = {
      name: config.collectionName,
      type: sourceType,
      status: "disconnected" as const,
      config: sourceConfig,
      syncStrategy: "replace-all" as const,
    }

    // Register the source with the service
    const registeredSource = await liveSpecSourceService.registerSource(source)

    emit("setup-complete", registeredSource)
  } catch (error) {
    console.error("Failed to setup live source:", error)
  }
}

function handleCancel() {
  emit("cancel")
}
</script>

<style scoped>
.live-source-setup-wizard {
  @apply space-y-6;
}

.wizard-header {
  @apply text-center space-y-2;
}

.wizard-header h3 {
  @apply text-lg font-semibold;
}

.wizard-header p {
  @apply text-gray-600 dark:text-gray-400;
}

.wizard-content {
  @apply space-y-6;
}

.setup-form {
  @apply space-y-4;
}

.form-group {
  @apply space-y-2;
}

.form-group label {
  @apply block text-sm font-medium;
}

.form-input,
.form-select {
  @apply w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500;
}

.checkbox-label {
  @apply flex items-start gap-2 cursor-pointer;
}

.form-checkbox {
  @apply mt-1;
}

.help-text {
  @apply text-sm text-gray-500 dark:text-gray-400 ml-6;
}

.wizard-actions {
  @apply flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-600;
}

.btn {
  @apply px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2;
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
</style>
