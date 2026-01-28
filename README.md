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

## Bridge Handlers

### registerTask

백그라운드 작업을 등록합니다.

```typescript
bridge.call('registerTask', {
  taskId: 'sync-task',
  mode: 'persistent',  // 'persistent' | 'efficient'
  interval: 60000,     // 밀리초 (0이면 비활성화)
  triggers: ['network_change', 'location_change', 'time_trigger'],
  callbackId: 'my-callback',  // 이벤트 라우팅용 식별자
  callback: (event) => {      // 이벤트 콜백 함수
    console.log('Event:', event);
  },
  notification: {
    title: '백그라운드 실행 중',
    body: '동기화 진행 중...',
    color: '#4CAF50',
    priority: 'high',
    ongoing: true,
    progress: {
      current: 0,
      max: 100,
      indeterminate: false
    },
    actions: [
      { id: 'pause', title: '일시정지' },
      { id: 'cancel', title: '취소' }
    ],
    channelId: 'sync_channel',
    channelName: '동기화 알림'
  }
});
```

### startTask / stopTask

작업을 시작하거나 중지합니다.

```typescript
bridge.call('startTask', { taskId: 'sync-task' });
bridge.call('stopTask', { taskId: 'sync-task' });
bridge.call('stopAllTasks');
```

### unregisterTask

등록된 작업을 해제합니다.

```typescript
bridge.call('unregisterTask', { taskId: 'sync-task' });
```

### updateNotification

알림 내용을 동적으로 업데이트합니다.

```typescript
bridge.call('updateNotification', {
  taskId: 'sync-task',
  title: '동기화 중',
  body: '50% 완료',
  progress: {
    current: 50,
    max: 100
  }
});
```

### getTaskStatus / getAllTasksStatus

작업 상태를 조회합니다.

```typescript
const status = await bridge.call('getTaskStatus', { taskId: 'sync-task' });
const allStatus = await bridge.call('getAllTasksStatus');
```

### checkBackgroundPermission / requestBackgroundPermission

백그라운드 권한을 확인하고 요청합니다.

```typescript
const permission = await bridge.call('checkBackgroundPermission');
if (!permission.canRunBackground) {
  await bridge.call('requestBackgroundPermission');
}
```

### disposeBackgroundHandlers

브릿지 핸들러와 리소스를 정리합니다.

```typescript
bridge.call('disposeBackgroundHandlers');
```

## Events

### onTaskEvent

이벤트를 수신합니다.

```typescript
bridge.on('onTaskEvent', (event) => {
  // event.taskId: 작업 ID
  // event.callbackId: 등록 시 지정한 콜백 ID
  // event.type: 'started' | 'stopped' | 'restart' | 'error' | 'trigger' | 'action'
  // event.trigger: 'interval' | 'network_change' | 'location_change' | 'time_trigger'
  // event.actionId: 알림 액션 버튼 ID (type이 'action'일 때)
  // event.error: 에러 메시지 (type이 'error'일 때)
  // event.timestamp: 타임스탬프

  if (event.type === 'action' && event.actionId === 'pause') {
    // 일시정지 버튼 클릭됨
  }
});
```

## Types

### BackgroundTask

```typescript
interface BackgroundTask {
  taskId: string;
  mode: 'persistent' | 'efficient';
  interval?: number;
  triggers?: Array<'network_change' | 'location_change' | 'time_trigger'>;
  scheduledTime?: number;
  callbackId?: string;
  callback?: (event: TaskEvent) => void | Promise<void>;
  notification?: NotificationConfig;
}
```

### NotificationConfig

```typescript
interface NotificationConfig {
  taskId?: string;
  title: string;
  body: string;
  icon?: string;
  color?: string;                    // hex color (예: '#FF5733')
  priority?: 'min' | 'low' | 'default' | 'high' | 'max';
  ongoing?: boolean;                 // dismiss 불가
  progress?: {
    current: number;
    max: number;
    indeterminate?: boolean;
  };
  actions?: Array<{                  // 최대 3개
    id: string;
    title: string;
    icon?: string;
  }>;
  channelId?: string;                // Android
  channelName?: string;              // Android
}
```

### TaskEvent

```typescript
interface TaskEvent {
  taskId: string;
  callbackId?: string;
  type: 'started' | 'stopped' | 'restart' | 'error' | 'trigger' | 'action';
  trigger?: 'interval' | 'network_change' | 'location_change' | 'time_trigger';
  actionId?: string;
  error?: string;
  timestamp: number;
}
```

### BackgroundError

```typescript
type BackgroundError =
  | 'TASK_NOT_FOUND'
  | 'TASK_ALREADY_EXISTS'
  | 'TASK_ALREADY_RUNNING'
  | 'PERMISSION_DENIED'
  | 'SYSTEM_RESTRICTED'
  | 'WEBVIEW_INIT_FAILED'
  | 'INVALID_INPUT'
  | 'UNKNOWN';
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
