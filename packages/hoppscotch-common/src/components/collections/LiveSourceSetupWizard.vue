<template>
  <div class="live-source-setup-wizard">
    <!-- Header -->
    <div class="wizard-header">
      <div class="flex items-center space-x-3">
        <icon-lucide-zap class="svg-icons text-accent" />
        <div>
          <h3 class="text-lg font-semibold text-primaryLight">
            {{ t("collections.live_source_setup") }}
          </h3>
          <p class="text-sm text-secondaryLight">
            {{ t("collections.live_source_setup_description") }}
          </p>
        </div>
      </div>
    </div>

    <!-- Step Indicator -->
    <div class="wizard-steps">
      <div class="flex items-center justify-between mb-6">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          class="flex items-center"
          :class="{ 'flex-1': index < steps.length - 1 }"
        >
          <div
            class="step-indicator"
            :class="{
              active: currentStep >= index,
              completed: currentStep > index,
            }"
          >
            <icon-lucide-check v-if="currentStep > index" class="svg-icons" />
            <span v-else>{{ index + 1 }}</span>
          </div>
          <div v-if="index < steps.length - 1" class="step-connector" />
        </div>
      </div>
    </div>

    <!-- Step Content -->
    <div class="wizard-content">
      <!-- Step 1: Source Type Selection -->
      <div v-if="currentStep === 0" class="step-content">
        <h4 class="text-md font-medium text-primaryLight mb-4">
          {{ t("collections.select_source_type") }}
        </h4>

        <div class="source-type-options">
          <div
            v-for="option in sourceTypeOptions"
            :key="option.type"
            class="source-option"
            :class="{ selected: formData.sourceType === option.type }"
            @click="selectSourceType(option.type)"
          >
            <div class="flex items-start space-x-3">
              <component :is="option.icon" class="svg-icons text-accent mt-1" />
              <div class="flex-1">
                <h5 class="font-medium text-primaryLight">
                  {{ option.title }}
                </h5>
                <p class="text-sm text-secondaryLight mt-1">
                  {{ option.description }}
                </p>
                <div
                  v-if="option.examples"
                  class="text-xs text-secondaryDark mt-2"
                >
                  <span class="font-medium"
                    >{{ t("collections.examples") }}:</span
                  >
                  {{ option.examples.join(", ") }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: Source Configuration -->
      <div v-if="currentStep === 1" class="step-content">
        <h4 class="text-md font-medium text-primaryLight mb-4">
          {{ t("collections.configure_source") }}
        </h4>

        <!-- URL Input for Development Server -->
        <div v-if="formData.sourceType === 'url'" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-primaryLight mb-2">
              {{ t("collections.development_server_url") }}
            </label>
            <div class="relative">
              <input
                v-model="formData.sourceUrl"
                type="url"
                class="input-field"
                :placeholder="t('collections.url_placeholder')"
                @input="validateUrl"
                @blur="testConnection"
              />
              <div v-if="urlValidation.testing" class="absolute right-3 top-3">
                <SmartSpinner class="w-4 h-4" />
              </div>
              <div
                v-else-if="urlValidation.status"
                class="absolute right-3 top-3"
              >
                <icon-lucide-check-circle
                  v-if="urlValidation.status === 'success'"
                  class="svg-icons text-green-500"
                />
                <icon-lucide-x-circle v-else class="svg-icons text-red-500" />
              </div>
            </div>
            <div
              v-if="urlValidation.message"
              class="mt-2 text-sm"
              :class="{
                'text-green-600': urlValidation.status === 'success',
                'text-red-600': urlValidation.status === 'error',
              }"
            >
              {{ urlValidation.message }}
            </div>
          </div>

          <!-- Common Endpoints Helper -->
          <div class="common-endpoints">
            <p class="text-sm text-secondaryLight mb-2">
              {{ t("collections.common_endpoints") }}:
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="endpoint in commonEndpoints"
                :key="endpoint"
                class="endpoint-suggestion"
                @click="suggestEndpoint(endpoint)"
              >
                {{ endpoint }}
              </button>
            </div>
          </div>
        </div>

        <!-- File Path Input -->
        <div v-if="formData.sourceType === 'file'" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-primaryLight mb-2">
              {{ t("collections.spec_file_path") }}
            </label>
            <input
              v-model="formData.filePath"
              type="text"
              class="input-field"
              :placeholder="t('collections.file_path_placeholder')"
              @input="validateFilePath"
            />
            <div
              v-if="fileValidation.message"
              class="mt-2 text-sm"
              :class="{
                'text-green-600': fileValidation.status === 'success',
                'text-red-600': fileValidation.status === 'error',
              }"
            >
              {{ fileValidation.message }}
            </div>
          </div>
        </div>

        <!-- Collection Name -->
        <div class="mt-6">
          <label class="block text-sm font-medium text-primaryLight mb-2">
            {{ t("collections.collection_name") }}
          </label>
          <input
            v-model="formData.collectionName"
            type="text"
            class="input-field"
            :placeholder="t('collections.collection_name_placeholder')"
          />
        </div>
      </div>
      <!-- Step 3: Framework Detection & Preview -->
      <div v-if="currentStep === 2" class="step-content">
        <h4 class="text-md font-medium text-primaryLight mb-4">
          {{ t("collections.framework_detection") }}
        </h4>

        <!-- Framework Detection Results -->
        <div
          v-if="frameworkDetection.loading"
          class="framework-detection loading"
        >
          <SmartSpinner class="w-6 h-6" />
          <span class="ml-3">{{ t("collections.detecting_framework") }}</span>
        </div>

        <div
          v-else-if="frameworkDetection.results.length > 0"
          class="framework-detection results"
        >
          <div class="detected-frameworks">
            <h5 class="font-medium text-primaryLight mb-3">
              {{ t("collections.detected_frameworks") }}
            </h5>
            <div class="framework-list">
              <div
                v-for="framework in frameworkDetection.results"
                :key="framework.name"
                class="framework-item"
                :class="{ selected: formData.framework === framework.name }"
                @click="selectFramework(framework.name)"
              >
                <div class="flex items-center space-x-3">
                  <div class="framework-icon">
                    <component
                      :is="getFrameworkIcon(framework.name)"
                      class="svg-icons"
                    />
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center space-x-2">
                      <span class="font-medium text-primaryLight">{{
                        framework.displayName
                      }}</span>
                      <div
                        class="confidence-badge"
                        :class="getConfidenceClass(framework.confidence)"
                      >
                        {{ Math.round(framework.confidence * 100) }}%
                      </div>
                    </div>
                    <p class="text-sm text-secondaryLight">
                      {{ framework.description }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Framework-specific Setup Guide -->
          <div v-if="formData.framework" class="setup-guide mt-6">
            <h5 class="font-medium text-primaryLight mb-3">
              {{
                t("collections.setup_guide_for", {
                  framework: getFrameworkDisplayName(formData.framework),
                })
              }}
            </h5>
            <div class="guide-content">
              <component :is="getSetupGuideComponent(formData.framework)" />
            </div>
          </div>
        </div>

        <div v-else class="framework-detection no-results">
          <div class="text-center py-6">
            <icon-lucide-help-circle
              class="svg-icons text-secondaryLight mx-auto mb-3"
            />
            <p class="text-secondaryLight">
              {{ t("collections.no_framework_detected") }}
            </p>
            <button class="btn-secondary mt-3" @click="retryFrameworkDetection">
              {{ t("collections.retry_detection") }}
            </button>
          </div>
        </div>

        <!-- Collection Preview -->
        <div v-if="previewData" class="collection-preview mt-8">
          <h5 class="font-medium text-primaryLight mb-3">
            {{ t("collections.collection_preview") }}
          </h5>
          <div class="preview-content">
            <div class="preview-header">
              <icon-lucide-folder class="svg-icons text-accent" />
              <span class="font-medium">{{ previewData.name }}</span>
              <span class="text-sm text-secondaryLight ml-2">
                ({{ previewData.requestCount }} {{ t("collections.requests") }})
              </span>
            </div>
            <div class="preview-endpoints">
              <div
                v-for="endpoint in previewData.endpoints.slice(0, 5)"
                :key="endpoint.path"
                class="endpoint-item"
              >
                <div
                  class="method-badge"
                  :class="endpoint.method.toLowerCase()"
                >
                  {{ endpoint.method }}
                </div>
                <span class="endpoint-path">{{ endpoint.path }}</span>
                <span class="endpoint-summary">{{ endpoint.summary }}</span>
              </div>
              <div
                v-if="previewData.endpoints.length > 5"
                class="text-sm text-secondaryLight mt-2"
              >
                {{
                  t("collections.and_more_endpoints", {
                    count: previewData.endpoints.length - 5,
                  })
                }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 4: Confirmation -->
      <div v-if="currentStep === 3" class="step-content">
        <h4 class="text-md font-medium text-primaryLight mb-4">
          {{ t("collections.confirm_setup") }}
        </h4>

        <div class="confirmation-summary">
          <div class="summary-item">
            <span class="label">{{ t("collections.source_type") }}:</span>
            <span class="value">{{
              getSourceTypeLabel(formData.sourceType)
            }}</span>
          </div>
          <div class="summary-item">
            <span class="label">{{ t("collections.source_location") }}:</span>
            <span class="value">{{
              formData.sourceUrl || formData.filePath
            }}</span>
          </div>
          <div class="summary-item">
            <span class="label">{{ t("collections.collection_name") }}:</span>
            <span class="value">{{ formData.collectionName }}</span>
          </div>
          <div v-if="formData.framework" class="summary-item">
            <span class="label">{{ t("collections.framework") }}:</span>
            <span class="value">{{
              getFrameworkDisplayName(formData.framework)
            }}</span>
          </div>
        </div>

        <div class="sync-options mt-6">
          <h5 class="font-medium text-primaryLight mb-3">
            {{ t("collections.sync_options") }}
          </h5>
          <div class="option-group">
            <label class="checkbox-label">
              <input
                v-model="formData.autoSync"
                type="checkbox"
                class="checkbox"
              />
              <span>{{ t("collections.enable_auto_sync") }}</span>
            </label>
            <p class="text-sm text-secondaryLight mt-1">
              {{ t("collections.auto_sync_description") }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <div class="wizard-navigation">
      <div
        class="flex justify-between items-center pt-6 border-t border-dividerLight"
      >
        <button
          v-if="currentStep > 0"
          class="btn-secondary"
          @click="previousStep"
        >
          {{ t("action.back") }}
        </button>
        <div v-else></div>

        <div class="flex space-x-3">
          <button
            v-if="currentStep < steps.length - 1"
            class="btn-primary"
            :disabled="!canProceed"
            @click="nextStep"
          >
            {{ t("action.next") }}
          </button>
          <button
            v-else
            class="btn-primary"
            :disabled="!canComplete || isCreating"
            @click="createLiveSource"
          >
            <SmartSpinner v-if="isCreating" class="w-4 h-4 mr-2" />
            {{ t("collections.create_live_source") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<scri pt setup lang="ts"></scri>
