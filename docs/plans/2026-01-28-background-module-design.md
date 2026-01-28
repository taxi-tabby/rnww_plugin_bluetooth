# Background Module Design

## Overview

`rnww-plugin-background` - React Native WebView 백그라운드 실행 제어 플러그인

**핵심 목표:**
- 앱이 백그라운드로 내려가도 Headless WebView를 유지하여 연결(WebSocket, HTTP 등) 보존
- 앱이 강제 종료되어도 재시작하여 백그라운드 작업 재개
- 간격 기반 + 이벤트 기반 트리거 모두 지원
- 여러 개의 백그라운드 작업을 taskId로 구분하여 동시 관리

## Architecture

```
WebView (JavaScript)
    ↓ 콜백 등록/설정
Bridge Layer (TypeScript)
    ↓
Module Wrapper (Cross-platform API)
    ↓
Native Modules
    ├── Android: Foreground Service + Headless WebView
    │            WorkManager (재시작용)
    └── iOS: Background Modes + Headless WKWebView
             BGTaskScheduler (재시작용)
```

**두 가지 실행 모드:**
1. **Persistent 모드** - Foreground Service + 알림 표시 (연결 유지 보장)
2. **Efficient 모드** - 시스템에 맡기고 종료 시 재시작 (배터리 효율적, 일시적 끊김 가능)

## Type Definitions

### Task Types

```typescript
interface BackgroundTask {
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

interface NotificationConfig {
  /** 대상 작업 ID (없으면 기본 알림) */
  taskId?: string;
  title: string;
  body: string;
  icon?: string;
}

interface TaskStatus {
  taskId: string;
  isRunning: boolean;
  mode: 'persistent' | 'efficient';
  startedAt?: number;
}

interface BackgroundStatus {
  /** 실행 중인 작업 목록 */
  tasks: TaskStatus[];
  /** 전체 실행 중 여부 */
  isAnyRunning: boolean;
}
```

### Event Types

```typescript
interface TaskEvent {
  taskId: string;
  type: 'started' | 'stopped' | 'restart' | 'error' | 'trigger';
  trigger?: 'interval' | 'network_change' | 'location_change' | 'time_trigger';
  error?: string;
  timestamp: number;
}
```

### Error Types

```typescript
type BackgroundError =
  | 'TASK_NOT_FOUND'        // 존재하지 않는 taskId
  | 'TASK_ALREADY_EXISTS'   // 중복 taskId 등록 시도
  | 'TASK_ALREADY_RUNNING'  // 이미 실행 중인 작업 시작 시도
  | 'PERMISSION_DENIED'     // 백그라운드 권한 없음
  | 'SYSTEM_RESTRICTED'     // 시스템이 백그라운드 실행 제한
  | 'WEBVIEW_INIT_FAILED'   // Headless WebView 초기화 실패
  | 'UNKNOWN';
```

### Permission Types

```typescript
interface PermissionStatus {
  /** 백그라운드 실행 가능 여부 */
  canRunBackground: boolean;
  /** 배터리 최적화 예외 여부 (Android) */
  batteryOptimizationExempt?: boolean;
  /** 필요한 권한 목록 */
  requiredPermissions: string[];
}
```

## Bridge Handlers

| Handler | 설명 |
|---------|------|
| `registerTask` | 백그라운드 작업 등록 (taskId로 구분) |
| `unregisterTask` | 특정 작업 해제 |
| `startTask` | 특정 작업 시작 |
| `stopTask` | 특정 작업 중지 |
| `stopAllTasks` | 모든 작업 중지 |
| `updateNotification` | 알림 동적 업데이트 (taskId 지정 가능) |
| `getTaskStatus` | 특정 작업 상태 조회 |
| `getAllTasksStatus` | 전체 작업 상태 조회 |
| `onTaskEvent` | 작업별 이벤트 콜백 (taskId 포함) |
| `checkBackgroundPermission` | 백그라운드 권한 상태 확인 |
| `requestBackgroundPermission` | 권한 요청 (설정 화면으로 이동) |

## Native Implementation

### Android

**Persistent 모드:**
```
ForegroundService
    └── Headless WebView (숨겨진 WebView 인스턴스)
        └── JavaScript 실행 및 연결 유지
    └── Notification 표시 (동적 업데이트 가능)
```

**Efficient 모드:**
```
WorkManager
    └── 앱 종료 감지 시 재시작 예약
    └── 재시작 → Headless WebView 초기화
        └── onTaskEvent('restart') 이벤트 전달
```

### iOS

**Persistent 모드:**
```
Background Modes (audio/location/voip 중 적합한 것 활용)
    └── Headless WKWebView
    └── 연결 유지
```

**Efficient 모드:**
```
BGTaskScheduler
    └── BGAppRefreshTask / BGProcessingTask
    └── 시스템이 적절한 시점에 앱 깨움
    └── onTaskEvent('restart') 이벤트 전달
```

## Data Flow

### 작업 등록 및 시작 흐름

```
WebView                      Bridge                     Native
   │                           │                          │
   ├─ registerTask(config) ───►│                          │
   │                           ├─ 설정 저장 ──────────────►│
   │                           │◄─ { success: true } ─────┤
   │◄─ 등록 완료 ──────────────┤                          │
   │                           │                          │
   ├─ startTask(taskId) ──────►│                          │
   │                           ├─ Headless WebView 생성 ──►│
   │                           ├─ ForegroundService 시작 ─►│ (persistent)
   │                           │◄─ 시작 완료 ─────────────┤
   │◄─ onTaskEvent('started')──┤                          │
```

### 트리거 발생 흐름

```
Native                       Bridge                     WebView
   │                           │                          │
   ├─ 트리거 감지 ─────────────►│                          │
   │  (interval/event)         │                          │
   │                           ├─ onTaskEvent('trigger')─►│
   │                           │                          ├─ 콜백 실행
   │                           │                          │
   │                           │◄─ updateNotification ────┤ (선택적)
   │◄─ 알림 업데이트 ──────────┤                          │
```

### 앱 종료 후 재시작 흐름 (Efficient 모드)

```
시스템                        Native                     WebView
   │                           │                          │
   ├─ 앱 강제 종료 ───────────►│                          │
   │                           ├─ (상태 소멸) ────────────►│ (WebView 종료)
   │                           │                          │
   ├─ WorkManager 트리거 ─────►│                          │
   │                           ├─ 앱 재시작 ──────────────►│
   │                           ├─ Headless WebView 생성 ──►│ (새로 초기화)
   │                           │                          │
   │                           ├─ onTaskEvent('restart')─►│
   │                           │                          ├─ 콜백에서 복원 처리
```

## Platform Constraints

### Android
- 배터리 최적화 예외 설정 필요 (사용자에게 안내)
- Android 12+ 에서 Foreground Service 제한 있음
- 제조사별 추가 제한 (삼성, 샤오미 등 - 자동 시작 권한)

### iOS
- Background Modes 활성화 필요 (Info.plist)
- 시스템이 BGTask 실행 시점 결정 (정확한 타이밍 보장 안됨)
- 배터리 부족 시 백그라운드 작업 제한됨

## State Management

앱이 강제 종료 후 재시작될 때:
- **상태 복원 없음** - 깔끔하게 새로 시작
- 복원이 필요하면 `onTaskEvent('restart')` 콜백에서 개발자가 직접 처리
- 자유도와 안정성, 성능을 위한 설계 결정

## File Structure

```
rnww-plugin-background/
├── src/
│   ├── bridge/
│   │   ├── index.ts
│   │   └── background-bridge.ts
│   ├── modules/
│   │   ├── index.ts
│   │   ├── expo-module.config.json
│   │   ├── android/
│   │   │   ├── build.gradle
│   │   │   └── src/main/
│   │   │       ├── AndroidManifest.xml
│   │   │       └── java/expo/modules/custombackground/
│   │   │           ├── BackgroundModule.kt
│   │   │           ├── BackgroundService.kt
│   │   │           └── HeadlessWebViewManager.kt
│   │   └── ios/
│   │       ├── BackgroundModule.swift
│   │       └── HeadlessWebViewManager.swift
│   └── types/
│       ├── index.ts
│       └── background-module.ts
├── package.json
├── CLAUDE.md
└── README.md
```

## Usage Example

```typescript
// 작업 등록
registerTask({
  taskId: 'chat_websocket',
  mode: 'persistent',
  interval: 0  // 간격 없음, 연결 유지만
});

registerTask({
  taskId: 'location_sync',
  mode: 'efficient',
  interval: 300000,  // 5분
  triggers: ['location_change']
});

// 작업 시작
startTask('chat_websocket');
startTask('location_sync');

// 알림 업데이트
updateNotification({
  taskId: 'chat_websocket',
  title: '채팅 연결 중',
  body: '3개의 새 메시지'
});

// 이벤트 수신
onTaskEvent((event) => {
  if (event.type === 'restart') {
    // 재시작 후 복원 로직
    reconnectWebSocket();
  }
  if (event.type === 'trigger' && event.trigger === 'interval') {
    // 간격 트리거 처리
    syncData();
  }
});
```
