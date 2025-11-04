<template>
  <div class="live-sync-importer">
    <div class="importer-header">
      <div class="header-content">
        <div class="icon-wrapper">
          <component :is="frameworkIconComponent" class="framework-icon" />
        </div>
        <div class="header-text">
          <h3>Live Sync Setup</h3>
          <p>Connect to your API for real-time updates</p>
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
              <h4>Development Server</h4>
              <p>Connect to your running API server</p>
            </div>
          </button>

          <button
            class="connection-option"
            :class="{ active: connectionType === 'file' }"
            @click="selectConnectionType('file')"
          >
            <IconFile class="option-icon" />
            <div class="option-content">
              <h4>Local Spec File</h4>
              <p>Watch a local OpenAPI file</p>
            </div>
          </button>
        </div>

        <div v-if="connectionType" class="connection-form">
          <div v-if="connectionType === 'url'" class="url-form">
            <div class="form-group">
              <label>Server URL</label>
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

            <div class="framework-selection mt-3">
              <div class="form-group">
                <label class="flex items-center gap-2">
                  <span>Framework</span>
                  <span
                    v-if="
                      detectedFramework &&
                      selectedFramework === detectedFramework
                    "
                    class="detected-badge"
                  >
                    Auto-detected
                  </span>
                </label>
                <div class="framework-select-wrapper">
                  <select
                    :value="selectedFramework || ''"
                    class="form-select framework-select"
                    @change="handleFrameworkChange"
                  >
                    <option value="">Unknown / Other</option>
                    <option value="fastapi">FastAPI</option>
                    <option value="express">Express.js</option>
                    <option value="spring">Spring Boot</option>
                    <option value="aspnet">ASP.NET Core</option>
                    <option value="django">Django</option>
                    <option value="flask">Flask</option>
                    <option value="rails">Ruby on Rails</option>
                    <option value="laravel">Laravel</option>
                  </select>
                  <component
                    :is="getFrameworkIconComponent(selectedFramework)"
                    v-if="selectedFramework"
                    class="framework-select-icon"
                  />
                </div>
                <div v-if="isDetecting && !detectedFramework" class="detecting">
                  <IconLoader class="animate-spin" />
                  <span>Detecting framework...</span>
                </div>
                <div
                  v-if="
                    detectedFramework &&
                    selectedFramework &&
                    selectedFramework !== detectedFramework
                  "
                  class="detection-hint"
                >
                  <p>
                    <IconInfo class="hint-icon" />
                    Auto-detected as:
                    <strong>{{
                      getFrameworkDisplayName(detectedFramework)
                    }}</strong>
                  </p>
                  <p class="override-hint">
                    Will now use:
                    <strong>{{
                      getFrameworkDisplayName(selectedFramework)
                    }}</strong>
                  </p>
                </div>
                <p
                  v-else-if="detectedFramework && !selectedFramework"
                  class="detection-hint"
                >
                  <IconInfo class="hint-icon" />
                  Auto-detected as:
                  <strong>{{
                    getFrameworkDisplayName(detectedFramework)
                  }}</strong>
                </p>
              </div>
            </div>
          </div>

          <div v-if="connectionType === 'file'" class="file-form">
            <div class="form-group">
              <label>Spec File Path</label>
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
                  Browse
                </button>
              </div>
              <div v-if="fileError" class="error-message">
                {{ fileError }}
              </div>
            </div>

            <div class="file-info">
              <div class="info-item">
                <IconInfo />
                <span>File changes detected automatically</span>
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
              Test Connection
            </button>

            <button
              :disabled="!canProceed"
              class="btn btn-primary"
              @click="proceedToSetup"
            >
              <IconArrowRight />
              Continue
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
        <span
          v-if="connectionResult.success && connectionResult.framework"
          class="framework-badge"
        >
          <component
            :is="getFrameworkIconComponent(connectionResult.framework)"
          />
          {{ getFrameworkDisplayName(connectionResult.framework) }}
        </span>
      </div>

      <div
        v-if="connectionResult.success && connectionResult.preview"
        class="preview"
      >
        <h4>Preview Collections</h4>
        <div class="preview-list">
          <div
            v-for="collection in connectionResult.preview"
            :key="collection.name"
            class="preview-item"
          >
            <IconFolder />
            <span>{{ collection.name }}</span>
            <span class="endpoint-count">
              {{ countRequestsInCollection(collection) }} endpoints
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
// import { useI18n } from "~/composables/i18n"
import { useToast } from "~/composables/toast"
import type {
  LiveSpecSource,
  FrameworkType,
} from "../../types/live-spec-source"
import type { HoppCollection } from "@hoppscotch/data"
import { hoppOpenAPIImporter } from "~/helpers/import-export/import/importers"
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
  onSetupComplete?: (source: LiveSpecSource) => Promise<void>
  onImportComplete?: (collections: HoppCollection[]) => Promise<void>
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  onSetupComplete: undefined,
  onImportComplete: undefined,
})

const emit = defineEmits<{
  (e: "import-complete", collections: HoppCollection[]): void
  (e: "setup-complete", source: LiveSpecSource): void
  (e: "cancel"): void
}>()

const toast = useToast()

// State
const connectionType = ref<"url" | "file" | null>(null)
const serverUrl = ref("")
const filePath = ref("")
const urlError = ref("")
const fileError = ref("")
const detectedFramework = ref<FrameworkType | null>(null)
const selectedFramework = ref<FrameworkType | null>(null)
const isDetecting = ref(false)
const isTesting = ref(false)
const showSetupWizard = ref(false)
const connectionResult = ref<{
  success: boolean
  message: string
  preview?: HoppCollection[]
  specTitle?: string
  framework?: FrameworkType | null
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
    framework: selectedFramework.value || detectedFramework.value || undefined,
    specTitle: connectionResult.value?.specTitle || undefined,
  }
})

// Methods
function selectConnectionType(type: "url" | "file") {
  connectionType.value = type
  connectionResult.value = null
  selectedFramework.value = null
  detectedFramework.value = null

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

function getFrameworkDisplayName(framework: FrameworkType): string {
  const names: Record<FrameworkType, string> = {
    fastapi: "FastAPI",
    express: "Express.js",
    spring: "Spring Boot",
    aspnet: "ASP.NET Core",
    django: "Django",
    flask: "Flask",
    rails: "Ruby on Rails",
    laravel: "Laravel",
  }
  return names[framework] || framework
}

function handleFrameworkChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const value = target.value
  selectedFramework.value = value ? (value as FrameworkType) : null
}

async function validateUrl() {
  urlError.value = ""

  if (!serverUrl.value) {
    return
  }

  try {
    new URL(serverUrl.value)
  } catch {
    urlError.value = "Invalid URL format"
    return
  }

  // Auto-detect framework
  if (serverUrl.value && !isDetecting.value) {
    isDetecting.value = true
    detectedFramework.value = null

    try {
      const framework = await detectFramework(serverUrl.value)
      detectedFramework.value = framework
      // Auto-select the detected framework if nothing is manually selected
      if (framework && !selectedFramework.value) {
        selectedFramework.value = framework
      }
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
    fileError.value =
      "Invalid file format. Please use .json, .yaml, or .yml files"
    return
  }
}

function browseFile() {
  // This would open a file browser dialog
  // Implementation depends on the platform (electron, web, etc.)
  toast.info("File browser not available in web version")
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
      message: error instanceof Error ? error.message : "Connection failed",
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
      throw new Error("Invalid OpenAPI specification")
    }

    // Generate preview collections
    const preview = await generatePreview(spec)

    // Auto-fill collection name from OpenAPI spec
    const specTitle = spec.info?.title

    connectionResult.value = {
      success: true,
      message: "Connection successful",
      preview,
      specTitle, // Include for the setup wizard
      framework: selectedFramework.value || detectedFramework.value, // Use selected framework if available, otherwise detected
    }
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to fetch specification"
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
      message: "File path is valid",
    }
  } catch (error) {
    throw new Error("Invalid file path")
  }
}

async function generatePreview(spec: any): Promise<HoppCollection[]> {
  // Use the actual OpenAPI importer to get accurate preview with proper folder structure
  try {
    // Convert spec to JSON string (the importer expects string input)
    const specString = JSON.stringify(spec)
    const importResult = await hoppOpenAPIImporter([specString])()

    if (importResult._tag === "Right") {
      return importResult.right
    }
    // Fallback if import fails - return empty array
    console.warn("OpenAPI import failed for preview:", importResult.left)
    return []
  } catch (error) {
    console.error("Failed to generate preview:", error)
    // Fallback: return empty array on error
    return []
  }
}

function proceedToSetup() {
  if (!canProceed.value) return

  showSetupWizard.value = true
}

async function handleSetupComplete(source: LiveSpecSource) {
  showSetupWizard.value = false

  // Call the prop function if provided
  if (props.onSetupComplete) {
    await props.onSetupComplete(source)
  }

  // Also emit for backward compatibility
  emit("setup-complete", source)
}

function handleSetupCancel() {
  showSetupWizard.value = false
}

// Helper function to count requests recursively (including folders)
function countRequestsInCollection(collection: HoppCollection): number {
  let count = collection.requests?.length || 0
  // Recursively count requests in folders
  for (const folder of collection.folders || []) {
    count += countRequestsInCollection(folder)
  }
  return count
}

// Watch for changes
watch(serverUrl, validateUrl)
watch(filePath, validateFile)

// Watch for framework detection and auto-select
watch(detectedFramework, (newFramework) => {
  // Only auto-select if user hasn't manually selected something
  if (newFramework && !selectedFramework.value) {
    selectedFramework.value = newFramework
  }
})
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
  @apply grid grid-cols-1 gap-4;
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
  @apply font-semibold mb-2;
}

.option-content p {
  @apply text-sm text-gray-600 dark:text-gray-400 leading-relaxed;
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

.framework-selection {
  @apply space-y-2;
}

.framework-select-wrapper {
  @apply relative flex items-center;
}

.framework-select {
  @apply w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer;
}

.framework-select-icon {
  @apply absolute right-3 w-5 h-5 text-gray-400 pointer-events-none;
}

.detected-badge {
  @apply px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded;
}

.detecting {
  @apply flex items-center gap-2 text-sm text-gray-500;
}

.detection-hint {
  @apply space-y-1 text-xs text-gray-600 dark:text-gray-400 mt-1;
}

.detection-hint p {
  @apply flex items-center gap-2;
}

.override-hint {
  @apply text-blue-600 dark:text-blue-400 font-medium;
}

.hint-icon {
  @apply w-3 h-3 flex-shrink-0;
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

.framework-badge {
  @apply flex items-center gap-1 ml-2 px-2 py-1 bg-white dark:bg-gray-700 rounded text-xs font-medium;
}

.framework-badge svg {
  @apply w-3 h-3;
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
