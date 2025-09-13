# Live Sync User Guide

*Your complete guide to using Hoppscotch Live Sync*

## 🚀 What is Live Sync?

Live Sync automatically keeps your API collections in sync with your development server. As you modify your API code, your Hoppscotch collections update in real-time - no more manual imports or outdated documentation!

## ✨ Key Benefits

- **Always Up-to-Date**: Collections automatically reflect your latest API changes
- **Zero Manual Work**: No more importing OpenAPI specs manually
- **Team Collaboration**: Share live sources with your team
- **Framework Smart**: Optimized for FastAPI, Express, Spring Boot, and more
- **Conflict Resolution**: Handles conflicts between code changes and user customizations

## 🎯 Quick Start

### Step 1: Set Up Your API

Make sure your development server serves an OpenAPI specification:

**FastAPI** (automatic):
```python
from fastapi import FastAPI
app = FastAPI(title="My API")
# OpenAPI available at http://localhost:8000/openapi.json
```

**Express.js**:
```javascript
const swaggerUi = require('swagger-ui-express')
const swaggerDocument = require('./swagger.json')
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
```

### Step 2: Connect to Live Sync

1. **Open Hoppscotch** and go to Collections
2. **Click Import** → **⚡ Connect to Development Server**
3. **Enter your server URL**: `http://localhost:8000/openapi.json`
4. **Test Connection** - should show ✅ if successful
5. **Click Continue** and follow the setup wizard

### Step 3: Start Coding!

That's it! Now when you modify your API code, your Hoppscotch collection will update automatically.

## 🔧 Setup Guide by Framework

### FastAPI

**1. Enable CORS** (required for browser access):
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://hoppscotch.io"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
```

**2. Connect to Live Sync**:
- URL: `http://localhost:8000/openapi.json`
- Framework: FastAPI (auto-detected)

### Express.js

**1. Install Swagger tools**:
```bash
npm install swagger-jsdoc swagger-ui-express
```

**2. Configure Swagger**:
```javascript
const swaggerJsdoc = require('swagger-jsdoc')

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'My API', version: '1.0.0' }
  },
  apis: ['./routes/*.js']
}

const specs = swaggerJsdoc(options)
app.get('/openapi.json', (req, res) => res.json(specs))
```

**3. Connect to Live Sync**:
- URL: `http://localhost:3000/openapi.json`
- Framework: Express.js (auto-detected)

### Spring Boot

**1. Add dependency**:
```xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-ui</artifactId>
    <version>1.7.0</version>
</dependency>
```

**2. Configure CORS**:
```java
@CrossOrigin(origins = "http://localhost:3000")
@RestController
public class ApiController {
    // Your endpoints
}
```

**3. Connect to Live Sync**:
- URL: `http://localhost:8080/v3/api-docs`
- Framework: Spring Boot (auto-detected)

## 📱 Using the Interface

### Live Status Indicator

The status indicator shows your sync status:

- 🟢 **Connected**: Everything is synced
- 🔵 **Syncing**: Changes being processed
- 🟡 **Modified**: You have local customizations
- 🟠 **Conflicts**: Needs your attention
- 🔴 **Error**: Connection issues

### Change Notifications

When your API changes, you'll see notifications:

```
✅ Sync Complete
2 endpoints updated from FastAPI code
[View Changes] [Dismiss]
```

Click **View Changes** to see exactly what changed.

### Breaking Change Warnings

For breaking changes, you'll get a special warning:

```
⚠️ Breaking Changes Detected
1 breaking change in My API
This may break existing requests.
[Review Changes] [Skip Update]
```

## 👥 Team Collaboration

### Sharing Live Sources

1. **Open Team Live Sources** in the sidebar
2. **Click Share Source**
3. **Select the source** you want to share
4. **Set permissions**:
   - ☑️ Can sync source
   - ☑️ Can edit settings
   - ☐ Can delete source
5. **Click Share**

### Handling Conflicts

When team members modify the same collection:

```
⚡ Sync Conflict
Team modifications vs code changes

👥 Team Changes    ⚡    💻 Code Changes
• Custom auth      │    • New response
• Added headers    │    • Breaking API

Resolution Options:
🛡️ Keep Team Changes
📥 Apply Code Changes  
🔀 Merge Both (Smart)
```

Choose the best option for your situation.

## ⚙️ Advanced Settings

### Performance Optimization

Access via **Settings** → **Live Sync** → **Advanced**:

- **Content Hashing**: Avoids unnecessary syncs (recommended: ✅)
- **Memory Monitoring**: Tracks resource usage (recommended: ✅)
- **Performance Alerts**: Warns about slow syncs (recommended: ✅)

### Selective Sync

For large APIs, sync only what you need:

**Include Patterns**:
```
/api/v1/*
/users/*
```

**Exclude Patterns**:
```
/admin/*
/internal/*
```

**Method Filters**:
- ☑️ GET
- ☑️ POST
- ☐ DELETE (exclude admin operations)

### Webhook Integration

For CI/CD integration:

1. **Enable Webhook** in Advanced Settings
2. **Copy the webhook URL**
3. **Add to your CI/CD pipeline**:

```yaml
# GitHub Actions example
- name: Trigger Hoppscotch Sync
  run: |
    curl -X POST ${{ secrets.HOPPSCOTCH_WEBHOOK_URL }} \
      -H "Content-Type: application/json" \
      -d '{"event": "push", "repository": "${{ github.repository }}"}'
```

## 🔍 Troubleshooting

### Connection Issues

**Problem**: "Connection failed" error

**Solutions**:
1. **Check server is running**: Visit your API URL in browser
2. **Verify CORS**: Add Hoppscotch origin to allowed origins
3. **Try different endpoints**:
   - `/openapi.json`
   - `/api-docs`
   - `/swagger.json`
   - `/v3/api-docs`

### Framework Not Detected

**Problem**: Framework shows as "Unknown"

**Solutions**:
1. **Manually select framework** in setup wizard
2. **Check framework-specific setup** (see guides above)
3. **Verify OpenAPI spec format** is valid

### Slow Sync Performance

**Problem**: Syncs take too long

**Solutions**:
1. **Enable content hashing** in Advanced Settings
2. **Increase debounce delay** to 2000ms
3. **Use selective sync** for large APIs
4. **Check Performance Monitor** for bottlenecks

### Team Sync Conflicts

**Problem**: Frequent team conflicts

**Solutions**:
1. **Establish team protocols** for who syncs when
2. **Use "Keep Team Changes"** for user customizations
3. **Use "Apply Code Changes"** for API updates
4. **Use "Merge Both"** when both are important

## 💡 Best Practices

### Development Workflow

1. **Start development server** with OpenAPI enabled
2. **Connect Live Sync** once per project
3. **Code normally** - collections update automatically
4. **Review changes** when breaking changes detected
5. **Share with team** when ready for collaboration

### Team Collaboration

1. **One person sets up** the live source initially
2. **Share with team** with appropriate permissions
3. **Communicate** before making breaking changes
4. **Use conflict resolution** to handle overlaps
5. **Regular cleanup** of old sources and conflicts

### Performance Optimization

1. **Enable content hashing** to avoid unnecessary syncs
2. **Use selective sync** for large APIs (>100 endpoints)
3. **Monitor performance** regularly via Performance Monitor
4. **Clean up** old sources and cached data periodically

## 🆘 Getting Help

### Built-in Help

- **Setup Wizard**: Guides you through configuration
- **Error Messages**: Framework-specific guidance
- **Performance Alerts**: Suggestions for optimization
- **Conflict Resolution**: Step-by-step resolution options

### Community Support

- **Discord**: [Join our community](https://discord.gg/hoppscotch)
- **GitHub**: [Report issues](https://github.com/hoppscotch/hoppscotch/issues)
- **Documentation**: [Developer guides](./live-sync-developer-guide.md)

### Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| "CORS error" | Browser blocked request | Configure CORS in your API |
| "Connection refused" | Server not running | Start your development server |
| "404 Not Found" | Wrong endpoint | Try `/api-docs` or `/swagger.json` |
| "Invalid OpenAPI spec" | Malformed specification | Check your OpenAPI generation |
| "Concurrent sync detected" | Team conflict | Wait or resolve conflict |

---

**Ready to get started?** Open Hoppscotch, click Import → Connect to Development Server, and experience the future of API development! 🚀