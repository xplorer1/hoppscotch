<template>
  <div class="advanced-sync-settings">
    <div class="settings-header">
      <h3>{{ t("collections.advanced_sync_settings") }}</h3>
      <p>{{ t("collections.advanced_sync_description") }}</p>
    </div>

    <div class="settings-content">
      <!-- Framework-Specific Settings -->
      <div class="settings-section">
        <div class="section-header">
          <icon :name="getFrameworkIcon(source.framework)" />
          <h4>
            {{ getFrameworkDisplayName(source.framework) }}
            {{ t("collections.optimizations") }}
          </h4>
        </div>

        <div class="framework-info">
          <div class="info-card">
            <h5>{{ t("collections.setup_guide") }}</h5>
            <div class="setup-guide" v-html="formattedSetupGuide"></div>
            <button class="btn btn-ghost btn-sm" @click="copySetupGuide">
              <icon name="copy" />
              {{ t("action.copy") }}
            </button>
          </div>
        </div>

        <div class="optimization-settings">
          <div class="setting-group">
            <label class="setting-label">
              {{ t("collections.debounce_delay") }}
              <span class="setting-description">{{
                t("collections.debounce_description")
              }}</span>
            </label>
            <div class="setting-control">
              <input
                v-model.number="optimizationSettings.debounceMs"
                type="number"
                min="100"
                max="5000"
                step="100"
                class="setting-input"
              />
              <span class="setting-unit">ms</span>
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-checkbox">
              <input
                v-model="optimizationSettings.batchUpdates"
                type="checkbox"
              />
              <span>{{ t("collections.batch_updates") }}</span>
              <span class="setting-description">{{
                t("collections.batch_updates_description")
              }}</span>
            </label>
          </div>

          <div class="setting-group">
            <label class="setting-checkbox">
              <input
                v-model="optimizationSettings.selectiveSync"
                type="checkbox"
              />
              <span>{{ t("collections.selective_sync") }}</span>
              <span class="setting-description">{{
                t("collections.selective_sync_description")
              }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Webhook Integration -->
      <div class="settings-section">
        <div class="section-header">
          <icon name="webhook" />
          <h4>{{ t("collections.webhook_integration") }}</h4>
        </div>

        <div class="webhook-settings">
          <div class="setting-group">
            <label class="setting-checkbox">
              <input v-model="webhookConfig.enabled" type="checkbox" />
              <span>{{ t("collections.enable_webhook") }}</span>
              <span class="setting-description">{{
                t("collections.webhook_description")
              }}</span>
            </label>
          </div>

          <div v-if="webhookConfig.enabled" class="webhook-config">
            <div class="setting-group">
              <label class="setting-label">{{
                t("collections.webhook_url")
              }}</label>
              <div class="webhook-url-display">
                <code>{{ generatedWebhookUrl }}</code>
                <button class="btn btn-ghost btn-sm" @click="copyWebhookUrl">
                  <icon name="copy" />
                  {{ t("action.copy") }}
                </button>
              </div>
            </div>

            <div class="setting-group">
              <label class="setting-label">{{
                t("collections.webhook_events")
              }}</label>
              <div class="event-checkboxes">
                <label
                  v-for="event in availableEvents"
                  :key="event.id"
                  class="event-checkbox"
                >
                  <input
                    v-model="webhookConfig.events"
                    :value="event.id"
                    type="checkbox"
                  />
                  <span>{{ event.label }}</span>
                  <span class="event-description">{{ event.description }}</span>
                </label>
              </div>
            </div>

            <div class="setting-group">
              <label class="setting-label">{{
                t("collections.webhook_secret")
              }}</label>
              <div class="secret-input">
                <input
                  v-model="webhookConfig.secret"
                  :type="showSecret ? 'text' : 'password'"
                  class="setting-input"
                  :placeholder="t('collections.webhook_secret_placeholder')"
                />
                <button
                  class="btn btn-ghost btn-sm"
                  @click="showSecret = !showSecret"
                >
                  <icon :name="showSecret ? 'eye-off' : 'eye'" />
                </button>
                <button class="btn btn-ghost btn-sm" @click="generateSecret">
                  <icon name="refresh-cw" />
                  {{ t("action.generate") }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Selective Sync Configuration -->
      <div v-if="optimizationSettings.selectiveSync" class="settings-section">
        <div class="section-header">
          <icon name="filter" />
          <h4>{{ t("collections.selective_sync_config") }}</h4>
        </div>

        <div class="selective-sync-settings">
          <div class="setting-group">
            <label class="setting-label">{{
              t("collections.include_patterns")
            }}</label>
            <div class="pattern-list">
              <div
                v-for="(pattern, index) in selectiveSyncConfig.includePatterns"
                :key="`include-${index}`"
                class="pattern-item"
              >
                <input
                  v-model="selectiveSyncConfig.includePatterns[index]"
                  type="text"
                  class="pattern-input"
                  :placeholder="t('collections.pattern_placeholder')"
                />
                <button
                  class="btn btn-ghost btn-sm"
                  @click="removePattern('include', index)"
                >
                  <icon name="x" />
                </button>
              </div>
              <button
                class="btn btn-ghost btn-sm"
                @click="addPattern('include')"
              >
                <icon name="plus" />
                {{ t("collections.add_pattern") }}
              </button>
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-label">{{
              t("collections.exclude_patterns")
            }}</label>
            <div class="pattern-list">
              <div
                v-for="(pattern, index) in selectiveSyncConfig.excludePatterns"
                :key="`exclude-${index}`"
                class="pattern-item"
              >
                <input
                  v-model="selectiveSyncConfig.excludePatterns[index]"
                  type="text"
                  class="pattern-input"
                  :placeholder="t('collections.pattern_placeholder')"
                />
                <button
                  class="btn btn-ghost btn-sm"
                  @click="removePattern('exclude', index)"
                >
                  <icon name="x" />
                </button>
              </div>
              <button
                class="btn btn-ghost btn-sm"
                @click="addPattern('exclude')"
              >
                <icon name="plus" />
                {{ t("collections.add_pattern") }}
              </button>
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-label">{{
              t("collections.method_filters")
            }}</label>
            <div class="method-checkboxes">
              <label
                v-for="method in availableMethods"
                :key="method"
                class="method-checkbox"
              >
                <input
                  v-model="selectiveSyncConfig.endpointFilters.methods"
                  :value="method.toLowerCase()"
                  type="checkbox"
                />
                <span class="method-badge" :class="method.toLowerCase()">
                  {{ method }}
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Error Recovery -->
      <div class="settings-section">
        <div class="section-header">
          <icon name="shield" />
          <h4>{{ t("collections.error_recovery") }}</h4>
        </div>

        <div class="error-recovery-settings">
          <div class="setting-group">
            <label class="setting-checkbox">
              <input v-model="errorRecoveryConfig.autoRetry" type="checkbox" />
              <span>{{ t("collections.auto_retry") }}</span>
              <span class="setting-description">{{
                t("collections.auto_retry_description")
              }}</span>
            </label>
          </div>

          <div v-if="errorRecoveryConfig.autoRetry" class="retry-settings">
            <div class="setting-group">
              <label class="setting-label">{{
                t("collections.max_retries")
              }}</label>
              <input
                v-model.number="errorRecoveryConfig.maxRetries"
                type="number"
                min="1"
                max="10"
                class="setting-input"
              />
            </div>

            <div class="setting-group">
              <label class="setting-label">{{
                t("collections.retry_delay")
              }}</label>
              <div class="setting-control">
                <input
                  v-model.number="errorRecoveryConfig.retryDelay"
                  type="number"
                  min="1000"
                  max="60000"
                  step="1000"
                  class="setting-input"
                />
                <span class="setting-unit">ms</span>
              </div>
            </div>
          </div>

          <div class="common-errors">
            <h5>{{ t("collections.common_errors") }}</h5>
            <div class="error-list">
              <div
                v-for="error in commonErrors"
                :key="error.type"
                class="error-item"
              >
                <div class="error-info">
                  <icon name="alert-circle" />
                  <div class="error-details">
                    <span class="error-title">{{ error.title }}</span>
                    <span class="error-solution">{{ error.solution }}</span>
                  </div>
                </div>
                <button
                  class="btn btn-ghost btn-sm"
                  @click="testErrorRecovery(error.type)"
                >
                  <icon name="play" />
                  {{ t("collections.test_recovery") }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-actions">
      <button class="btn btn-secondary" @click="resetToDefaults">
        <icon name="rotate-ccw" />
        {{ t("collections.reset_defaults") }}
      </button>

      <button class="btn btn-primary" @click="saveSettings">
        <icon name="save" />
        {{ t("action.save_settings") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted } from "vue"
import { useI18n } from "~/composables/i18n"
import { useToast } from "~/composables/toast"
import { frameworkOptimizationService } from "../../services/framework-optimization.service"
import type {
  LiveSpecSource,
  FrameworkType,
} from "../../types/live-spec-source"

interface Props {
  source: LiveSpecSource
}

const props = defineProps<Props>()

const t = useI18n()
const toast = useToast()

// State
const showSecret = ref(false)

const optimizationSettings = reactive({
  debounceMs: 500,
  batchUpdates: false,
  selectiveSync: false,
})

const webhookConfig = reactive({
  enabled: false,
  events: ["push", "pull_request"],
  secret: "",
})

const selectiveSyncConfig = reactive({
  includePatterns: [""],
  excludePatterns: [""],
  endpointFilters: {
    methods: [],
    tags: [],
    paths: [],
  },
})

const errorRecoveryConfig = reactive({
  autoRetry: true,
  maxRetries: 3,
  retryDelay: 5000,
})

// Computed
const generatedWebhookUrl = computed(() => {
  return `https://api.hoppscotch.io/webhooks/live-sync/${props.source.id}`
})

const formattedSetupGuide = computed(() => {
  const guide = frameworkOptimizationService.getSetupGuide(
    props.source.framework || "fastapi"
  )
  return guide
    .replace(/\n/g, "<br>")
    .replace(/```(\w+)?\n([\s\S]*?)\n```/g, "<pre><code>$2</code></pre>")
})

const availableEvents = computed(() => [
  {
    id: "push",
    label: t("collections.webhook_push"),
    description: t("collections.webhook_push_description"),
  },
  {
    id: "pull_request",
    label: t("collections.webhook_pr"),
    description: t("collections.webhook_pr_description"),
  },
  {
    id: "release",
    label: t("collections.webhook_release"),
    description: t("collections.webhook_release_description"),
  },
])

const availableMethods = computed(() => [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
])

const commonErrors = computed(() => {
  const framework = props.source.framework || "fastapi"
  return [
    {
      type: "connection_failed",
      title: t("collections.connection_failed"),
      solution: frameworkOptimizationService.getFrameworkErrorMessage(
        framework,
        "connection_failed"
      ),
    },
    {
      type: "cors_error",
      title: t("collections.cors_error"),
      solution: frameworkOptimizationService.getFrameworkErrorMessage(
        framework,
        "cors_error"
      ),
    },
    {
      type: "spec_not_found",
      title: t("collections.spec_not_found"),
      solution: frameworkOptimizationService.getFrameworkErrorMessage(
        framework,
        "spec_not_found"
      ),
    },
  ]
})

// Methods
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

function getFrameworkDisplayName(framework?: FrameworkType): string {
  const names = {
    fastapi: "FastAPI",
    express: "Express.js",
    spring: "Spring Boot",
    aspnet: "ASP.NET Core",
    django: "Django",
    flask: "Flask",
    rails: "Ruby on Rails",
    laravel: "Laravel",
  }
  return framework ? names[framework] || "Unknown" : "Unknown"
}

function copySetupGuide() {
  const guide = frameworkOptimizationService.getSetupGuide(
    props.source.framework || "fastapi"
  )
  navigator.clipboard.writeText(guide)
  toast.success(t("collections.setup_guide_copied"))
}

function copyWebhookUrl() {
  navigator.clipboard.writeText(generatedWebhookUrl.value)
  toast.success(t("collections.webhook_url_copied"))
}

function generateSecret() {
  webhookConfig.secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  toast.success(t("collections.secret_generated"))
}

function addPattern(type: "include" | "exclude") {
  if (type === "include") {
    selectiveSyncConfig.includePatterns.push("")
  } else {
    selectiveSyncConfig.excludePatterns.push("")
  }
}

function removePattern(type: "include" | "exclude", index: number) {
  if (type === "include") {
    selectiveSyncConfig.includePatterns.splice(index, 1)
  } else {
    selectiveSyncConfig.excludePatterns.splice(index, 1)
  }
}

async function testErrorRecovery(errorType: string) {
  try {
    const result = await frameworkOptimizationService.performErrorRecovery(
      props.source,
      errorType
    )

    if (result.recovered) {
      toast.success(result.message)
    } else {
      toast.info(result.message)
    }
  } catch (error) {
    toast.error(t("collections.error_recovery_failed"))
  }
}

function resetToDefaults() {
  const defaults = frameworkOptimizationService.getOptimizationSettings(
    props.source.framework || "fastapi"
  )

  Object.assign(optimizationSettings, defaults)

  webhookConfig.enabled = false
  webhookConfig.events = ["push", "pull_request"]
  webhookConfig.secret = ""

  selectiveSyncConfig.includePatterns = [""]
  selectiveSyncConfig.excludePatterns = [""]
  selectiveSyncConfig.endpointFilters.methods = []

  errorRecoveryConfig.autoRetry = true
  errorRecoveryConfig.maxRetries = 3
  errorRecoveryConfig.retryDelay = 5000

  toast.success(t("collections.settings_reset"))
}

async function saveSettings() {
  try {
    // Configure webhook if enabled
    if (webhookConfig.enabled) {
      await frameworkOptimizationService.setupWebhook(
        props.source.id,
        generatedWebhookUrl.value,
        webhookConfig.events,
        webhookConfig.secret || undefined
      )
    }

    // Configure selective sync if enabled
    if (optimizationSettings.selectiveSync) {
      frameworkOptimizationService.configureSelectiveSync(props.source.id, {
        includePatterns: selectiveSyncConfig.includePatterns.filter((p) =>
          p.trim()
        ),
        excludePatterns: selectiveSyncConfig.excludePatterns.filter((p) =>
          p.trim()
        ),
        endpointFilters: selectiveSyncConfig.endpointFilters,
      })
    }

    toast.success(t("collections.settings_saved"))
  } catch (error) {
    toast.error(t("collections.settings_save_failed"))
  }
}

// Lifecycle
onMounted(() => {
  // Load existing settings
  const defaults = frameworkOptimizationService.getOptimizationSettings(
    props.source.framework || "fastapi"
  )
  Object.assign(optimizationSettings, defaults)
})
</script>

<style scoped>
.advanced-sync-settings {
  @apply space-y-8;
}

.settings-header h3 {
  @apply text-lg font-semibold mb-2;
}

.settings-header p {
  @apply text-gray-600 dark:text-gray-400;
}

.settings-content {
  @apply space-y-8;
}

.settings-section {
  @apply border border-gray-200 dark:border-gray-700 rounded-lg p-6;
}

.section-header {
  @apply flex items-center gap-3 mb-6;
}

.section-header h4 {
  @apply font-semibold;
}

.framework-info {
  @apply mb-6;
}

.info-card {
  @apply bg-gray-50 dark:bg-gray-800 rounded-lg p-4;
}

.info-card h5 {
  @apply font-semibold mb-3;
}

.setup-guide {
  @apply text-sm mb-4 font-mono bg-white dark:bg-gray-900 p-3 rounded border;
}

.optimization-settings,
.webhook-settings,
.selective-sync-settings,
.error-recovery-settings {
  @apply space-y-6;
}

.setting-group {
  @apply space-y-2;
}

.setting-label {
  @apply block font-medium;
}

.setting-description {
  @apply block text-sm text-gray-600 dark:text-gray-400 mt-1;
}

.setting-control {
  @apply flex items-center gap-2;
}

.setting-input {
  @apply px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700;
}

.setting-unit {
  @apply text-sm text-gray-500;
}

.setting-checkbox {
  @apply flex items-start gap-3 cursor-pointer;
}

.setting-checkbox input {
  @apply mt-1;
}

.webhook-config {
  @apply space-y-4 pl-6 border-l-2 border-blue-200 dark:border-blue-800;
}

.webhook-url-display {
  @apply flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded;
}

.webhook-url-display code {
  @apply flex-1 font-mono text-sm;
}

.event-checkboxes,
.method-checkboxes {
  @apply space-y-2;
}

.event-checkbox {
  @apply flex items-start gap-3 p-2 border border-gray-200 dark:border-gray-700 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800;
}

.event-description {
  @apply block text-sm text-gray-600 dark:text-gray-400 mt-1;
}

.method-checkbox {
  @apply flex items-center gap-2 cursor-pointer;
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

.secret-input {
  @apply flex gap-2;
}

.secret-input .setting-input {
  @apply flex-1;
}

.pattern-list {
  @apply space-y-2;
}

.pattern-item {
  @apply flex gap-2;
}

.pattern-input {
  @apply flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700;
}

.retry-settings {
  @apply space-y-4 pl-6 border-l-2 border-green-200 dark:border-green-800;
}

.common-errors {
  @apply mt-6;
}

.common-errors h5 {
  @apply font-semibold mb-3;
}

.error-list {
  @apply space-y-3;
}

.error-item {
  @apply flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded;
}

.error-info {
  @apply flex gap-3;
}

.error-details {
  @apply space-y-1;
}

.error-title {
  @apply block font-medium;
}

.error-solution {
  @apply block text-sm text-gray-600 dark:text-gray-400;
}

.settings-actions {
  @apply flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700;
}

.btn {
  @apply px-4 py-2 rounded font-medium transition-colors flex items-center gap-2;
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

.btn-sm {
  @apply px-2 py-1 text-sm;
}
</style>
