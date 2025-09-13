<template>
  <div class="live-sync-importer">
    <div class="importer-header">
      <div class="header-content">
        <div class="icon-wrapper">
          <component :is="frameworkIconComponent" class="framework-icon" />
        </div>
        <div class="header-text">
          <h3>{{ t("import.connect_to_development_server") }}</h3>
          <p>{{ t("import.live_sync_description") }}</p>
        </div>
      </div>
    </div>

    <div class="importer-content">
      <div v-if="!showSetupWizard" class="connection-options">
        <div class="option-grid">
          <button
            class="connection-option"
            :class="{ active: connectionType === 'url' }"
            @click="selectConnectionType('url')"
          >
            <IconLink class="option-icon" />
            <div class="option-content">
              <h4>{{ t("import.development_server_url") }}</h4>
              <p>{{ t("import.connect_to_running_server") }}</p>
            </div>
          </button>

          <button
            class="connection-option"
            :class="{ active: connectionType === 'file' }"
            @click="selectConnectionType('file')"
          >
            <IconFile class="option-icon" />
            <div class="option-content">
              <h4>{{ t("import.generated_spec_file") }}</h4>
              <p>{{ t("import.watch_local_file") }}</p>
            </div>
          </button>
        </div>

        <div v-if="connectionType" class="connection-form">
          <div v-if="connectionType === 'url'" class="url-form">
            <div class="form-group">
              <label>{{ t("import.server_url") }}</label>
              <input
                v-model="serverUrl"
                type="url"
                :placeholder="getUrlPlaceholder()"
                class="form-input"
                @input="validateUrl"
              />
              <div v-if="urlError" class="error-message">
                {{ urlError }}
              </div>
            </div>

            <div class="framework-detection">
              <div v-if="detectedFramework" class="detected-framework">
                <component :is="getFrameworkIconComponent(detectedFramework)" />
                <span
                  >{{ t(`frameworks.${detectedFramework}`) }}
                  {{ t("import.detected") }}</span
                >
              </div>
              <div v-else-if="isDetecting" class="detecting">
                <IconLoader class="animate-spin" />
                <span>{{ t("import.detecting_framework") }}</span>
              </div>
            </div>
          </div>

          <div v-if="connectionType === 'file'" class="file-form">
            <div class="form-group">
              <label>{{ t("import.spec_file_path") }}</label>
              <div class="file-input-wrapper">
                <input
                  v-model="filePath"
                  type="text"
                  :placeholder="getFilePlaceholder()"
                  class="form-input"
                  @input="validateFile"
                />
                <button class="browse-button" @click="browseFile">
                  <IconFolder />
                  {{ t("action.browse") }}
                </button>
              </div>
              <div v-if="fileError" class="error-message">
                {{ fileError }}
              </div>
            </div>

            <div class="file-info">
              <div class="info-item">
                <IconInfo />
                <span>{{ t("import.file_watch_info") }}</span>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button
              :disabled="!canTestConnection || isTesting"
              class="btn btn-secondary"
              @click="testConnection"
            >
              <IconLoader v-if="isTesting" class="animate-spin" />
              <IconZap v-else />
              {{ t("import.test_connection") }}
            </button>

            <button
              :disabled="!canProceed"
              class="btn btn-primary"
              @click="proceedToSetup"
            >
              <IconArrowRight />
              {{ t("action.continue") }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showSetupWizard" class="setup-wizard">
        <LiveSourceSetupWizard
          :initial-config="initialConfig"
          @setup-complete="handleSetupComplete"
          @cancel="handleSetupCancel"
        />
      </div>
    </div>

    <div v-if="connectionResult" class="connection-result">
      <div
        class="result-message"
        :class="connectionResult.success ? 'success' : 'error'"
      >
        <IconCheckCircle v-if="connectionResult.success" />
        <IconXCircle v-else />
        <span>{{ connectionResult.message }}</span>
      </div>

      <div
        v-if="connectionResult.success && connectionResult.preview"
        class="preview"
      >
        <h4>{{ t("import.preview_collections") }}</h4>
        <div class="preview-list">
          <div
            v-for="collection in connectionResult.preview"
            :key="collection.name"
            class="preview-item"
          >
            <IconFolder />
            <span>{{ collection.name }}</span>
            <span class="endpoint-count">
              {{ collection.requests?.length || 0 }} {{ t("import.endpoints") }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue"
import { useI18n } from "~/composables/i18n"
import { useToast } from "~/composables/toast"
import type {
  LiveSpecSource,
  FrameworkType,
} from "../../types/live-spec-source"
import type { HoppCollection } from "@hoppscotch/data"
// import { liveSpecSourceService } from "../../services/live-spec-source.service"
import { detectFramework } from "../../helpers/live-spec-source/framework-detection"
import LiveSourceSetupWizard from "./LiveSourceSetupWizard.vue"

import IconLink from "~icons/lucide/link"
import IconFile from "~icons/lucide/file"
import IconFolder from "~icons/lucide/folder"
import IconInfo from "~icons/lucide/info"
import IconLoader from "~icons/lucide/loader-2"
import IconZap from "~icons/lucide/zap"
import IconArrowRight from "~icons/lucide/arrow-right"
import IconCheckCircle from "~icons/lucide/check-circle"
import IconXCircle from "~icons/lucide/x-circle"
import IconCode from "~icons/lucide/code"
import IconPython from "~icons/simple-icons/python"
import IconNodejs from "~icons/simple-icons/nodedotjs"
import IconJava from "~icons/simple-icons/openjdk"
import IconMicrosoft from "~icons/simple-icons/microsoft"

interface Props {
  isLoading?: boolean
}

withDefaults(defineProps<Props>(), {
  isLoading: false,
})

defineEmits<{
  "import-complete": [collections: HoppCollection[]]
  "setup-complete": [source: LiveSpecSource]
  cancel: []
}>()

const t = useI18n()
const toast = useToast()

// State
const connectionType = ref<"url" | "file" | null>(null)
const serverUrl = ref("")
const filePath = ref("")
const urlError = ref("")
const fileError = ref("")
const detectedFramework = ref<FrameworkType | null>(null)
const isDetecting = ref(false)
const isTesting = ref(false)
const showSetupWizard = ref(false)
const connectionResult = ref<{
  success: boolean
  message: string
  preview?: HoppCollection[]
} | null>(null)

// Computed
const frameworkIconComponent = computed(() => {
  if (detectedFramework.value) {
    return getFrameworkIconComponent(detectedFramework.value)
  }
  return IconCode
})

const canTestConnection = computed(() => {
  if (connectionType.value === "url") {
    return serverUrl.value && !urlError.value
  }
  if (connectionType.value === "file") {
    return filePath.value && !fileError.value
  }
  return false
})

const canProceed = computed(() => {
  return canTestConnection.value && connectionResult.value?.success
})

const initialConfig = computed((): Partial<LiveSpecSource> => {
  return {
    type: connectionType.value || "url",
    url: connectionType.value === "url" ? serverUrl.value : undefined,
    filePath: connectionType.value === "file" ? filePath.value : undefined,
    framework: detectedFramework.value || undefined,
  }
})

// Methods
function selectConnectionType(type: "url" | "file") {
  connectionType.value = type
  connectionResult.value = null

  // Clear errors when switching types
  urlError.value = ""
  fileError.value = ""
}

function getUrlPlaceholder(): string {
  const examples = {
    fastapi: "http://localhost:8000/openapi.json",
    express: "http://localhost:3000/api-docs",
    spring: "http://localhost:8080/v3/api-docs",
    aspnet: "http://localhost:5000/swagger/v1/swagger.json",
    django: "http://localhost:8000/api/schema/",
  }

  if (detectedFramework.value && examples[detectedFramework.value]) {
    return examples[detectedFramework.value]
  }

  return "http://localhost:3000/openapi.json"
}

function getFilePlaceholder(): string {
  const examples = {
    fastapi: "./openapi.json",
    express: "./docs/openapi.json",
    spring: "./target/openapi.json",
    aspnet: "./wwwroot/swagger.json",
    django: "./schema.json",
  }

  if (detectedFramework.value && examples[detectedFramework.value]) {
    return examples[detectedFramework.value]
  }

  return "./openapi.json"
}

function getFrameworkIconComponent(framework: FrameworkType) {
  const icons = {
    fastapi: IconPython,
    express: IconNodejs,
    spring: IconJava,
    aspnet: IconMicrosoft,
    django: IconPython,
    flask: IconPython,
    rails: IconCode, // No specific Ruby icon available
    laravel: IconCode, // No specific PHP icon available
  }

  return icons[framework] || IconCode
}

async function validateUrl() {
  urlError.value = ""

  if (!serverUrl.value) {
    return
  }

  try {
    new URL(serverUrl.value)
  } catch {
    urlError.value = t("import.invalid_url")
    return
  }

  // Auto-detect framework
  if (serverUrl.value && !isDetecting.value) {
    isDetecting.value = true
    detectedFramework.value = null

    try {
      const framework = await detectFramework(serverUrl.value)
      detectedFramework.value = framework
    } catch (error) {
      // Framework detection failed, but that's okay
      console.warn("Framework detection failed:", error)
    } finally {
      isDetecting.value = false
    }
  }
}

function validateFile() {
  fileError.value = ""

  if (!filePath.value) {
    return
  }

  // Basic file path validation
  if (!filePath.value.match(/\.(json|yaml|yml)$/i)) {
    fileError.value = t("import.invalid_file_format")
    return
  }
}

function browseFile() {
  // This would open a file browser dialog
  // Implementation depends on the platform (electron, web, etc.)
  toast.info(t("import.file_browser_not_available"))
}

async function testConnection() {
  if (!canTestConnection.value) return

  isTesting.value = true
  connectionResult.value = null

  try {
    if (connectionType.value === "url") {
      await testUrlConnection()
    } else if (connectionType.value === "file") {
      await testFileConnection()
    }
  } catch (error) {
    connectionResult.value = {
      success: false,
      message:
        error instanceof Error ? error.message : t("import.connection_failed"),
    }
  } finally {
    isTesting.value = false
  }
}

async function testUrlConnection() {
  if (!serverUrl.value) return

  try {
    // Test the connection and get a preview
    const response = await fetch(serverUrl.value, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const spec = await response.json()

    // Basic OpenAPI validation
    if (!spec.openapi && !spec.swagger) {
      throw new Error(t("import.invalid_openapi_spec"))
    }

    // Generate preview collections
    const preview = await generatePreview(spec)

    connectionResult.value = {
      success: true,
      message: t("import.connection_successful"),
      preview,
    }
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : t("import.failed_to_fetch_spec")
    )
  }
}

async function testFileConnection() {
  if (!filePath.value) return

  try {
    // For file connections, we can't actually test the file here
    // but we can validate the path format
    connectionResult.value = {
      success: true,
      message: t("import.file_path_valid"),
    }
  } catch (error) {
    throw new Error(t("import.invalid_file_path"))
  }
}

async function generatePreview(spec: any): Promise<HoppCollection[]> {
  // This is a simplified preview generation
  // In a real implementation, you'd use the OpenAPI importer
  const collections: HoppCollection[] = []

  if (spec.paths) {
    const endpoints = Object.keys(spec.paths).length
    collections.push({
      name: spec.info?.title || "API Collection",
      folders: [],
      requests: Array(endpoints)
        .fill(null)
        .map((_, i) => ({
          name: `Endpoint ${i + 1}`,
          method: "GET",
          endpoint: Object.keys(spec.paths)[i] || "/",
          params: [],
          headers: [],
          preRequestScript: "",
          testScript: "",
          auth: { authType: "none", authActive: true },
          body: { contentType: null, body: null },
        })),
    })
  }

  return collections
}

function proceedToSetup() {
  if (!canProceed.value) return

  showSetupWizard.value = true
}

function handleSetupComplete(source: LiveSpecSource) {
  showSetupWizard.value = false
  emit("setup-complete", source)

  toast.success(t("import.live_sync_setup_complete"))
}

function handleSetupCancel() {
  showSetupWizard.value = false
}

// Watch for changes
watch(serverUrl, validateUrl)
watch(filePath, validateFile)
</script>

<style scoped>
.live-sync-importer {
  @apply space-y-6;
}

.importer-header {
  @apply border-b border-gray-200 dark:border-gray-700 pb-4;
}

.header-content {
  @apply flex items-start gap-4;
}

.icon-wrapper {
  @apply flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center;
}

.framework-icon {
  @apply w-6 h-6 text-blue-600 dark:text-blue-400;
}

.header-text h3 {
  @apply text-lg font-semibold mb-1;
}

.header-text p {
  @apply text-gray-600 dark:text-gray-400;
}

.connection-options {
  @apply space-y-6;
}

.option-grid {
  @apply grid grid-cols-1 md:grid-cols-2 gap-4;
}

.connection-option {
  @apply p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition-colors text-left;
}

.connection-option.active {
  @apply border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-900 dark:bg-opacity-20;
}

.option-icon {
  @apply w-8 h-8 text-gray-400 mb-3;
}

.connection-option.active .option-icon {
  @apply text-blue-500;
}

.option-content h4 {
  @apply font-semibold mb-1;
}

.option-content p {
  @apply text-sm text-gray-600 dark:text-gray-400;
}

.connection-form {
  @apply space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg;
}

.form-group {
  @apply space-y-2;
}

.form-group label {
  @apply block text-sm font-medium;
}

.form-input {
  @apply w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500;
}

.file-input-wrapper {
  @apply flex gap-2;
}

.file-input-wrapper .form-input {
  @apply flex-1;
}

.browse-button {
  @apply px-3 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md flex items-center gap-2 text-sm font-medium transition-colors;
}

.error-message {
  @apply text-sm text-red-600 dark:text-red-400;
}

.framework-detection {
  @apply flex items-center gap-2 text-sm;
}

.detected-framework {
  @apply flex items-center gap-2 text-green-600 dark:text-green-400;
}

.detecting {
  @apply flex items-center gap-2 text-gray-500;
}

.file-info {
  @apply space-y-2;
}

.info-item {
  @apply flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400;
}

.info-item svg {
  @apply w-4 h-4 mt-0.5 flex-shrink-0;
}

.form-actions {
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

.connection-result {
  @apply space-y-4;
}

.result-message {
  @apply flex items-center gap-2 p-3 rounded-md;
}

.result-message.success {
  @apply bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100;
}

.result-message.error {
  @apply bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100;
}

.preview {
  @apply space-y-3;
}

.preview h4 {
  @apply font-semibold;
}

.preview-list {
  @apply space-y-2;
}

.preview-item {
  @apply flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md;
}

.endpoint-count {
  @apply ml-auto text-sm text-gray-500;
}

/* Removed circular dependency - use animate-spin utility directly in template */
</style>
