/**
 * Framework Optimization Service
 * Provides framework-specific optimizations and advanced features
 */

import type {
  FrameworkType,
  LiveSpecSource,
  SyncResult,
} from "../types/live-spec-source"
import type { SpecDiff } from "../types/spec-diff"
import { changeNotificationService } from "./change-notification.service"

export interface FrameworkConfig {
  name: FrameworkType
  displayName: string
  defaultEndpoints: string[]
  commonPorts: number[]
  setupGuide: string
  errorMessages: Record<string, string>
  syncTriggers: {
    webhookSupport: boolean
    fileWatchPatterns: string[]
    customTriggers: string[]
  }
  optimizations: {
    debounceMs: number
    batchUpdates: boolean
    selectiveSync: boolean
  }
}

export interface WebhookConfig {
  sourceId: string
  webhookUrl: string
  secret?: string
  events: string[]
  isActive: boolean
}

export interface SelectiveSyncConfig {
  sourceId: string
  includePatterns: string[]
  excludePatterns: string[]
  endpointFilters: {
    methods: string[]
    tags: string[]
    paths: string[]
  }
}

class FrameworkOptimizationService {
  private frameworkConfigs: Map<FrameworkType, FrameworkConfig> = new Map()
  private webhookConfigs: Map<string, WebhookConfig> = new Map()
  private selectiveSyncConfigs: Map<string, SelectiveSyncConfig> = new Map()

  constructor() {
    this.initializeFrameworkConfigs()
  }

  /**
   * Get framework-specific configuration
   */
  getFrameworkConfig(framework: FrameworkType): FrameworkConfig | null {
    return this.frameworkConfigs.get(framework) || null
  }

  /**
   * Get framework-specific setup guide
   */
  getSetupGuide(framework: FrameworkType): string {
    const config = this.getFrameworkConfig(framework)
    return config?.setupGuide || this.getGenericSetupGuide()
  }

  /**
   * Get framework-specific error message
   */
  getFrameworkErrorMessage(
    framework: FrameworkType,
    errorType: string
  ): string {
    const config = this.getFrameworkConfig(framework)
    return (
      config?.errorMessages[errorType] || this.getGenericErrorMessage(errorType)
    )
  }

  /**
   * Setup webhook for CI/CD integration
   */
  async setupWebhook(
    sourceId: string,
    webhookUrl: string,
    events: string[] = ["push", "pull_request"],
    secret?: string
  ): Promise<WebhookConfig> {
    const webhookConfig: WebhookConfig = {
      sourceId,
      webhookUrl,
      secret,
      events,
      isActive: true,
    }

    this.webhookConfigs.set(sourceId, webhookConfig)

    changeNotificationService.showToast({
      type: "success",
      title: "Webhook Configured",
      message: "CI/CD webhook integration is now active",
    })

    return webhookConfig
  }

  /**
   * Handle webhook trigger
   */
  async handleWebhookTrigger(
    sourceId: string,
    event: string,
    payload: any
  ): Promise<SyncResult | null> {
    const webhookConfig = this.webhookConfigs.get(sourceId)
    if (!webhookConfig || !webhookConfig.isActive) {
      return null
    }

    if (!webhookConfig.events.includes(event)) {
      return null
    }

    // Validate webhook secret if configured
    if (
      webhookConfig.secret &&
      !this.validateWebhookSecret(payload, webhookConfig.secret)
    ) {
      throw new Error("Invalid webhook secret")
    }

    // Trigger sync based on the event
    const syncResult = await this.triggerFrameworkSpecificSync(
      sourceId,
      event,
      payload
    )

    changeNotificationService.showToast({
      type: syncResult.success ? "success" : "error",
      title: "Webhook Sync",
      message: syncResult.success
        ? `Sync triggered by ${event} event`
        : `Webhook sync failed: ${syncResult.errors.join(", ")}`,
    })

    return syncResult
  }

  /**
   * Configure selective endpoint synchronization
   */
  configureSelectiveSync(
    sourceId: string,
    config: Omit<SelectiveSyncConfig, "sourceId">
  ): void {
    const selectiveConfig: SelectiveSyncConfig = {
      sourceId,
      ...config,
    }

    this.selectiveSyncConfigs.set(sourceId, selectiveConfig)

    changeNotificationService.showToast({
      type: "success",
      title: "Selective Sync Configured",
      message: "Only matching endpoints will be synchronized",
    })
  }

  /**
   * Apply selective sync filtering to changes
   */
  applySelectiveSync(sourceId: string, changes: SpecDiff): SpecDiff {
    const config = this.selectiveSyncConfigs.get(sourceId)
    if (!config) {
      return changes
    }

    const filteredEndpoints = changes.endpoints.filter((endpoint) => {
      // Check include patterns
      if (config.includePatterns.length > 0) {
        const included = config.includePatterns.some((pattern) =>
          this.matchesPattern(endpoint.path, pattern)
        )
        if (!included) return false
      }

      // Check exclude patterns
      if (config.excludePatterns.length > 0) {
        const excluded = config.excludePatterns.some((pattern) =>
          this.matchesPattern(endpoint.path, pattern)
        )
        if (excluded) return false
      }

      // Check method filters
      if (config.endpointFilters.methods.length > 0) {
        if (
          !config.endpointFilters.methods.includes(
            endpoint.method.toLowerCase()
          )
        ) {
          return false
        }
      }

      return true
    })

    return {
      ...changes,
      endpoints: filteredEndpoints,
      hasChanges: filteredEndpoints.length > 0,
    }
  }

  /**
   * Get framework-specific sync optimization settings
   */
  getOptimizationSettings(
    framework: FrameworkType
  ): FrameworkConfig["optimizations"] {
    const config = this.getFrameworkConfig(framework)
    return (
      config?.optimizations || {
        debounceMs: 500,
        batchUpdates: false,
        selectiveSync: false,
      }
    )
  }

  /**
   * Perform framework-specific error recovery
   */
  async performErrorRecovery(
    source: LiveSpecSource,
    error: string
  ): Promise<{ recovered: boolean; message: string }> {
    const framework = source.framework
    if (!framework) {
      return { recovered: false, message: "No framework detected for recovery" }
    }

    const config = this.getFrameworkConfig(framework)
    if (!config) {
      return { recovered: false, message: "Framework configuration not found" }
    }

    // Framework-specific recovery strategies
    switch (framework) {
      case "fastapi":
        return await this.recoverFastAPI(source, error)
      case "express":
        return await this.recoverExpress(source, error)
      case "spring":
        return await this.recoverSpring(source, error)
      case "aspnet":
        return await this.recoverASPNet(source, error)
      default:
        return await this.recoverGeneric(source, error)
    }
  }

  // Private methods
  private initializeFrameworkConfigs(): void {
    // FastAPI Configuration
    this.frameworkConfigs.set("fastapi", {
      name: "fastapi",
      displayName: "FastAPI",
      defaultEndpoints: ["/openapi.json", "/docs/openapi.json"],
      commonPorts: [8000, 8080, 3000],
      setupGuide: `
# FastAPI Live Sync Setup

1. Ensure your FastAPI app is running in development mode
2. The OpenAPI spec is typically available at \`/openapi.json\`
3. Make sure CORS is configured for local development:

\`\`\`python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Hoppscotch URL
    allow_methods=["GET"],
    allow_headers=["*"],
)
\`\`\`
      `,
      errorMessages: {
        connection_failed:
          "FastAPI server not running. Start with: uvicorn main:app --reload",
        cors_error:
          "CORS not configured. Add CORSMiddleware to your FastAPI app",
        spec_not_found:
          "OpenAPI spec not found. Check if /openapi.json is accessible",
      },
      syncTriggers: {
        webhookSupport: true,
        fileWatchPatterns: ["**/*.py", "**/openapi.json"],
        customTriggers: ["uvicorn-reload", "file-change"],
      },
      optimizations: {
        debounceMs: 1000, // FastAPI reload can be slow
        batchUpdates: true,
        selectiveSync: true,
      },
    })

    // Express Configuration
    this.frameworkConfigs.set("express", {
      name: "express",
      displayName: "Express.js",
      defaultEndpoints: ["/api-docs", "/swagger.json", "/openapi.json"],
      commonPorts: [3000, 8000, 8080],
      setupGuide: `
# Express.js Live Sync Setup

1. Install swagger-jsdoc and swagger-ui-express:
   \`npm install swagger-jsdoc swagger-ui-express\`

2. Configure Swagger in your Express app:

\`\`\`javascript
const swaggerJsdoc = require('swagger-jsdoc')
const swaggerUi = require('swagger-ui-express')

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'API', version: '1.0.0' }
  },
  apis: ['./routes/*.js']
}

const specs = swaggerJsdoc(options)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs))
app.get('/openapi.json', (req, res) => res.json(specs))
\`\`\`
      `,
      errorMessages: {
        connection_failed:
          "Express server not running. Start with: npm start or node server.js",
        cors_error:
          "CORS not configured. Install and configure cors middleware",
        spec_not_found:
          "Swagger not configured. Install swagger-jsdoc and swagger-ui-express",
      },
      syncTriggers: {
        webhookSupport: true,
        fileWatchPatterns: ["**/*.js", "**/*.ts", "**/swagger.json"],
        customTriggers: ["nodemon-restart", "file-change"],
      },
      optimizations: {
        debounceMs: 500,
        batchUpdates: true,
        selectiveSync: true,
      },
    })

    // Spring Boot Configuration
    this.frameworkConfigs.set("spring", {
      name: "spring",
      displayName: "Spring Boot",
      defaultEndpoints: ["/v3/api-docs", "/api-docs", "/swagger-ui.html"],
      commonPorts: [8080, 8090, 9000],
      setupGuide: `
# Spring Boot Live Sync Setup

1. Add springdoc-openapi dependency:

\`\`\`xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-ui</artifactId>
    <version>1.7.0</version>
</dependency>
\`\`\`

2. Configure CORS in your application:

\`\`\`java
@CrossOrigin(origins = "http://localhost:3000")
@RestController
public class ApiController {
    // Your endpoints
}
\`\`\`
      `,
      errorMessages: {
        connection_failed:
          "Spring Boot app not running. Start with: ./mvnw spring-boot:run",
        cors_error:
          "CORS not configured. Add @CrossOrigin annotation or configure globally",
        spec_not_found:
          "springdoc-openapi not configured. Add dependency and restart",
      },
      syncTriggers: {
        webhookSupport: true,
        fileWatchPatterns: [
          "**/*.java",
          "**/application.yml",
          "**/application.properties",
        ],
        customTriggers: ["spring-devtools-restart", "maven-compile"],
      },
      optimizations: {
        debounceMs: 2000, // Spring Boot restart can be slow
        batchUpdates: true,
        selectiveSync: true,
      },
    })

    // ASP.NET Configuration
    this.frameworkConfigs.set("aspnet", {
      name: "aspnet",
      displayName: "ASP.NET Core",
      defaultEndpoints: ["/swagger/v1/swagger.json", "/swagger.json"],
      commonPorts: [5000, 5001, 7000, 7001],
      setupGuide: `
# ASP.NET Core Live Sync Setup

1. Ensure Swagger is configured in Program.cs:

\`\`\`csharp
builder.Services.AddSwaggerGen();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
\`\`\`

2. Configure CORS for development:

\`\`\`csharp
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

app.UseCors();
\`\`\`
      `,
      errorMessages: {
        connection_failed: "ASP.NET app not running. Start with: dotnet run",
        cors_error: "CORS not configured. Add CORS policy in Program.cs",
        spec_not_found:
          "Swagger not configured. Add AddSwaggerGen() and UseSwagger()",
      },
      syncTriggers: {
        webhookSupport: true,
        fileWatchPatterns: ["**/*.cs", "**/appsettings.json"],
        customTriggers: ["dotnet-watch", "file-change"],
      },
      optimizations: {
        debounceMs: 1500,
        batchUpdates: true,
        selectiveSync: true,
      },
    })
  }

  private async recoverFastAPI(
    source: LiveSpecSource,
    error: string
  ): Promise<{ recovered: boolean; message: string }> {
    if (error.includes("CORS")) {
      return {
        recovered: false,
        message:
          "Add CORS middleware to your FastAPI app. See setup guide for details.",
      }
    }

    if (
      error.includes("Connection refused") ||
      error.includes("ECONNREFUSED")
    ) {
      // Try common FastAPI ports
      const commonPorts = [8000, 8080, 3000]
      for (const port of commonPorts) {
        const testUrl = source.url?.replace(/:\d+/, `:${port}`)
        if (testUrl && testUrl !== source.url) {
          try {
            const response = await fetch(testUrl, { method: "HEAD" })
            if (response.ok) {
              return {
                recovered: true,
                message: `Found FastAPI server on port ${port}. Update your source URL.`,
              }
            }
          } catch {
            // Continue trying other ports
          }
        }
      }

      return {
        recovered: false,
        message:
          "FastAPI server not found on common ports. Start with: uvicorn main:app --reload",
      }
    }

    return {
      recovered: false,
      message: "Unknown FastAPI error. Check server logs.",
    }
  }

  private async recoverExpress(
    source: LiveSpecSource,
    error: string
  ): Promise<{ recovered: boolean; message: string }> {
    if (error.includes("CORS")) {
      return {
        recovered: false,
        message: "Install and configure CORS middleware: npm install cors",
      }
    }

    if (error.includes("404") && source.url?.includes("/api-docs")) {
      // Try alternative endpoints
      const alternatives = ["/swagger.json", "/openapi.json", "/docs"]
      for (const alt of alternatives) {
        const testUrl = source.url.replace("/api-docs", alt)
        try {
          const response = await fetch(testUrl, { method: "HEAD" })
          if (response.ok) {
            return {
              recovered: true,
              message: `Found OpenAPI spec at ${alt}. Update your source URL.`,
            }
          }
        } catch {
          // Continue trying
        }
      }
    }

    return {
      recovered: false,
      message: "Check if swagger-jsdoc is configured correctly.",
    }
  }

  private async recoverSpring(
    source: LiveSpecSource,
    error: string
  ): Promise<{ recovered: boolean; message: string }> {
    if (error.includes("404") && source.url?.includes("/v3/api-docs")) {
      // Try alternative endpoints
      const alternatives = ["/api-docs", "/swagger-ui.html"]
      for (const alt of alternatives) {
        const testUrl = source.url.replace("/v3/api-docs", alt)
        try {
          const response = await fetch(testUrl, { method: "HEAD" })
          if (response.ok) {
            return {
              recovered: true,
              message: `Found OpenAPI spec at ${alt}. Update your source URL.`,
            }
          }
        } catch {
          // Continue trying
        }
      }
    }

    return {
      recovered: false,
      message:
        "Ensure springdoc-openapi dependency is added and app is restarted.",
    }
  }

  private async recoverASPNet(
    source: LiveSpecSource,
    error: string
  ): Promise<{ recovered: boolean; message: string }> {
    if (error.includes("404")) {
      return {
        recovered: false,
        message:
          "Swagger not configured. Add AddSwaggerGen() and UseSwagger() in Program.cs",
      }
    }

    return {
      recovered: false,
      message: "Check ASP.NET Core configuration and restart the application.",
    }
  }

  private async recoverGeneric(
    _source: LiveSpecSource, // eslint-disable-line @typescript-eslint/no-unused-vars
    _error: string // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{ recovered: boolean; message: string }> {
    return {
      recovered: false,
      message:
        "Check your development server configuration and ensure OpenAPI spec is accessible.",
    }
  }

  private getGenericSetupGuide(): string {
    return `
# Generic API Live Sync Setup

1. Ensure your development server is running
2. Make sure OpenAPI/Swagger specification is accessible
3. Configure CORS to allow requests from Hoppscotch
4. Common endpoints to try:
   - /openapi.json
   - /api-docs
   - /swagger.json
   - /v3/api-docs
    `
  }

  private getGenericErrorMessage(errorType: string): string {
    const messages: Record<string, string> = {
      connection_failed:
        "Development server not accessible. Check if it's running.",
      cors_error: "CORS not configured. Allow requests from Hoppscotch origin.",
      spec_not_found: "OpenAPI specification not found. Check endpoint URL.",
      invalid_spec: "Invalid OpenAPI specification format.",
    }
    return messages[errorType] || "An error occurred during sync."
  }

  private validateWebhookSecret(payload: any, secret: string): boolean {
    // Simplified webhook secret validation
    // In a real implementation, you'd validate HMAC signatures
    return payload.secret === secret
  }

  private async triggerFrameworkSpecificSync(
    sourceId: string,
    event: string,
    _payload: any // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<SyncResult> {
    // This would integrate with the sync engine
    // For now, return a mock result
    return {
      success: true,
      hasChanges: true,
      changesSummary: [`Sync triggered by ${event} webhook`],
      errors: [],
      timestamp: new Date(),
    }
  }

  private matchesPattern(path: string, pattern: string): boolean {
    // Simple glob pattern matching
    const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".")

    return new RegExp(`^${regexPattern}$`).test(path)
  }
}

// Export singleton instance
export const frameworkOptimizationService = new FrameworkOptimizationService()
export default frameworkOptimizationService
