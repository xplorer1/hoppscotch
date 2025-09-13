<template>
  <div class="live-source-setup-wizard">
    <div class="wizard-header">
      <h3>{{ t("import.setup_live_sync") }}</h3>
      <p>{{ t("import.configure_live_source") }}</p>
    </div>

    <div class="wizard-content">
      <div class="setup-form">
        <div class="form-group">
          <label>{{ t("import.collection_name") }}</label>
          <input
            v-model="config.collectionName"
            type="text"
            :placeholder="t('import.collection_name_placeholder')"
            class="form-input"
          />
        </div>

        <div class="form-group">
          <label>{{ t("import.sync_frequency") }}</label>
          <select v-model="config.syncFrequency" class="form-select">
            <option value="realtime">{{ t("import.realtime") }}</option>
            <option value="5s">{{ t("import.every_5_seconds") }}</option>
            <option value="30s">{{ t("import.every_30_seconds") }}</option>
            <option value="manual">{{ t("import.manual_only") }}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              v-model="config.preserveCustomizations"
              type="checkbox"
              class="form-checkbox"
            />
            {{ t("import.preserve_customizations") }}
          </label>
          <p class="help-text">
            {{ t("import.preserve_customizations_help") }}
          </p>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              v-model="config.autoImport"
              type="checkbox"
              class="form-checkbox"
            />
            {{ t("import.auto_import_changes") }}
          </label>
          <p class="help-text">{{ t("import.auto_import_changes_help") }}</p>
        </div>
      </div>

      <div class="wizard-actions">
        <button class="btn btn-secondary" @click="handleCancel">
          {{ t("action.cancel") }}
        </button>
        <button
          :disabled="!canSetup || isLoading"
          class="btn btn-primary"
          @click="handleSetup"
        >
          <icon v-if="isLoading" name="loader" class="animate-spin" />
          {{ t("import.setup_live_sync") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue"
import { useI18n } from "@composables/i18n"
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

const emit = defineEmits<{
  "setup-complete": [source: LiveSpecSource]
  cancel: []
}>()

const t = useI18n()

const config = reactive({
  collectionName: props.initialConfig?.name || "",
  syncFrequency: "realtime",
  preserveCustomizations: true,
  autoImport: true,
  ...props.initialConfig,
})

const canSetup = computed(() => {
  return config.collectionName.trim().length > 0
})

async function handleSetup() {
  if (!canSetup.value) return

  try {
    const source: LiveSpecSource = {
      id: `live-source-${Date.now()}`,
      name: config.collectionName,
      type: props.initialConfig?.type || "url",
      url: props.initialConfig?.url,
      filePath: props.initialConfig?.filePath,
      framework: props.initialConfig?.framework,
      isActive: true,
      syncFrequency: config.syncFrequency,
      preserveCustomizations: config.preserveCustomizations,
      autoImport: config.autoImport,
      createdAt: new Date(),
      lastSyncAt: null,
      lastError: null,
    }

    // Register the source with the service
    await liveSpecSourceService.registerSource(source)

    emit("setup-complete", source)
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
