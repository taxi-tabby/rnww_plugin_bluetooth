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
