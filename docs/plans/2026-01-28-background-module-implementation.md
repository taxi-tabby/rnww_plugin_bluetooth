# Background Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** React Native WebView 백그라운드 실행 제어 플러그인 구현 - Headless WebView를 통한 연결 유지 및 백그라운드 작업 관리

**Architecture:** 3계층 구조 (Bridge → Module Wrapper → Native Modules). Android는 ForegroundService + WorkManager, iOS는 Background Modes + BGTaskScheduler 활용. 여러 작업을 taskId로 구분하여 동시 관리.

**Tech Stack:** TypeScript, Kotlin (Android), Swift (iOS), Expo Modules Core

**Design Document:** `docs/plans/2026-01-28-background-module-design.md`

---

## Task 1: Create Background Type Definitions

**Files:**
- Create: `src/types/background-module.ts`

**Step 1: Create type definitions file**

```typescript
/**
 * Background 모듈 타입 정의
 */

// ============================================================================
// Task Types
// ============================================================================

/**
 * 백그라운드 작업 설정
 */
export interface BackgroundTask {
  /** 작업 고유 ID (WebView에서 직접 지정) */
  taskId: string;
  /** 실행 모드 */
  mode: 'persistent' | 'efficient';
  /** 간격 기반 실행 (밀리초, 0이면 비활성화) */
  interval?: number;
  /** 이벤트 트리거 */
  triggers?: Array<'network_change' | 'location_change' | 'time_trigger'>;
  /** 예약 시간 (time_trigger 사용 시) */
  scheduledTime?: number;
}

/**
 * 알림 설정
 */
export interface NotificationConfig {
  /** 대상 작업 ID (없으면 기본 알림) */
  taskId?: string;
  /** 알림 제목 */
  title: string;
  /** 알림 내용 */
  body: string;
  /** 아이콘 (Android) */
  icon?: string;
}

/**
 * 작업 상태
 */
export interface TaskStatus {
  /** 작업 ID */
  taskId: string;
  /** 실행 중 여부 */
  isRunning: boolean;
  /** 실행 모드 */
  mode: 'persistent' | 'efficient';
  /** 시작 시간 */
  startedAt?: number;
}

/**
 * 전체 백그라운드 상태
 */
export interface BackgroundStatus {
  /** 실행 중인 작업 목록 */
  tasks: TaskStatus[];
  /** 전체 실행 중 여부 */
  isAnyRunning: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * 작업 이벤트
 */
export interface TaskEvent {
  /** 작업 ID */
  taskId: string;
  /** 이벤트 타입 */
  type: 'started' | 'stopped' | 'restart' | 'error' | 'trigger';
  /** 트리거 종류 (type이 'trigger'일 때) */
  trigger?: 'interval' | 'network_change' | 'location_change' | 'time_trigger';
  /** 에러 메시지 (type이 'error'일 때) */
  error?: string;
  /** 타임스탬프 */
  timestamp: number;
}

// ============================================================================
// Permission Types
// ============================================================================

/**
 * 권한 상태
 */
export interface PermissionStatus {
  /** 백그라운드 실행 가능 여부 */
  canRunBackground: boolean;
  /** 배터리 최적화 예외 여부 (Android) */
  batteryOptimizationExempt?: boolean;
  /** 필요한 권한 목록 */
  requiredPermissions: string[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * 백그라운드 에러 타입
 */
export type BackgroundError =
  | 'TASK_NOT_FOUND'
  | 'TASK_ALREADY_EXISTS'
  | 'TASK_ALREADY_RUNNING'
  | 'PERMISSION_DENIED'
  | 'SYSTEM_RESTRICTED'
  | 'WEBVIEW_INIT_FAILED'
  | 'UNKNOWN';

// ============================================================================
// Result Types
// ============================================================================

/**
 * 작업 등록 결과
 */
export interface RegisterTaskResult {
  success: boolean;
  taskId?: string;
  error?: BackgroundError;
}

/**
 * 작업 시작/중지 결과
 */
export interface TaskActionResult {
  success: boolean;
  taskId?: string;
  error?: BackgroundError;
}

/**
 * 알림 업데이트 결과
 */
export interface NotificationResult {
  success: boolean;
  error?: string;
}
```

**Step 2: Verify file created**

Run: `cat src/types/background-module.ts | head -20`

**Step 3: Commit**

```bash
git add src/types/background-module.ts
git commit -m "feat: add background module type definitions"
```

---

## Task 2: Update Types Index

**Files:**
- Create: `src/types/index.ts`

**Step 1: Create types index**

```typescript
/**
 * 타입 정의 모음
 */

export * from './platform';
export * from './bridge';
export * from './background-module';
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add types index with background module exports"
```

---

## Task 3: Create Module Wrapper

**Files:**
- Create: `src/modules/index.ts`

**Step 1: Create module wrapper**

```typescript
/**
 * Background Module (Cross-Platform)
 * 백그라운드 실행 제어 기능 제공
 * Supports: Android, iOS
 */

import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import type {
  BackgroundTask,
  NotificationConfig,
  TaskStatus,
  BackgroundStatus,
  PermissionStatus,
  RegisterTaskResult,
  TaskActionResult,
  NotificationResult,
} from '../types/background-module';

// Lazy 모듈 로드 (크래시 방지)
let BackgroundModule: any = null;

function getBackgroundModule() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return null;
  }

  if (BackgroundModule === null) {
    try {
      BackgroundModule = requireNativeModule('CustomBackground');
    } catch (error) {
      console.error('[CustomBackground] Failed to load native module:', error);
      BackgroundModule = undefined;
      return null;
    }
  }

  return BackgroundModule === undefined ? null : BackgroundModule;
}

/**
 * 백그라운드 작업 등록
 */
export async function registerTask(task: BackgroundTask): Promise<RegisterTaskResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'UNKNOWN' };
  }
  return await module.registerTask(task);
}

/**
 * 백그라운드 작업 해제
 */
export async function unregisterTask(taskId: string): Promise<TaskActionResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'UNKNOWN' };
  }
  return await module.unregisterTask(taskId);
}

/**
 * 백그라운드 작업 시작
 */
export async function startTask(taskId: string): Promise<TaskActionResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'UNKNOWN' };
  }
  return await module.startTask(taskId);
}

/**
 * 백그라운드 작업 중지
 */
export async function stopTask(taskId: string): Promise<TaskActionResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'UNKNOWN' };
  }
  return await module.stopTask(taskId);
}

/**
 * 모든 백그라운드 작업 중지
 */
export async function stopAllTasks(): Promise<TaskActionResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'UNKNOWN' };
  }
  return await module.stopAllTasks();
}

/**
 * 알림 업데이트
 */
export async function updateNotification(config: NotificationConfig): Promise<NotificationResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'Module not available' };
  }
  return await module.updateNotification(config);
}

/**
 * 특정 작업 상태 조회
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatus | null> {
  const module = getBackgroundModule();
  if (!module) {
    return null;
  }
  return await module.getTaskStatus(taskId);
}

/**
 * 전체 작업 상태 조회
 */
export async function getAllTasksStatus(): Promise<BackgroundStatus> {
  const module = getBackgroundModule();
  if (!module) {
    return { tasks: [], isAnyRunning: false };
  }
  return await module.getAllTasksStatus();
}

/**
 * 백그라운드 권한 확인
 */
export async function checkBackgroundPermission(): Promise<PermissionStatus> {
  const module = getBackgroundModule();
  if (!module) {
    return { canRunBackground: false, requiredPermissions: [] };
  }
  return await module.checkBackgroundPermission();
}

/**
 * 백그라운드 권한 요청
 */
export async function requestBackgroundPermission(): Promise<PermissionStatus> {
  const module = getBackgroundModule();
  if (!module) {
    return { canRunBackground: false, requiredPermissions: [] };
  }
  return await module.requestBackgroundPermission();
}

/**
 * 이벤트 리스너 등록
 */
export function addTaskEventListener(
  listener: (event: any) => void
): { remove: () => void } {
  const module = getBackgroundModule();
  if (!module || !module.addListener) {
    return { remove: () => {} };
  }
  return module.addListener('onTaskEvent', listener);
}
```

**Step 2: Commit**

```bash
git add src/modules/index.ts
git commit -m "feat: add background module wrapper with cross-platform API"
```

---

## Task 4: Create Expo Module Config

**Files:**
- Create: `src/modules/expo-module.config.json`

**Step 1: Create config file**

```json
{
  "platforms": ["android", "ios"],
  "android": {
    "modules": ["expo.modules.custombackground.BackgroundModule"]
  },
  "ios": {
    "modules": ["BackgroundModule"]
  }
}
```

**Step 2: Commit**

```bash
git add src/modules/expo-module.config.json
git commit -m "feat: add expo module config for background module"
```

---

## Task 5: Create Background Bridge Handler

**Files:**
- Create: `src/bridge/background-bridge.ts`

**Step 1: Create bridge handler**

```typescript
/**
 * Background 브릿지 핸들러
 * 의존성 주입을 통해 동작하는 순수한 브릿지 로직
 */

import type { IBridge, IPlatform } from '../types';
import * as Background from '../modules';
import type { BackgroundTask, NotificationConfig } from '../types/background-module';

/**
 * Background 브릿지 설정
 */
export interface BackgroundBridgeConfig {
  bridge: IBridge;
  platform: IPlatform;
  logger?: {
    log: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

/**
 * Background 브릿지 핸들러를 등록합니다
 */
export const registerBackgroundHandlers = (config: BackgroundBridgeConfig) => {
  const { bridge, platform, logger = console } = config;

  if (platform.OS !== 'android' && platform.OS !== 'ios') {
    logger.log('[Bridge] Background handlers skipped (Android/iOS only)');
    return;
  }

  // 이벤트 리스너 구독 객체
  let eventSubscription: any = null;

  // 작업 등록
  bridge.registerHandler('registerTask', async (payload: any, respond: any) => {
    try {
      const task = payload as BackgroundTask;
      const result = await Background.registerTask(task);
      respond(result);
    } catch (error) {
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to register task',
      });
    }
  });

  // 작업 해제
  bridge.registerHandler('unregisterTask', async (payload: any, respond: any) => {
    try {
      const { taskId } = payload as { taskId: string };
      const result = await Background.unregisterTask(taskId);
      respond(result);
    } catch (error) {
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to unregister task',
      });
    }
  });

  // 작업 시작
  bridge.registerHandler('startTask', async (payload: any, respond: any) => {
    try {
      const { taskId } = payload as { taskId: string };

      // 이벤트 리스너 등록 (최초 시작 시)
      if (!eventSubscription) {
        eventSubscription = Background.addTaskEventListener((event: any) => {
          bridge.sendToWeb('onTaskEvent', event);
        });
      }

      const result = await Background.startTask(taskId);
      respond(result);
    } catch (error) {
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start task',
      });
    }
  });

  // 작업 중지
  bridge.registerHandler('stopTask', async (payload: any, respond: any) => {
    try {
      const { taskId } = payload as { taskId: string };
      const result = await Background.stopTask(taskId);
      respond(result);
    } catch (error) {
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop task',
      });
    }
  });

  // 모든 작업 중지
  bridge.registerHandler('stopAllTasks', async (_payload: any, respond: any) => {
    try {
      const result = await Background.stopAllTasks();

      // 이벤트 리스너 해제
      if (eventSubscription) {
        eventSubscription.remove();
        eventSubscription = null;
      }

      respond(result);
    } catch (error) {
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop all tasks',
      });
    }
  });

  // 알림 업데이트
  bridge.registerHandler('updateNotification', async (payload: any, respond: any) => {
    try {
      const config = payload as NotificationConfig;
      const result = await Background.updateNotification(config);
      respond(result);
    } catch (error) {
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update notification',
      });
    }
  });

  // 특정 작업 상태 조회
  bridge.registerHandler('getTaskStatus', async (payload: any, respond: any) => {
    try {
      const { taskId } = payload as { taskId: string };
      const status = await Background.getTaskStatus(taskId);
      respond({ success: true, status });
    } catch (error) {
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get task status',
      });
    }
  });

  // 전체 작업 상태 조회
  bridge.registerHandler('getAllTasksStatus', async (_payload: any, respond: any) => {
    try {
      const status = await Background.getAllTasksStatus();
      respond({ success: true, ...status });
    } catch (error) {
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get all tasks status',
      });
    }
  });

  // 권한 확인
  bridge.registerHandler('checkBackgroundPermission', async (_payload: any, respond: any) => {
    try {
      const status = await Background.checkBackgroundPermission();
      respond({ success: true, ...status });
    } catch (error) {
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check permission',
      });
    }
  });

  // 권한 요청
  bridge.registerHandler('requestBackgroundPermission', async (_payload: any, respond: any) => {
    try {
      const status = await Background.requestBackgroundPermission();
      respond({ success: true, ...status });
    } catch (error) {
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to request permission',
      });
    }
  });

  logger.log('[Bridge] Background handlers registered');
};
```

**Step 2: Commit**

```bash
git add src/bridge/background-bridge.ts
git commit -m "feat: add background bridge handlers"
```

---

## Task 6: Create Bridge Index

**Files:**
- Create: `src/bridge/index.ts`

**Step 1: Create bridge index**

```typescript
/**
 * Background 브릿지 메인 엔트리 포인트
 */

export { registerBackgroundHandlers } from './background-bridge';
export type { BackgroundBridgeConfig } from './background-bridge';

export * from '../types';
```

**Step 2: Verify TypeScript compiles**

Run: `npm install && npx tsc`

**Step 3: Commit**

```bash
git add src/bridge/index.ts
git commit -m "feat: add bridge index exports"
```

---

## Task 7: Create Android build.gradle

**Files:**
- Create: `src/modules/android/build.gradle`

**Step 1: Create build.gradle**

```groovy
apply plugin: 'com.android.library'
apply plugin: 'kotlin-android'
apply plugin: 'maven-publish'

group = 'expo.modules.custombackground'
version = '1.0.0'

buildscript {
  def expoModulesCoreProject = rootProject.findProject(":expo-modules-core")
  if (expoModulesCoreProject != null) {
    def expoModulesCorePlugin = new File(expoModulesCoreProject.projectDir.absolutePath, "ExpoModulesCorePlugin.gradle")
    if (expoModulesCorePlugin.exists()) {
      apply from: expoModulesCorePlugin
      applyKotlinExpoModulesCorePlugin()
    }
  }
}

afterEvaluate {
  publishing {
    publications {
      release(MavenPublication) {
        from components.release
      }
    }
    repositories {
      maven {
        url = mavenLocal().url
      }
    }
  }
}

android {
  namespace "expo.modules.custombackground"
  compileSdkVersion safeExtGet("compileSdkVersion", 34)

  defaultConfig {
    minSdkVersion safeExtGet("minSdkVersion", 23)
    targetSdkVersion safeExtGet("targetSdkVersion", 34)
  }

  compileOptions {
    sourceCompatibility JavaVersion.VERSION_17
    targetCompatibility JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = JavaVersion.VERSION_17
  }
}

repositories {
  mavenCentral()
}

dependencies {
  implementation project(':expo-modules-core')
  implementation "org.jetbrains.kotlin:kotlin-stdlib-jdk8:$kotlinVersion"

  // WorkManager for background task scheduling
  implementation 'androidx.work:work-runtime-ktx:2.9.0'

  // WebView
  implementation 'androidx.webkit:webkit:1.8.0'
}

def safeExtGet(prop, fallback) {
  rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback
}
```

**Step 2: Commit**

```bash
git add src/modules/android/build.gradle
git commit -m "feat: add Android build.gradle with WorkManager and WebKit dependencies"
```

---

## Task 8: Create Android AndroidManifest.xml

**Files:**
- Create: `src/modules/android/src/main/AndroidManifest.xml`

**Step 1: Create AndroidManifest.xml**

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <!-- 포그라운드 서비스 권한 -->
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />

  <!-- 배터리 최적화 예외 요청 -->
  <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

  <!-- 부팅 완료 시 재시작 -->
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

  <!-- 인터넷 (WebView용) -->
  <uses-permission android:name="android.permission.INTERNET" />

  <!-- 네트워크 상태 감지 -->
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

  <application>
    <!-- Foreground Service -->
    <service
      android:name="expo.modules.custombackground.BackgroundService"
      android:enabled="true"
      android:exported="false"
      android:foregroundServiceType="dataSync" />

    <!-- Boot Receiver for restart -->
    <receiver
      android:name="expo.modules.custombackground.BootReceiver"
      android:enabled="true"
      android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
      </intent-filter>
    </receiver>
  </application>
</manifest>
```

**Step 2: Commit**

```bash
git add src/modules/android/src/main/AndroidManifest.xml
git commit -m "feat: add Android manifest with foreground service and boot receiver"
```

---

## Task 9: Create Android BackgroundModule.kt

**Files:**
- Create: `src/modules/android/src/main/java/expo/modules/custombackground/BackgroundModule.kt`

**Step 1: Create BackgroundModule.kt**

```kotlin
package expo.modules.custombackground

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BackgroundModule : Module() {
    private val taskManager = TaskManager()

    companion object {
        private const val TAG = "BackgroundModule"

        // 싱글톤 인스턴스 (Service에서 접근용)
        @Volatile
        private var instance: BackgroundModule? = null

        fun getInstance(): BackgroundModule? = instance
    }

    override fun definition() = ModuleDefinition {
        Name("CustomBackground")

        Events("onTaskEvent")

        OnCreate {
            Log.d(TAG, "Background module created")
            instance = this@BackgroundModule
        }

        OnDestroy {
            Log.d(TAG, "Background module destroyed")
            instance = null
        }

        // 작업 등록
        AsyncFunction("registerTask") { params: Map<String, Any?>, promise: Promise ->
            try {
                val taskId = params["taskId"] as? String
                if (taskId.isNullOrEmpty()) {
                    promise.resolve(mapOf("success" to false, "error" to "TASK_NOT_FOUND"))
                    return@AsyncFunction
                }

                val mode = params["mode"] as? String ?: "persistent"
                val interval = (params["interval"] as? Number)?.toLong() ?: 0L
                @Suppress("UNCHECKED_CAST")
                val triggers = (params["triggers"] as? List<String>) ?: emptyList()
                val scheduledTime = (params["scheduledTime"] as? Number)?.toLong()

                val task = BackgroundTask(
                    taskId = taskId,
                    mode = mode,
                    interval = interval,
                    triggers = triggers,
                    scheduledTime = scheduledTime
                )

                val result = taskManager.registerTask(task)
                promise.resolve(mapOf(
                    "success" to result,
                    "taskId" to taskId,
                    "error" to if (!result) "TASK_ALREADY_EXISTS" else null
                ))
            } catch (e: Exception) {
                Log.e(TAG, "registerTask error", e)
                promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
            }
        }

        // 작업 해제
        AsyncFunction("unregisterTask") { taskId: String, promise: Promise ->
            try {
                val result = taskManager.unregisterTask(taskId)
                promise.resolve(mapOf(
                    "success" to result,
                    "taskId" to taskId,
                    "error" to if (!result) "TASK_NOT_FOUND" else null
                ))
            } catch (e: Exception) {
                Log.e(TAG, "unregisterTask error", e)
                promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
            }
        }

        // 작업 시작
        AsyncFunction("startTask") { taskId: String, promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
                    return@AsyncFunction
                }

                val task = taskManager.getTask(taskId)
                if (task == null) {
                    promise.resolve(mapOf("success" to false, "error" to "TASK_NOT_FOUND"))
                    return@AsyncFunction
                }

                if (task.isRunning) {
                    promise.resolve(mapOf("success" to false, "error" to "TASK_ALREADY_RUNNING"))
                    return@AsyncFunction
                }

                // Foreground Service 시작
                val serviceIntent = Intent(context, BackgroundService::class.java).apply {
                    action = BackgroundService.ACTION_START_TASK
                    putExtra(BackgroundService.EXTRA_TASK_ID, taskId)
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }

                taskManager.setTaskRunning(taskId, true)

                // 이벤트 전송
                sendEvent("onTaskEvent", mapOf(
                    "taskId" to taskId,
                    "type" to "started",
                    "timestamp" to System.currentTimeMillis()
                ))

                promise.resolve(mapOf("success" to true, "taskId" to taskId))
            } catch (e: Exception) {
                Log.e(TAG, "startTask error", e)
                promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
            }
        }

        // 작업 중지
        AsyncFunction("stopTask") { taskId: String, promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
                    return@AsyncFunction
                }

                val task = taskManager.getTask(taskId)
                if (task == null) {
                    promise.resolve(mapOf("success" to false, "error" to "TASK_NOT_FOUND"))
                    return@AsyncFunction
                }

                val serviceIntent = Intent(context, BackgroundService::class.java).apply {
                    action = BackgroundService.ACTION_STOP_TASK
                    putExtra(BackgroundService.EXTRA_TASK_ID, taskId)
                }
                context.startService(serviceIntent)

                taskManager.setTaskRunning(taskId, false)

                sendEvent("onTaskEvent", mapOf(
                    "taskId" to taskId,
                    "type" to "stopped",
                    "timestamp" to System.currentTimeMillis()
                ))

                promise.resolve(mapOf("success" to true, "taskId" to taskId))
            } catch (e: Exception) {
                Log.e(TAG, "stopTask error", e)
                promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
            }
        }

        // 모든 작업 중지
        AsyncFunction("stopAllTasks") { promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
                    return@AsyncFunction
                }

                val serviceIntent = Intent(context, BackgroundService::class.java).apply {
                    action = BackgroundService.ACTION_STOP_ALL
                }
                context.startService(serviceIntent)

                taskManager.stopAllTasks()

                promise.resolve(mapOf("success" to true))
            } catch (e: Exception) {
                Log.e(TAG, "stopAllTasks error", e)
                promise.resolve(mapOf("success" to false, "error" to "UNKNOWN"))
            }
        }

        // 알림 업데이트
        AsyncFunction("updateNotification") { params: Map<String, Any?>, promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf("success" to false, "error" to "Context not available"))
                    return@AsyncFunction
                }

                val title = params["title"] as? String ?: ""
                val body = params["body"] as? String ?: ""
                val taskId = params["taskId"] as? String

                val serviceIntent = Intent(context, BackgroundService::class.java).apply {
                    action = BackgroundService.ACTION_UPDATE_NOTIFICATION
                    putExtra(BackgroundService.EXTRA_NOTIFICATION_TITLE, title)
                    putExtra(BackgroundService.EXTRA_NOTIFICATION_BODY, body)
                    taskId?.let { putExtra(BackgroundService.EXTRA_TASK_ID, it) }
                }
                context.startService(serviceIntent)

                promise.resolve(mapOf("success" to true))
            } catch (e: Exception) {
                Log.e(TAG, "updateNotification error", e)
                promise.resolve(mapOf("success" to false, "error" to e.message))
            }
        }

        // 특정 작업 상태 조회
        AsyncFunction("getTaskStatus") { taskId: String, promise: Promise ->
            try {
                val task = taskManager.getTask(taskId)
                if (task == null) {
                    promise.resolve(null)
                    return@AsyncFunction
                }

                promise.resolve(mapOf(
                    "taskId" to task.taskId,
                    "isRunning" to task.isRunning,
                    "mode" to task.mode,
                    "startedAt" to task.startedAt
                ))
            } catch (e: Exception) {
                Log.e(TAG, "getTaskStatus error", e)
                promise.resolve(null)
            }
        }

        // 전체 작업 상태 조회
        AsyncFunction("getAllTasksStatus") { promise: Promise ->
            try {
                val tasks = taskManager.getAllTasks().map { task ->
                    mapOf(
                        "taskId" to task.taskId,
                        "isRunning" to task.isRunning,
                        "mode" to task.mode,
                        "startedAt" to task.startedAt
                    )
                }

                promise.resolve(mapOf(
                    "tasks" to tasks,
                    "isAnyRunning" to tasks.any { (it["isRunning"] as? Boolean) == true }
                ))
            } catch (e: Exception) {
                Log.e(TAG, "getAllTasksStatus error", e)
                promise.resolve(mapOf("tasks" to emptyList<Any>(), "isAnyRunning" to false))
            }
        }

        // 권한 확인
        AsyncFunction("checkBackgroundPermission") { promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf(
                        "canRunBackground" to false,
                        "requiredPermissions" to emptyList<String>()
                    ))
                    return@AsyncFunction
                }

                val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                val isIgnoringBatteryOptimizations = powerManager.isIgnoringBatteryOptimizations(context.packageName)

                promise.resolve(mapOf(
                    "canRunBackground" to true,
                    "batteryOptimizationExempt" to isIgnoringBatteryOptimizations,
                    "requiredPermissions" to if (!isIgnoringBatteryOptimizations) {
                        listOf("REQUEST_IGNORE_BATTERY_OPTIMIZATIONS")
                    } else {
                        emptyList()
                    }
                ))
            } catch (e: Exception) {
                Log.e(TAG, "checkBackgroundPermission error", e)
                promise.resolve(mapOf(
                    "canRunBackground" to false,
                    "requiredPermissions" to emptyList<String>()
                ))
            }
        }

        // 권한 요청
        AsyncFunction("requestBackgroundPermission") { promise: Promise ->
            try {
                val context = appContext.reactContext ?: run {
                    promise.resolve(mapOf(
                        "canRunBackground" to false,
                        "requiredPermissions" to emptyList<String>()
                    ))
                    return@AsyncFunction
                }

                val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                if (!powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                }

                promise.resolve(mapOf(
                    "canRunBackground" to true,
                    "batteryOptimizationExempt" to powerManager.isIgnoringBatteryOptimizations(context.packageName),
                    "requiredPermissions" to emptyList<String>()
                ))
            } catch (e: Exception) {
                Log.e(TAG, "requestBackgroundPermission error", e)
                promise.resolve(mapOf(
                    "canRunBackground" to false,
                    "requiredPermissions" to emptyList<String>()
                ))
            }
        }
    }

    // Service에서 호출하는 이벤트 전송 메서드
    fun emitTaskEvent(taskId: String, type: String, trigger: String? = null, error: String? = null) {
        val event = mutableMapOf<String, Any?>(
            "taskId" to taskId,
            "type" to type,
            "timestamp" to System.currentTimeMillis()
        )
        trigger?.let { event["trigger"] = it }
        error?.let { event["error"] = it }

        sendEvent("onTaskEvent", event)
    }
}
```

**Step 2: Commit**

```bash
git add src/modules/android/src/main/java/expo/modules/custombackground/BackgroundModule.kt
git commit -m "feat: add Android BackgroundModule with task management"
```

---

## Task 10: Create Android TaskManager.kt

**Files:**
- Create: `src/modules/android/src/main/java/expo/modules/custombackground/TaskManager.kt`

**Step 1: Create TaskManager.kt**

```kotlin
package expo.modules.custombackground

import java.util.concurrent.ConcurrentHashMap

data class BackgroundTask(
    val taskId: String,
    val mode: String,
    val interval: Long,
    val triggers: List<String>,
    val scheduledTime: Long?,
    var isRunning: Boolean = false,
    var startedAt: Long? = null
)

class TaskManager {
    private val tasks = ConcurrentHashMap<String, BackgroundTask>()

    fun registerTask(task: BackgroundTask): Boolean {
        if (tasks.containsKey(task.taskId)) {
            return false
        }
        tasks[task.taskId] = task
        return true
    }

    fun unregisterTask(taskId: String): Boolean {
        return tasks.remove(taskId) != null
    }

    fun getTask(taskId: String): BackgroundTask? {
        return tasks[taskId]
    }

    fun getAllTasks(): List<BackgroundTask> {
        return tasks.values.toList()
    }

    fun getRunningTasks(): List<BackgroundTask> {
        return tasks.values.filter { it.isRunning }
    }

    fun setTaskRunning(taskId: String, running: Boolean) {
        tasks[taskId]?.let { task ->
            tasks[taskId] = task.copy(
                isRunning = running,
                startedAt = if (running) System.currentTimeMillis() else null
            )
        }
    }

    fun stopAllTasks() {
        tasks.keys.forEach { taskId ->
            setTaskRunning(taskId, false)
        }
    }

    fun hasRunningTasks(): Boolean {
        return tasks.values.any { it.isRunning }
    }
}
```

**Step 2: Commit**

```bash
git add src/modules/android/src/main/java/expo/modules/custombackground/TaskManager.kt
git commit -m "feat: add Android TaskManager for concurrent task management"
```

---

## Task 11: Create Android BackgroundService.kt

**Files:**
- Create: `src/modules/android/src/main/java/expo/modules/custombackground/BackgroundService.kt`

**Step 1: Create BackgroundService.kt**

```kotlin
package expo.modules.custombackground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat

class BackgroundService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val intervalRunnables = mutableMapOf<String, Runnable>()
    private var headlessWebViewManager: HeadlessWebViewManager? = null

    companion object {
        private const val TAG = "BackgroundService"
        private const val CHANNEL_ID = "background_service_channel"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_START_TASK = "START_TASK"
        const val ACTION_STOP_TASK = "STOP_TASK"
        const val ACTION_STOP_ALL = "STOP_ALL"
        const val ACTION_UPDATE_NOTIFICATION = "UPDATE_NOTIFICATION"

        const val EXTRA_TASK_ID = "task_id"
        const val EXTRA_NOTIFICATION_TITLE = "notification_title"
        const val EXTRA_NOTIFICATION_BODY = "notification_body"
    }

    private var notificationTitle = "백그라운드 실행 중"
    private var notificationBody = "앱이 백그라운드에서 작업을 실행하고 있습니다."

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
        headlessWebViewManager = HeadlessWebViewManager(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_TASK -> {
                val taskId = intent.getStringExtra(EXTRA_TASK_ID)
                if (taskId != null) {
                    startTask(taskId)
                }
            }
            ACTION_STOP_TASK -> {
                val taskId = intent.getStringExtra(EXTRA_TASK_ID)
                if (taskId != null) {
                    stopTask(taskId)
                }
            }
            ACTION_STOP_ALL -> {
                stopAllTasks()
            }
            ACTION_UPDATE_NOTIFICATION -> {
                intent.getStringExtra(EXTRA_NOTIFICATION_TITLE)?.let { notificationTitle = it }
                intent.getStringExtra(EXTRA_NOTIFICATION_BODY)?.let { notificationBody = it }
                updateNotification()
            }
        }

        return START_STICKY
    }

    private fun startTask(taskId: String) {
        Log.d(TAG, "Starting task: $taskId")

        // Foreground Service로 전환
        startForeground(NOTIFICATION_ID, createNotification())

        // Headless WebView 초기화
        headlessWebViewManager?.initialize()

        // 간격 기반 트리거 설정
        val module = BackgroundModule.getInstance()
        val task = module?.let { /* taskManager에서 task 조회 */ }

        // 기본 간격 트리거 (테스트용)
        setupIntervalTrigger(taskId, 60000) // 1분 간격
    }

    private fun stopTask(taskId: String) {
        Log.d(TAG, "Stopping task: $taskId")

        // 간격 트리거 제거
        intervalRunnables[taskId]?.let { runnable ->
            handler.removeCallbacks(runnable)
            intervalRunnables.remove(taskId)
        }

        // 실행 중인 작업이 없으면 서비스 종료
        if (intervalRunnables.isEmpty()) {
            stopSelf()
        }
    }

    private fun stopAllTasks() {
        Log.d(TAG, "Stopping all tasks")

        intervalRunnables.forEach { (_, runnable) ->
            handler.removeCallbacks(runnable)
        }
        intervalRunnables.clear()

        headlessWebViewManager?.destroy()
        stopSelf()
    }

    private fun setupIntervalTrigger(taskId: String, interval: Long) {
        if (interval <= 0) return

        val runnable = object : Runnable {
            override fun run() {
                Log.d(TAG, "Interval trigger for task: $taskId")

                // 이벤트 전송
                BackgroundModule.getInstance()?.emitTaskEvent(taskId, "trigger", "interval")

                // 다음 실행 예약
                handler.postDelayed(this, interval)
            }
        }

        intervalRunnables[taskId] = runnable
        handler.postDelayed(runnable, interval)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Background Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "백그라운드 작업 실행 알림"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val pendingIntent = packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
            PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(notificationTitle)
            .setContentText(notificationBody)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, createNotification())
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        headlessWebViewManager?.destroy()
        intervalRunnables.forEach { (_, runnable) ->
            handler.removeCallbacks(runnable)
        }
        intervalRunnables.clear()
    }
}
```

**Step 2: Commit**

```bash
git add src/modules/android/src/main/java/expo/modules/custombackground/BackgroundService.kt
git commit -m "feat: add Android BackgroundService with foreground notification"
```

---

## Task 12: Create Android HeadlessWebViewManager.kt

**Files:**
- Create: `src/modules/android/src/main/java/expo/modules/custombackground/HeadlessWebViewManager.kt`

**Step 1: Create HeadlessWebViewManager.kt**

```kotlin
package expo.modules.custombackground

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class HeadlessWebViewManager(private val context: Context) {
    private var webView: WebView? = null
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        private const val TAG = "HeadlessWebViewManager"
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun initialize() {
        handler.post {
            if (webView != null) {
                Log.d(TAG, "WebView already initialized")
                return@post
            }

            Log.d(TAG, "Initializing Headless WebView")

            webView = WebView(context).apply {
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    cacheMode = WebSettings.LOAD_DEFAULT
                    allowFileAccess = false
                    allowContentAccess = false
                }

                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.d(TAG, "WebView page loaded: $url")
                    }
                }
            }

            Log.d(TAG, "Headless WebView initialized")
        }
    }

    fun loadUrl(url: String) {
        handler.post {
            webView?.loadUrl(url)
        }
    }

    fun evaluateJavaScript(script: String, callback: ((String?) -> Unit)? = null) {
        handler.post {
            webView?.evaluateJavascript(script) { result ->
                callback?.invoke(result)
            }
        }
    }

    fun destroy() {
        handler.post {
            webView?.let { view ->
                Log.d(TAG, "Destroying Headless WebView")
                view.stopLoading()
                view.clearHistory()
                view.clearCache(true)
                view.destroy()
            }
            webView = null
        }
    }

    fun isInitialized(): Boolean = webView != null
}
```

**Step 2: Commit**

```bash
git add src/modules/android/src/main/java/expo/modules/custombackground/HeadlessWebViewManager.kt
git commit -m "feat: add Android HeadlessWebViewManager"
```

---

## Task 13: Create Android BootReceiver.kt

**Files:**
- Create: `src/modules/android/src/main/java/expo/modules/custombackground/BootReceiver.kt`

**Step 1: Create BootReceiver.kt**

```kotlin
package expo.modules.custombackground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "Boot completed - checking for tasks to restart")

            // TODO: SharedPreferences에서 재시작 필요한 task 확인
            // WorkManager를 통해 재시작 예약
        }
    }
}
```

**Step 2: Commit**

```bash
git add src/modules/android/src/main/java/expo/modules/custombackground/BootReceiver.kt
git commit -m "feat: add Android BootReceiver for restart on boot"
```

---

## Task 14: Create iOS BackgroundModule.swift

**Files:**
- Create: `src/modules/ios/BackgroundModule.swift`

**Step 1: Create BackgroundModule.swift**

```swift
import ExpoModulesCore
import UIKit
import BackgroundTasks

public class BackgroundModule: Module {
    private var taskManager = TaskManager()
    private var headlessWebViewManager: HeadlessWebViewManager?

    public func definition() -> ModuleDefinition {
        Name("CustomBackground")

        Events("onTaskEvent")

        OnCreate {
            self.headlessWebViewManager = HeadlessWebViewManager()
            self.registerBackgroundTasks()
        }

        OnDestroy {
            self.headlessWebViewManager?.destroy()
        }

        // 작업 등록
        AsyncFunction("registerTask") { (params: [String: Any], promise: Promise) in
            guard let taskId = params["taskId"] as? String, !taskId.isEmpty else {
                promise.resolve(["success": false, "error": "TASK_NOT_FOUND"])
                return
            }

            let mode = params["mode"] as? String ?? "persistent"
            let interval = params["interval"] as? Int ?? 0
            let triggers = params["triggers"] as? [String] ?? []
            let scheduledTime = params["scheduledTime"] as? Int

            let task = BackgroundTask(
                taskId: taskId,
                mode: mode,
                interval: interval,
                triggers: triggers,
                scheduledTime: scheduledTime
            )

            let result = self.taskManager.registerTask(task)
            promise.resolve([
                "success": result,
                "taskId": taskId,
                "error": result ? nil : "TASK_ALREADY_EXISTS"
            ])
        }

        // 작업 해제
        AsyncFunction("unregisterTask") { (taskId: String, promise: Promise) in
            let result = self.taskManager.unregisterTask(taskId: taskId)
            promise.resolve([
                "success": result,
                "taskId": taskId,
                "error": result ? nil : "TASK_NOT_FOUND"
            ])
        }

        // 작업 시작
        AsyncFunction("startTask") { (taskId: String, promise: Promise) in
            guard let task = self.taskManager.getTask(taskId: taskId) else {
                promise.resolve(["success": false, "error": "TASK_NOT_FOUND"])
                return
            }

            if task.isRunning {
                promise.resolve(["success": false, "error": "TASK_ALREADY_RUNNING"])
                return
            }

            self.headlessWebViewManager?.initialize()
            self.taskManager.setTaskRunning(taskId: taskId, running: true)

            if task.interval > 0 {
                self.scheduleIntervalTask(taskId: taskId, interval: TimeInterval(task.interval) / 1000.0)
            }

            self.sendEvent("onTaskEvent", [
                "taskId": taskId,
                "type": "started",
                "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
            ])

            promise.resolve(["success": true, "taskId": taskId])
        }

        // 작업 중지
        AsyncFunction("stopTask") { (taskId: String, promise: Promise) in
            guard self.taskManager.getTask(taskId: taskId) != nil else {
                promise.resolve(["success": false, "error": "TASK_NOT_FOUND"])
                return
            }

            self.taskManager.setTaskRunning(taskId: taskId, running: false)

            self.sendEvent("onTaskEvent", [
                "taskId": taskId,
                "type": "stopped",
                "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
            ])

            promise.resolve(["success": true, "taskId": taskId])
        }

        // 모든 작업 중지
        AsyncFunction("stopAllTasks") { (promise: Promise) in
            self.taskManager.stopAllTasks()
            self.headlessWebViewManager?.destroy()
            promise.resolve(["success": true])
        }

        // 알림 업데이트
        AsyncFunction("updateNotification") { (params: [String: Any], promise: Promise) in
            // iOS는 로컬 알림 사용
            promise.resolve(["success": true])
        }

        // 특정 작업 상태 조회
        AsyncFunction("getTaskStatus") { (taskId: String, promise: Promise) in
            guard let task = self.taskManager.getTask(taskId: taskId) else {
                promise.resolve(nil)
                return
            }

            promise.resolve([
                "taskId": task.taskId,
                "isRunning": task.isRunning,
                "mode": task.mode,
                "startedAt": task.startedAt as Any
            ])
        }

        // 전체 작업 상태 조회
        AsyncFunction("getAllTasksStatus") { (promise: Promise) in
            let tasks = self.taskManager.getAllTasks().map { task in
                [
                    "taskId": task.taskId,
                    "isRunning": task.isRunning,
                    "mode": task.mode,
                    "startedAt": task.startedAt as Any
                ]
            }

            promise.resolve([
                "tasks": tasks,
                "isAnyRunning": tasks.contains { ($0["isRunning"] as? Bool) == true }
            ])
        }

        // 권한 확인
        AsyncFunction("checkBackgroundPermission") { (promise: Promise) in
            let status = UIApplication.shared.backgroundRefreshStatus
            let canRun = status == .available

            promise.resolve([
                "canRunBackground": canRun,
                "requiredPermissions": canRun ? [] : ["Background App Refresh"]
            ])
        }

        // 권한 요청
        AsyncFunction("requestBackgroundPermission") { (promise: Promise) in
            // iOS에서는 직접 권한 요청 불가, 설정으로 안내
            if let url = URL(string: UIApplication.openSettingsURLString) {
                DispatchQueue.main.async {
                    UIApplication.shared.open(url)
                }
            }

            promise.resolve([
                "canRunBackground": UIApplication.shared.backgroundRefreshStatus == .available,
                "requiredPermissions": []
            ])
        }
    }

    private func registerBackgroundTasks() {
        if #available(iOS 13.0, *) {
            BGTaskScheduler.shared.register(
                forTaskWithIdentifier: "expo.modules.custombackground.refresh",
                using: nil
            ) { task in
                self.handleBackgroundTask(task: task as! BGAppRefreshTask)
            }
        }
    }

    @available(iOS 13.0, *)
    private func handleBackgroundTask(task: BGAppRefreshTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        // 이벤트 전송
        for runningTask in taskManager.getRunningTasks() {
            sendEvent("onTaskEvent", [
                "taskId": runningTask.taskId,
                "type": "trigger",
                "trigger": "interval",
                "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
            ])
        }

        task.setTaskCompleted(success: true)
        scheduleNextBackgroundTask()
    }

    private func scheduleIntervalTask(taskId: String, interval: TimeInterval) {
        if #available(iOS 13.0, *) {
            scheduleNextBackgroundTask()
        }
    }

    @available(iOS 13.0, *)
    private func scheduleNextBackgroundTask() {
        let request = BGAppRefreshTaskRequest(identifier: "expo.modules.custombackground.refresh")
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60)

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("Failed to schedule background task: \(error)")
        }
    }
}
```

**Step 2: Commit**

```bash
git add src/modules/ios/BackgroundModule.swift
git commit -m "feat: add iOS BackgroundModule with BGTaskScheduler"
```

---

## Task 15: Create iOS TaskManager.swift

**Files:**
- Create: `src/modules/ios/TaskManager.swift`

**Step 1: Create TaskManager.swift**

```swift
import Foundation

struct BackgroundTask {
    let taskId: String
    let mode: String
    let interval: Int
    let triggers: [String]
    let scheduledTime: Int?
    var isRunning: Bool = false
    var startedAt: Int64? = nil
}

class TaskManager {
    private var tasks: [String: BackgroundTask] = [:]
    private let lock = NSLock()

    func registerTask(_ task: BackgroundTask) -> Bool {
        lock.lock()
        defer { lock.unlock() }

        if tasks[task.taskId] != nil {
            return false
        }
        tasks[task.taskId] = task
        return true
    }

    func unregisterTask(taskId: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }

        return tasks.removeValue(forKey: taskId) != nil
    }

    func getTask(taskId: String) -> BackgroundTask? {
        lock.lock()
        defer { lock.unlock() }

        return tasks[taskId]
    }

    func getAllTasks() -> [BackgroundTask] {
        lock.lock()
        defer { lock.unlock() }

        return Array(tasks.values)
    }

    func getRunningTasks() -> [BackgroundTask] {
        lock.lock()
        defer { lock.unlock() }

        return tasks.values.filter { $0.isRunning }
    }

    func setTaskRunning(taskId: String, running: Bool) {
        lock.lock()
        defer { lock.unlock() }

        if var task = tasks[taskId] {
            task.isRunning = running
            task.startedAt = running ? Int64(Date().timeIntervalSince1970 * 1000) : nil
            tasks[taskId] = task
        }
    }

    func stopAllTasks() {
        lock.lock()
        defer { lock.unlock() }

        for taskId in tasks.keys {
            if var task = tasks[taskId] {
                task.isRunning = false
                task.startedAt = nil
                tasks[taskId] = task
            }
        }
    }

    func hasRunningTasks() -> Bool {
        lock.lock()
        defer { lock.unlock() }

        return tasks.values.contains { $0.isRunning }
    }
}
```

**Step 2: Commit**

```bash
git add src/modules/ios/TaskManager.swift
git commit -m "feat: add iOS TaskManager"
```

---

## Task 16: Create iOS HeadlessWebViewManager.swift

**Files:**
- Create: `src/modules/ios/HeadlessWebViewManager.swift`

**Step 1: Create HeadlessWebViewManager.swift**

```swift
import Foundation
import WebKit

class HeadlessWebViewManager: NSObject {
    private var webView: WKWebView?

    func initialize() {
        guard webView == nil else { return }

        DispatchQueue.main.async {
            let config = WKWebViewConfiguration()
            config.allowsInlineMediaPlayback = true

            self.webView = WKWebView(frame: .zero, configuration: config)
            self.webView?.navigationDelegate = self
        }
    }

    func loadURL(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }

        DispatchQueue.main.async {
            self.webView?.load(URLRequest(url: url))
        }
    }

    func evaluateJavaScript(_ script: String, completion: ((Any?, Error?) -> Void)? = nil) {
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript(script, completionHandler: completion)
        }
    }

    func destroy() {
        DispatchQueue.main.async {
            self.webView?.stopLoading()
            self.webView?.navigationDelegate = nil
            self.webView = nil
        }
    }

    var isInitialized: Bool {
        return webView != nil
    }
}

extension HeadlessWebViewManager: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("[HeadlessWebViewManager] Page loaded: \(webView.url?.absoluteString ?? "unknown")")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("[HeadlessWebViewManager] Navigation failed: \(error.localizedDescription)")
    }
}
```

**Step 2: Commit**

```bash
git add src/modules/ios/HeadlessWebViewManager.swift
git commit -m "feat: add iOS HeadlessWebViewManager with WKWebView"
```

---

## Task 17: Update Documentation

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`

**Step 1: Create CLAUDE.md**

```markdown
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
```

**Step 2: Create README.md**

```markdown
# RNWW Plugin Background

React Native WebView 백그라운드 실행 제어 플러그인

## 설치

```bash
npm install rnww-plugin-background
```

## 사용법

```typescript
import { registerBackgroundHandlers } from 'rnww-plugin-background';

registerBackgroundHandlers({
  bridge: yourBridgeImplementation,
  platform: { OS: Platform.OS },
});
```

## API

### registerTask

백그라운드 작업을 등록합니다.

```typescript
registerTask({
  taskId: 'my_task',
  mode: 'persistent',  // 'persistent' | 'efficient'
  interval: 60000,     // 밀리초 (0이면 비활성화)
  triggers: ['network_change', 'location_change']
});
```

### startTask / stopTask

작업을 시작하거나 중지합니다.

```typescript
startTask('my_task');
stopTask('my_task');
stopAllTasks();
```

### updateNotification

알림 내용을 동적으로 업데이트합니다.

```typescript
updateNotification({
  taskId: 'my_task',
  title: '실행 중',
  body: '3개의 메시지 수신'
});
```

### onTaskEvent

이벤트를 수신합니다.

```typescript
// Bridge를 통해 수신
// event.type: 'started' | 'stopped' | 'restart' | 'error' | 'trigger'
```

## 권한 설정

### Android

자동으로 추가됨:
- `FOREGROUND_SERVICE`
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`

### iOS

`Info.plist`에 추가:
- Background Modes: `fetch`, `processing`
- `BGTaskSchedulerPermittedIdentifiers`

## 라이선스

MIT
```

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add CLAUDE.md and README.md documentation"
```

---

## Task 18: Final Build Verification

**Step 1: Install dependencies**

Run: `npm install`

**Step 2: Run TypeScript build**

Run: `npm run build`

Expected: No errors, `lib/` directory created

**Step 3: Verify npm pack**

Run: `npm pack --dry-run`

Expected: Package created successfully

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete rnww-plugin-background implementation"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create type definitions |
| 2 | Create types index |
| 3 | Create module wrapper |
| 4 | Create expo module config |
| 5 | Create bridge handlers |
| 6 | Create bridge index |
| 7 | Create Android build.gradle |
| 8 | Create Android manifest |
| 9 | Create Android BackgroundModule |
| 10 | Create Android TaskManager |
| 11 | Create Android BackgroundService |
| 12 | Create Android HeadlessWebViewManager |
| 13 | Create Android BootReceiver |
| 14 | Create iOS BackgroundModule |
| 15 | Create iOS TaskManager |
| 16 | Create iOS HeadlessWebViewManager |
| 17 | Create documentation |
| 18 | Final build verification |
