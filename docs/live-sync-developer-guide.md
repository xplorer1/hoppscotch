# Live Sync Developer Guide

*Complete guide for developers working with Hoppscotch Live Sync*

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Getting Started](#getting-started)
4. [Framework Support](#framework-support)
5. [API Reference](#api-reference)
6. [Integration Guide](#integration-guide)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)
9. [Contributing](#contributing)

## 🎯 Overview

Live Sync is a revolutionary feature that automatically synchronizes your API collections with your development server's OpenAPI specification. As you modify your API code, your Hoppscotch collections update in real-time, eliminating the need for manual imports and ensuring your API documentation is always current.

### Key Features

- **Real-time Synchronization**: Automatic updates as you code
- **Framework Intelligence**: Optimized for FastAPI, Express, Spring Boot, ASP.NET, and more
- **Team Collaboration**: Shared sources with conflict resolution
- **Performance Monitoring**: Built-in performance tracking and optimization
- **Error Recovery**: Intelligent error handling with framework-specific guidance
- **Platform Integration**: Works across web, desktop, and extension platforms

## 🏗️ Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Live Sync Architecture                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   UI Components │    │   Services      │                │
│  │                 │    │                 │                │
│  │ • Setup Wizard  │◄──►│ • Source Mgmt   │                │
│  │ • Status Indica │    │ • Sync Engine   │                │
│  │ • Diff Viewer   │    │ • Error Recovery│                │
│  │ • Team Manager  │    │ • Performance   │                │
│  └─────────────────┘    └─────────────────┘                │
│           │                       │                        │
│           ▼                       ▼                        │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Integration   │    │   Platform      │                │
│  │                 │    │                 │                │
│  │ • Collections   │◄──►│ • File Watcher  │                │
│  │ • Notifications │    │ • Storage       │                │
│  │ • Analytics     │    │ • Auth          │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Source Registration**: User configures live source (URL or file)
2. **Framework Detection**: System identifies API framework and optimizes
3. **Initial Sync**: Fetches OpenAPI spec and creates collection
4. **Change Monitoring**: Watches for spec changes via polling or file watching
5. **Diff Analysis**: Compares new spec with cached version
6. **Conflict Resolution**: Handles conflicts between user changes and code changes
7. **Collection Update**: Applies changes while preserving customizations
8. **Notification**: Informs user of changes with actionable feedback

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ or compatible runtime
- TypeScript 4.5+
- Vue 3.x (for UI components)
- Hoppscotch development environment

### Installation

```bash
# Clone the repository
git clone https://github.com/hoppscotch/hoppscotch.git
cd hoppscotch

# Install dependencies
npm install

# Build the live sync components
npm run build:live-sync
```

### Basic Usage

#### 1. Initialize Live Sync Services

```typescript
import { 
  liveSpecSourceService,
  syncEngineService,
  platformIntegrationService 
} from '@hoppscotch/common'

// Initialize platform integration
await platformIntegrationService.initialize(platformAPI)

// Setup collections integration
await liveSyncCollectionsIntegration.initialize(collectionsStore)
```

#### 2. Register a Live Source

```typescript
// URL-based source (development server)
const urlSource = await liveSpecSourceService.registerSource({
  name: "My FastAPI App",
  type: "url",
  url: "http://localhost:8000/openapi.json",
  framework: "fastapi",
  syncStrategy: "incremental"
})

// File-based source (generated spec)
const fileSource = await liveSpecSourceService.registerSource({
  name: "My Express App",
  type: "file", 
  filePath: "./docs/openapi.json",
  framework: "express",
  syncStrategy: "incremental"
})
```

#### 3. Start Monitoring

```typescript
// Start watching for changes
await syncEngineService.startWatching({
  sourceId: urlSource.id,
  type: "url",
  path: urlSource.url!,
  collectionName: "My API Collection"
})
```

#### 4. Handle Events

```typescript
// Listen for sync events
syncEngineService.on('syncCompleted', (result) => {
  if (result.success) {
    console.log(`Sync completed: ${result.changesSummary.join(', ')}`)
  } else {
    console.error(`Sync failed: ${result.errors.join(', ')}`)
  }
})

// Listen for notifications
changeNotificationService.on('notification', (notification) => {
  console.log(`${notification.title}: ${notification.message}`)
})
```

## 🔧 Framework Support

### Supported Frameworks

| Framework | Auto-Detection | Default Endpoint | Common Ports |
|-----------|----------------|------------------|--------------|
| FastAPI | ✅ | `/openapi.json` | 8000, 8080 |
| Express.js | ✅ | `/api-docs` | 3000, 8000 |
| Spring Boot | ✅ | `/v3/api-docs` | 8080, 9000 |
| ASP.NET Core | ✅ | `/swagger/v1/swagger.json` | 5000, 5001 |
| Django | ✅ | `/api/schema/` | 8000, 8080 |
| Flask | ✅ | `/swagger.json` | 5000, 8000 |

### Framework-Specific Setup

#### FastAPI

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="My API",
    description="API with live sync support",
    version="1.0.0"
)

# Enable CORS for Hoppscotch
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://hoppscotch.io"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Your routes here...
# OpenAPI spec automatically available at /openapi.json
```

#### Express.js

```javascript
const express = require('express')
const swaggerJsdoc = require('swagger-jsdoc')
const swaggerUi = require('swagger-ui-express')
const cors = require('cors')

const app = express()

// Enable CORS
app.use(cors({
  origin: ['http://localhost:3000', 'https://hoppscotch.io']
}))

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'My API',
      version: '1.0.0'
    }
  },
  apis: ['./routes/*.js']
}

const specs = swaggerJsdoc(swaggerOptions)

// Serve OpenAPI spec
app.get('/openapi.json', (req, res) => res.json(specs))
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs))
```

#### Spring Boot

```java
// Add dependency to pom.xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-ui</artifactId>
    <version>1.7.0</version>
</dependency>

// Configure CORS
@Configuration
public class CorsConfig {
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.asList(
            "http://localhost:3000", 
            "https://hoppscotch.io"
        ));
        configuration.setAllowedMethods(Arrays.asList("GET"));
        configuration.setAllowedHeaders(Arrays.asList("*"));
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}

// OpenAPI spec automatically available at /v3/api-docs
```

### Adding New Framework Support

To add support for a new framework:

1. **Update Framework Detection**:

```typescript
// In framework-detection.ts
export async function detectCustomFramework(url: string): Promise<FrameworkDetectionResult> {
  // Add detection logic for your framework
  const indicators = [
    { pattern: /my-framework/i, framework: 'myframework', confidence: 0.9 }
  ]
  
  // Return detection result
}
```

2. **Add Framework Configuration**:

```typescript
// In framework-optimization.service.ts
this.frameworkConfigs.set('myframework', {
  name: 'myframework',
  displayName: 'My Framework',
  defaultEndpoints: ['/api/openapi.json'],
  commonPorts: [4000, 4001],
  setupGuide: `
# My Framework Live Sync Setup
1. Install OpenAPI plugin
2. Configure CORS
3. Start development server
  `,
  errorMessages: {
    connection_failed: 'My Framework server not running. Start with: my-framework serve',
    cors_error: 'Configure CORS in my-framework.config.js',
  },
  optimizations: {
    debounceMs: 800,
    batchUpdates: true,
    selectiveSync: true,
  },
})
```

## 📚 API Reference

### Core Services

#### LiveSpecSourceService

Manages live source configurations and lifecycle.

```typescript
interface LiveSpecSourceService {
  // Source management
  registerSource(config: Omit<LiveSpecSource, 'id' | 'createdAt' | 'updatedAt'>): Promise<LiveSpecSource>
  unregisterSource(sourceId: string): Promise<void>
  updateSource(sourceId: string, updates: Partial<LiveSpecSource>): Promise<LiveSpecSource>
  
  // Source queries
  getSources(): LiveSpecSource[]
  getSource(sourceId: string): LiveSpecSource | null
  getSourcesByFramework(framework: FrameworkType): LiveSpecSource[]
  
  // Validation
  validateSourceConfig(config: any): Promise<ValidationResult>
}
```

#### SyncEngineService

Orchestrates synchronization operations.

```typescript
interface SyncEngineService {
  // Sync operations
  triggerSync(sourceId: string): Promise<SyncResult>
  startWatching(config: WatchConfig): Promise<SyncResult>
  stopWatching(sourceId: string): Promise<void>
  
  // Change processing
  processSpecUpdate(sourceId: string, spec: any): Promise<SyncResult>
  applyChanges(sourceId: string, changes: SpecDiff, options?: ApplyOptions): Promise<void>
  
  // Event handling
  on(event: string, listener: Function): void
  off(event: string, listener: Function): void
}
```

#### ChangeNotificationService

Manages user notifications and feedback.

```typescript
interface ChangeNotificationService {
  // Notifications
  showSyncToast(source: LiveSpecSource, changes: SpecDiff, success: boolean, error?: string): void
  showBreakingChangeNotification(source: LiveSpecSource, changes: SpecDiff): void
  addNotification(notification: Omit<ChangeNotification, 'id' | 'timestamp' | 'isRead'>): string
  
  // Management
  getNotifications(): ChangeNotification[]
  markAsRead(id: string): void
  clearNotifications(): void
  
  // Undo functionality
  storeUndoData(syncId: string, undoData: any): void
  undoSync(syncId: string): Promise<boolean>
}
```

### UI Components

#### LiveSourceSetupWizard

Multi-step wizard for configuring live sources.

```vue
<template>
  <LiveSourceSetupWizard
    :initial-config="initialConfig"
    @setup-complete="handleSetupComplete"
    @cancel="handleCancel"
  />
</template>

<script setup>
const handleSetupComplete = (source) => {
  console.log('Live source configured:', source)
}
</script>
```

#### LiveStatusIndicator

Shows real-time sync status with framework awareness.

```vue
<template>
  <LiveStatusIndicator
    :collection="collection"
    :status="syncStatus"
    size="md"
    @retry="handleRetry"
    @sync="handleManualSync"
  />
</template>
```

#### DiffViewer

Displays detailed changes between API versions.

```vue
<template>
  <DiffViewer
    :diff="specDiff"
    :source-name="sourceName"
    @apply-changes="applyChanges"
    @skip-breaking="skipBreakingChanges"
    @close="closeDiffViewer"
  />
</template>
```

### Type Definitions

#### Core Types

```typescript
interface LiveSpecSource {
  id: string
  name: string
  type: 'url' | 'file'
  status: 'connected' | 'error' | 'disconnected' | 'syncing'
  config: URLSourceConfig | FileSourceConfig
  syncStrategy: 'replace-all' | 'incremental'
  framework?: FrameworkType
  lastSync?: Date
  createdAt: Date
  updatedAt: Date
}

interface SpecDiff {
  hasChanges: boolean
  endpoints: EndpointChange[]
  summary: string
}

interface EndpointChange {
  path: string
  method: string
  type: 'added' | 'modified' | 'removed'
  isBreaking: boolean
  summary?: string
  details?: ChangeDetail[]
}
```

## 🔗 Integration Guide

### Integrating with Existing Collections

```typescript
// Extend your existing collections store
import { liveSyncCollectionsIntegration } from '@hoppscotch/common'

// Initialize integration
await liveSyncCollectionsIntegration.initialize(yourCollectionsStore)

// Create live collection from source
const liveCollection = await liveSyncCollectionsIntegration.createLiveCollection(
  source,
  openApiSpec
)

// Update collection with changes
await liveSyncCollectionsIntegration.updateLiveCollection(
  collection.id,
  specDiff
)
```

### Custom Platform Integration

```typescript
// Implement platform-specific APIs
const customPlatformAPI = {
  auth: {
    getCurrentUser: () => getCurrentUser(),
    signIn: () => signInUser(),
  },
  storage: {
    set: (key, value) => customStorage.set(key, value),
    get: (key) => customStorage.get(key),
  },
  fs: {
    watch: (path, options) => customFileWatcher.watch(path, options),
  },
  notifications: {
    show: (notification) => customNotifications.show(notification),
  }
}

// Initialize with custom platform
await platformIntegrationService.initialize(customPlatformAPI)
```

### Team Collaboration Setup

```typescript
// Share source with team
const teamSource = await teamLiveSyncService.shareSourceWithTeam(
  sourceId,
  teamId,
  {
    canEdit: true,
    canSync: true,
    canDelete: false
  }
)

// Handle team sync with conflict detection
try {
  await teamLiveSyncService.syncTeamSource(sourceId, teamId, userId)
} catch (error) {
  if (error.message.includes('Concurrent sync')) {
    // Handle concurrent sync conflict
    const conflicts = teamLiveSyncService.getActiveConflicts(teamId)
    // Show conflict resolution UI
  }
}
```

## 🧪 Testing

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest'
import { liveSpecSourceService } from '../services/live-spec-source.service'

describe('LiveSpecSourceService', () => {
  it('should register source successfully', async () => {
    const config = {
      name: 'Test API',
      type: 'url' as const,
      url: 'http://localhost:3000/openapi.json',
      framework: 'express' as const,
      syncStrategy: 'incremental' as const
    }

    const source = await liveSpecSourceService.registerSource(config)
    
    expect(source.id).toBeDefined()
    expect(source.name).toBe('Test API')
    expect(source.framework).toBe('express')
  })
})
```

### Integration Tests

```typescript
describe('Live Sync Integration', () => {
  it('should complete full sync workflow', async () => {
    // Setup mock server
    const mockServer = setupMockOpenAPIServer()
    
    // Register source
    const source = await liveSpecSourceService.registerSource({
      name: 'Integration Test API',
      type: 'url',
      url: mockServer.url + '/openapi.json',
      framework: 'fastapi',
      syncStrategy: 'incremental'
    })

    // Trigger sync
    const result = await syncEngineService.triggerSync(source.id)
    
    expect(result.success).toBe(true)
    expect(result.hasChanges).toBe(true)
    
    // Verify collection was created
    const collections = liveSyncCollectionsIntegration.getLiveCollections()
    expect(collections.length).toBeGreaterThan(0)
  })
})
```

### End-to-End Tests

```typescript
describe('Live Sync E2E', () => {
  it('should handle complete FastAPI workflow', async () => {
    // Start real FastAPI server
    const server = await startFastAPIServer()
    
    try {
      // Complete setup through UI
      await setupLiveSourceThroughUI({
        type: 'url',
        url: server.url + '/openapi.json'
      })
      
      // Modify API code
      await modifyFastAPIEndpoint(server, '/users', 'add_new_field')
      
      // Wait for sync
      await waitForSyncCompletion()
      
      // Verify collection updated
      const collection = await getCollectionByName('FastAPI Test')
      expect(collection.requests).toContainEndpointWithField('new_field')
      
    } finally {
      await server.stop()
    }
  })
})
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Connection Failures

**Problem**: Live sync can't connect to development server

**Solutions**:
- Verify server is running on correct port
- Check CORS configuration
- Ensure OpenAPI endpoint is accessible
- Try alternative endpoints (`/api-docs`, `/swagger.json`)

```typescript
// Debug connection issues
const source = liveSpecSourceService.getSource(sourceId)
const recovery = await frameworkOptimizationService.performErrorRecovery(
  source,
  'connection_failed'
)

if (recovery.recovered) {
  console.log('Recovery successful:', recovery.message)
} else {
  console.log('Manual intervention needed:', recovery.message)
}
```

#### 2. Framework Detection Issues

**Problem**: Framework not detected correctly

**Solutions**:
- Manually specify framework in source configuration
- Ensure framework-specific indicators are present
- Check framework detection logs

```typescript
// Manual framework specification
const source = await liveSpecSourceService.registerSource({
  name: 'My API',
  type: 'url',
  url: 'http://localhost:3000/openapi.json',
  framework: 'express', // Explicitly specify
  syncStrategy: 'incremental'
})
```

#### 3. Performance Issues

**Problem**: Sync operations are slow

**Solutions**:
- Enable content hashing to avoid unnecessary syncs
- Increase debounce threshold for rapid changes
- Use selective sync for large APIs

```typescript
// Optimize performance
performanceMonitorService.updateConfig({
  enableContentHashing: true,
  debounceThreshold: 2000, // 2 seconds
  maxSyncDuration: 10000   // 10 seconds
})

// Configure selective sync
frameworkOptimizationService.configureSelectiveSync(sourceId, {
  includePatterns: ['/api/v1/*'],
  excludePatterns: ['/internal/*', '/admin/*'],
  endpointFilters: {
    methods: ['get', 'post'],
    tags: ['public'],
    paths: []
  }
})
```

#### 4. Team Collaboration Conflicts

**Problem**: Team members experiencing sync conflicts

**Solutions**:
- Use structured conflict resolution
- Implement proper permission management
- Establish team sync protocols

```typescript
// Handle team conflicts
const conflicts = teamLiveSyncService.getActiveConflicts(teamId)

for (const conflict of conflicts) {
  // Present resolution options to user
  const resolution = await showConflictResolutionDialog(conflict)
  
  // Apply chosen resolution
  await teamLiveSyncService.resolveConflict(conflict.conflictId, resolution)
}
```

### Debug Mode

Enable debug logging for detailed troubleshooting:

```typescript
// Enable debug mode
localStorage.setItem('hoppscotch_live_sync_debug', 'true')

// Check debug logs
console.log('Live Sync Debug Info:', {
  sources: liveSpecSourceService.getSources(),
  metrics: performanceMonitorService.getMetrics(sourceId),
  errors: errorRecoveryService.getErrorHistory(sourceId),
  config: platformIntegrationService.getPlatformConfig()
})
```

### Performance Monitoring

Monitor live sync performance:

```typescript
// Get performance summary
const summary = performanceMonitorService.getPerformanceSummary(sourceId)
console.log('Performance Summary:', {
  averageSyncTime: summary.averageSyncTime,
  cacheHitRate: summary.cacheHitRate,
  memoryTrend: summary.memoryTrend
})

// Check for performance alerts
const alerts = performanceMonitorService.getActiveAlerts()
alerts.forEach(alert => {
  console.warn(`Performance Alert: ${alert.message}`)
  console.log(`Suggestion: ${alert.suggestion}`)
})
```

## 🤝 Contributing

### Development Setup

1. **Fork and Clone**:
```bash
git clone https://github.com/yourusername/hoppscotch.git
cd hoppscotch
```

2. **Install Dependencies**:
```bash
npm install
```

3. **Run Tests**:
```bash
npm run test:live-sync
```

4. **Start Development Server**:
```bash
npm run dev
```

### Code Style

- Use TypeScript for all new code
- Follow existing ESLint configuration
- Write comprehensive tests for new features
- Document public APIs with JSDoc comments

### Submitting Changes

1. Create feature branch: `git checkout -b feature/live-sync-enhancement`
2. Make changes with tests
3. Run full test suite: `npm test`
4. Submit pull request with detailed description

### Framework Support Contributions

To contribute support for a new framework:

1. Add framework detection logic
2. Create framework configuration
3. Write framework-specific tests
4. Update documentation
5. Provide setup examples

## 📖 Additional Resources

- [Live Sync Architecture Blog Post](../blog-posts/live-sync-implementation-progress.md)
- [Advanced Features Guide](../blog-posts/advanced-live-sync-features.md)
- [API Reference Documentation](./api-reference.md)
- [Framework Integration Examples](./examples/)
- [Troubleshooting Guide](./troubleshooting.md)

---

*For more help, join our [Discord community](https://discord.gg/hoppscotch) or [open an issue](https://github.com/hoppscotch/hoppscotch/issues) on GitHub.*