export interface OpenAPIFetchResult {
  success: boolean
  content?: string //The actual OpenAPI spec (JSON or YAML)
  contentType?: string //Helps us know if it's JSON or YAML
  errors: string[] //Multiple errors can occur (network + parsing)
  metadata: {
    //Debugging info and performance tracking
    url: string
    timestamp: Date
    responseTime: number
    statusCode?: number
  }
}

export interface FetchOptions {
  timeout?: number //Different APIs need different timeouts (FastAPI is fast, Spring can be slow)
  headers?: Record<string, string> //Auth tokens, API keys, custom headers
  retries?: number //Network can be flaky in development
  followRedirects?: boolean //Some servers redirect /openapi.json → /docs/openapi.json
}

export interface ConnectionTestResult {
  statusCode: number
  isReachable: boolean //Can we connect at all?
  responseTime: number
  corsEnabled: boolean //Critical for browser-based tools
  contentType?: string
  errors: string[]
  suggestions: string[] //Framework-specific help ("Try port 8000 for FastAPI")
}

export interface OpenAPIFetcher {
  fetchSpec(url: string, options?: FetchOptions): Promise<OpenAPIFetchResult>
  testConnection(
    url: string,
    options?: FetchOptions
  ): Promise<ConnectionTestResult>
}

export class OpenAPIFetcherImpl implements OpenAPIFetcher {
  constructor() {}

  async fetchSpec(
    url: string,
    options?: FetchOptions
  ): Promise<OpenAPIFetchResult> {
    const startTime = Date.now()
    const defaultOptions: FetchOptions = {
      timeout: 10000, //10 seconds by default
      headers: {},
      retries: 2,
      followRedirects: true,
    }

    const finalOptions = { ...defaultOptions, ...options }

    //Retry logic wrapper
    let lastError: any

    for (let attempt = 0; attempt <= finalOptions.retries!; attempt++) {
      try {
        const result = await this.attemptFetch(url, finalOptions, startTime)
        return result
      } catch (error) {
        lastError = error

        //Don't retry some errors that are pointless to retry.
        if (this.shouldNotRetry(error)) {
          break
        }

        //wait some time before retry (exponential backoff)
        if (attempt < finalOptions.retries!) {
          await this.delay(Math.pow(2, attempt) * 1000)
        }
      }
    }

    //all retries failed
    return this.handleFetchError(url, startTime, lastError)
  }

  private async attemptFetch(
    url: string,
    options: FetchOptions,
    startTime: number
  ): Promise<OpenAPIFetchResult> {
    //Step 1: Set up timeout control
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), options.timeout!)

    try {
      //Phase 2: make the https request.
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json, application/x-yaml, text/yaml, text/plain",
          ...options.headers,
        },
        signal: controller.signal,
        redirect: options.followRedirects ? "follow" : "manual",
      })

      clearTimeout(timeoutId)

      //Phase 3: Check response status
      if (!response.ok) {
        // Throw error so retry logic can handle it
        const error = new Error(
          `HTTP ${response.status}: ${response.statusText}`
        )
        ;(error as any).response = { status: response.status }
        throw error
      }

      //Phase 4: Get and validate content
      const content = await response.text()
      const contentType = response.headers.get("content-type") || "unknown"

      //Phase 5: Basic OpenAPI validation (we'll implement this)
      const validationErrors = this.validateOpenAPIContent(content, contentType)

      return {
        success: validationErrors.length === 0,
        content: validationErrors.length === 0 ? content : undefined,
        contentType,
        errors: validationErrors,
        metadata: {
          url,
          timestamp: new Date(),
          responseTime: Date.now() - startTime,
          statusCode: response.status,
        },
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  private shouldNotRetry(error: any): boolean {
    //These errors don't need to be retried, since they won't get better.
    return (
      error.name === "AbortError" ||
      error.message.includes("CORS") ||
      (error.response &&
        error.response.status >= 400 &&
        error.response.status < 500)
    )
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async testConnection(
    url: string,
    options?: FetchOptions
  ): Promise<ConnectionTestResult> {
    const startTime = Date.now()
    const defaultOptions: FetchOptions = {
      timeout: 5000, //shorter timeout for connection test
      headers: {},
      retries: 0, //No retries for tesing
      followRedirects: true,
    }

    const finalOptions = { ...defaultOptions, ...options }

    try {
      // Try HEAD first (more efficient, no body transfer)
      const headController = new AbortController()
      const headTimeoutId = setTimeout(
        () => headController.abort(),
        finalOptions.timeout!
      )

      let response = await fetch(url, {
        method: "HEAD",
        headers: finalOptions.headers,
        signal: headController.signal,
        redirect: finalOptions.followRedirects ? "follow" : "manual",
      })

      clearTimeout(headTimeoutId)

      // If HEAD returns 404/405, some servers (like ASP.NET Swagger) don't support HEAD
      // Fall back to GET for validation if this looks like an OpenAPI endpoint
      const isOpenAPIEndpoint =
        url.includes("/swagger/") ||
        url.includes("/openapi") ||
        url.includes("/api-docs") ||
        url.includes("/api/") ||
        url.endsWith(".json") ||
        url.endsWith(".yaml") ||
        url.endsWith(".yml")

      if (
        (response.status === 404 || response.status === 405) &&
        isOpenAPIEndpoint
      ) {
        // Try GET as fallback
        const getController = new AbortController()
        const getTimeoutId = setTimeout(
          () => getController.abort(),
          finalOptions.timeout!
        )

        try {
          response = await fetch(url, {
            method: "GET",
            headers: {
              ...finalOptions.headers,
              Accept: "application/json, application/x-yaml, text/yaml",
            },
            signal: getController.signal,
            redirect: finalOptions.followRedirects ? "follow" : "manual",
          })
          clearTimeout(getTimeoutId)
        } catch (getError) {
          clearTimeout(getTimeoutId)
          throw getError
        }
      }

      // Check CORS headers
      const corsEnabled = this.checkCORSHeaders(response)
      const contentType = response.headers.get("content-type")

      return {
        statusCode: response.status,
        isReachable: true,
        responseTime: Date.now() - startTime,
        corsEnabled,
        contentType: contentType || undefined,
        errors: response.ok
          ? []
          : [`HTTP ${response.status}: ${response.statusText}`],
        suggestions: this.generateSuggestions(
          url,
          response.status,
          corsEnabled
        ),
      }
    } catch (error) {
      return {
        statusCode: 0,
        isReachable: false,
        responseTime: Date.now() - startTime,
        corsEnabled: false,
        errors: [this.categorizeConnectionError(error)],
        suggestions: this.generateErrorSuggestions(url, error),
      }
    }
  }

  private createErrorResult(
    url: string,
    startTime: number,
    errors: string[],
    statusCode?: number
  ): OpenAPIFetchResult {
    return {
      success: false,
      errors,
      metadata: {
        url,
        timestamp: new Date(),
        responseTime: Date.now() - startTime,
        statusCode,
      },
    }
  }

  private validateOpenAPIContent(
    content: string,
    contentType: string
  ): string[] {
    const errors: string[] = []

    // Basic validation - we'll expand this
    if (!content || content.trim().length === 0) {
      errors.push("Empty response content")
      return errors
    }

    // Try to parse as JSON first
    if (contentType.includes("json")) {
      try {
        const parsed = JSON.parse(content)
        if (!parsed.openapi && !parsed.swagger) {
          errors.push("Response does not appear to be an OpenAPI specification")
        }
      } catch (e) {
        errors.push("Invalid JSON format")
      }
    }

    // TODO: Add YAML validation later

    return errors
  }

  private handleFetchError(
    url: string,
    startTime: number,
    error: any
  ): OpenAPIFetchResult {
    const errors: string[] = []
    let statusCode: number | undefined

    // Check if this is an HTTP error (thrown from attemptFetch)
    if (error.response && error.response.status) {
      statusCode = error.response.status
      errors.push(error.message) // This will be "HTTP 404: Not Found"
    } else if (error.name === "AbortError") {
      errors.push("Request timeout - server may be slow or unreachable")
    } else if (error.message.includes("CORS")) {
      errors.push("CORS error - server needs to allow cross-origin requests")
    } else if (error.message.includes("ECONNREFUSED")) {
      errors.push("Connection refused - server may not be running")
    } else {
      errors.push(`Network error: ${error.message}`)
    }

    return this.createErrorResult(url, startTime, errors, statusCode)
  }

  private checkCORSHeaders(response: Response): boolean {
    const corsHeader = response.headers.get("access-control-allow-origin")
    return (
      corsHeader !== null &&
      (corsHeader === "*" || corsHeader.includes("localhost"))
    )
  }

  private generateSuggestions(
    url: string,
    statusCode: number,
    corsEnabled: boolean
  ): string[] {
    const suggestions: string[] = []

    if (statusCode === 404) {
      // Framework-specific endpoint suggestions
      if (
        url.includes("/swagger/v1/swagger.json") ||
        url.includes(":5000") ||
        url.includes(":5001")
      ) {
        suggestions.push(
          "ASP.NET: Verify /swagger/v1/swagger.json endpoint exists"
        )
        suggestions.push(
          "Ensure Program.cs includes: builder.Services.AddSwaggerGen() and app.UseSwagger()"
        )
      } else {
        suggestions.push(
          "Try common OpenAPI endpoints: /openapi.json, /api-docs, /v3/api-docs, /swagger/v1/swagger.json"
        )
      }
    }

    if (!corsEnabled) {
      suggestions.push(
        "Enable CORS on your development server for cross-origin requests"
      )
    }

    // Framework-specific suggestions based on URL
    if (url.includes(":5000") || url.includes(":5001")) {
      suggestions.push(
        "ASP.NET Core detected - ensure Swagger is enabled in Program.cs"
      )
      if (statusCode === 404) {
        suggestions.push(
          "Verify that app.UseSwagger() is called and the endpoint is /swagger/v1/swagger.json"
        )
        suggestions.push("Check if the app is running with: dotnet run")
      }
    } else if (url.includes(":8000")) {
      suggestions.push(
        "FastAPI detected - ensure your app is running with: uvicorn main:app --reload"
      )
    } else if (url.includes(":3000")) {
      suggestions.push(
        "Express.js detected - check if swagger middleware is configured"
      )
    } else if (url.includes(":8080")) {
      suggestions.push(
        "Spring Boot detected - ensure springdoc-openapi dependency is included"
      )
    }

    return suggestions
  }

  private generateErrorSuggestions(url: string, error: any): string[] {
    const suggestions: string[] = []

    if (error.name === "AbortError") {
      suggestions.push(
        "Server is taking too long to respond - check if it's running"
      )
    } else if (error.message.includes("ECONNREFUSED")) {
      suggestions.push("Connection refused - start your development server")

      // Port-specific suggestions
      if (url.includes(":8000")) {
        suggestions.push(
          "For FastAPI: uvicorn main:app --reload --host 0.0.0.0"
        )
      }
    }

    return suggestions
  }

  private categorizeConnectionError(error: any): string {
    if (error.name === "AbortError") {
      return "Connection timeout - server may be down or slow"
    } else if (error.message.includes("ECONNREFUSED")) {
      return "Connection refused - server is not running"
    } else if (error.message.includes("CORS")) {
      return "CORS error - server needs cross-origin configuration"
    }
    return `Network error: ${error.message}`
  }
}
