# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

This is `rnww-plugin-background`, an Expo native module that enables background execution for React Native WebView applications. It maintains Headless WebView instances to preserve connections (WebSocket, HTTP) when the app is backgrounded or terminated.

## Build Commands

```bash
npm run build      # Compile TypeScript (src/ → lib/)
npm run clean      # Remove lib/ directory
npm run prepare    # Build before publish
```

## Architecture

### Three-Layer Structure

1. **Bridge Layer** (`src/bridge/`) - WebView communication handlers
   - `registerBackgroundHandlers(config)` accepts `IBridge` and `IPlatform`

2. **Module Wrapper** (`src/modules/index.ts`) - Cross-platform TypeScript API
   - Lazy-loads native module via `requireNativeModule('CustomBackground')`

3. **Native Modules** (`src/modules/android/`, `src/modules/ios/`)
   - Android: Kotlin with ForegroundService + WorkManager
   - iOS: Swift with BGTaskScheduler + WKWebView

### Key Features

- **Two execution modes:** persistent (always-on) and efficient (system-managed)
- **Multiple tasks:** Manage concurrent background tasks with unique taskIds
- **Dynamic notifications:** Update notification content in real-time
- **Event-driven:** Interval and event-based triggers

### Bridge Handlers

- `registerTask`, `unregisterTask`
- `startTask`, `stopTask`, `stopAllTasks`
- `updateNotification`
- `getTaskStatus`, `getAllTasksStatus`
- `checkBackgroundPermission`, `requestBackgroundPermission`
- `onTaskEvent` (event callback)
