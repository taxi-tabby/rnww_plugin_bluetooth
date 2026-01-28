# RNWW Plugin Background

React Native WebView 백그라운드 실행 제어 플러그인

## 설치

```bash
npm install rnww-plugin-background
```

## 빠른 시작

```typescript
import { registerBackgroundHandlers } from 'rnww-plugin-background';

registerBackgroundHandlers({
  bridge: yourBridgeImplementation,
  platform: { OS: Platform.OS },
});
```

---

## Bridge Handlers

### registerTask

백그라운드 작업을 등록합니다.

```typescript
bridge.call('registerTask', {
  taskId: 'sync-task',
  mode: 'persistent',
  interval: 60000,
  triggers: ['network_change', 'battery_low'],
  callbackId: 'my-callback',
  callback: (event) => {
    console.log('Task event:', event);
  },
  notification: {
    title: '백그라운드 실행 중',
    body: '동기화 진행 중...',
    color: '#4CAF50',
    priority: 'high',
    ongoing: true,
    progress: { current: 0, max: 100 },
    actions: [
      {
        id: 'pause',
        title: '일시정지',
        onPress: (actionId, taskId) => {
          console.log(`Action ${actionId} clicked for task ${taskId}`);
        }
      }
    ]
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
  progress: { current: 50, max: 100 },
  actions: [
    {
      id: 'cancel',
      title: '취소',
      onPress: (actionId, taskId) => {
        bridge.call('stopTask', { taskId });
      }
    }
  ]
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

---

## 콜백 시스템

### Task Callback

작업 등록 시 `callback` 함수를 지정하면 해당 작업의 모든 이벤트를 수신합니다.

```typescript
bridge.call('registerTask', {
  taskId: 'my-task',
  mode: 'persistent',
  callback: (event) => {
    switch (event.type) {
      case 'started':
        console.log('작업 시작됨');
        break;
      case 'stopped':
        console.log('작업 중지됨');
        break;
      case 'trigger':
        console.log(`트리거 발생: ${event.trigger}`, event.data);
        break;
      case 'action':
        console.log(`액션 클릭: ${event.actionId}`);
        break;
      case 'error':
        console.error('에러 발생:', event.error);
        break;
    }
  },
  notification: { title: 'Task', body: 'Running...' }
});
```

### Action Callback

각 알림 액션 버튼에 `onPress` 콜백을 개별 지정할 수 있습니다.

```typescript
bridge.call('registerTask', {
  taskId: 'download-task',
  mode: 'persistent',
  notification: {
    title: '다운로드 중',
    body: '파일 다운로드...',
    actions: [
      {
        id: 'pause',
        title: '일시정지',
        icon: 'ic_pause',
        dismissOnPress: false,
        onPress: async (actionId, taskId) => {
          await pauseDownload();
          bridge.call('updateNotification', {
            taskId,
            title: '일시정지됨',
            body: '다운로드가 일시정지되었습니다'
          });
        }
      },
      {
        id: 'cancel',
        title: '취소',
        dismissOnPress: true,
        bringToForeground: false,
        onPress: async (actionId, taskId) => {
          await cancelDownload();
          bridge.call('stopTask', { taskId });
        }
      }
    ]
  }
});
```

### Callback ID

`callbackId`를 지정하면 이벤트 수신 시 해당 ID가 함께 전달되어 여러 작업의 이벤트를 구분할 수 있습니다.

```typescript
// 작업 등록
bridge.call('registerTask', {
  taskId: 'task-1',
  callbackId: 'sync-callback',
  // ...
});

bridge.call('registerTask', {
  taskId: 'task-2',
  callbackId: 'upload-callback',
  // ...
});

// 이벤트 수신
bridge.on('onTaskEvent', (event) => {
  if (event.callbackId === 'sync-callback') {
    // task-1의 이벤트 처리
  } else if (event.callbackId === 'upload-callback') {
    // task-2의 이벤트 처리
  }
});
```

---

## 트리거 시스템

### 트리거 종류

| 트리거 | 설명 |
|--------|------|
| `interval` | 주기적 실행 (interval 옵션 사용) |
| `network_change` | 네트워크 상태 변경 (연결/해제) |
| `location_change` | 위치 변경 (significant location change) |
| `time_trigger` | 예약된 시간에 실행 |
| `battery_low` | 배터리 부족 (기본 15% 이하) |
| `battery_okay` | 배터리 정상 복귀 |
| `battery_charging` | 충전 시작 |
| `battery_discharging` | 충전 해제 |
| `app_foreground` | 앱이 포그라운드로 전환 |
| `app_background` | 앱이 백그라운드로 전환 |
| `app_terminate` | 앱 종료 시 |
| `custom` | 사용자 정의 트리거 |

### 간단한 사용법

문자열로 트리거 타입만 지정:

```typescript
bridge.call('registerTask', {
  taskId: 'my-task',
  mode: 'persistent',
  triggers: ['network_change', 'battery_low', 'app_background'],
  // ...
});
```

### 상세 설정

객체로 트리거별 옵션 지정:

```typescript
bridge.call('registerTask', {
  taskId: 'my-task',
  mode: 'persistent',
  triggers: [
    // 배터리 30% 이하일 때 트리거
    {
      type: 'battery_low',
      options: { threshold: 30 }
    },
    // WiFi 연결 변경만 감지
    {
      type: 'network_change',
      options: { networkTypes: ['wifi'] }
    },
    // 100m 이상 이동 시 트리거
    {
      type: 'location_change',
      options: { minDistance: 100 }
    },
    // 사용자 정의 트리거
    {
      type: 'custom',
      customId: 'my-custom-trigger'
    }
  ],
  callback: (event) => {
    if (event.type === 'trigger') {
      switch (event.trigger) {
        case 'battery_low':
          console.log('배터리 레벨:', event.data?.batteryLevel);
          break;
        case 'network_change':
          console.log('네트워크:', event.data?.networkType, event.data?.isConnected);
          break;
        case 'location_change':
          console.log('위치:', event.data?.location);
          break;
        case 'custom':
          console.log('커스텀 트리거:', event.customTriggerId);
          break;
      }
    }
  },
  // ...
});
```

### 트리거 옵션 상세

#### battery_low / battery_okay

```typescript
{
  type: 'battery_low',
  options: {
    threshold: 20  // 배터리 임계값 % (기본: 15)
  }
}
```

이벤트 데이터:
```typescript
event.data?.batteryLevel  // 현재 배터리 레벨 (%)
```

#### network_change

```typescript
{
  type: 'network_change',
  options: {
    networkTypes: ['wifi', 'cellular']  // 감지할 네트워크 타입
  }
}
```

이벤트 데이터:
```typescript
event.data?.networkType   // 'wifi' | 'cellular' | 'ethernet' | 'none'
event.data?.isConnected   // 연결 상태 (boolean)
```

#### location_change

```typescript
{
  type: 'location_change',
  options: {
    minDistance: 50  // 최소 이동 거리 (미터)
  }
}
```

이벤트 데이터:
```typescript
event.data?.location  // { latitude: number, longitude: number }
```

#### time_trigger

예약 시간에 트리거. `scheduledTime` 필드와 함께 사용:

```typescript
bridge.call('registerTask', {
  taskId: 'scheduled-task',
  mode: 'efficient',
  triggers: ['time_trigger'],
  scheduledTime: Date.now() + 3600000,  // 1시간 후
  // ...
});
```

#### custom

사용자 정의 트리거. 네이티브 측에서 직접 발생시킬 수 있음:

```typescript
{
  type: 'custom',
  customId: 'my-sync-trigger'  // 고유 식별자
}
```

이벤트에서 `event.customTriggerId`로 식별 가능.

---

## 알림 설정

### 기본 알림

```typescript
notification: {
  title: '백그라운드 작업',
  body: '작업이 실행 중입니다',
  icon: 'ic_notification',  // Android drawable 리소스명
}
```

### 스타일 옵션

```typescript
notification: {
  title: '동기화',
  body: '데이터 동기화 중...',

  // 아이콘/강조 색상 (hex)
  color: '#4CAF50',

  // 우선순위
  // 'min': 최소 (무음, 상태바만)
  // 'low': 낮음 (무음)
  // 'default': 기본
  // 'high': 높음 (헤드업 알림)
  // 'max': 최대 (긴급)
  priority: 'high',

  // 지속 알림 (사용자가 스와이프로 닫을 수 없음)
  // persistent 모드에서는 항상 true
  ongoing: true,
}
```

### 진행 상태바

```typescript
notification: {
  title: '다운로드 중',
  body: '50% 완료',
  progress: {
    current: 50,
    max: 100,
    indeterminate: false  // true면 무한 진행 표시
  }
}
```

무한 진행 표시 (로딩):

```typescript
progress: {
  current: 0,
  max: 100,
  indeterminate: true
}
```

### 액션 버튼

최대 3개까지 지원:

```typescript
notification: {
  title: '음악 재생 중',
  body: 'Now Playing...',
  actions: [
    {
      id: 'prev',
      title: '이전',
      icon: 'ic_prev',  // Android drawable (선택)
      dismissOnPress: false,  // 클릭 시 알림 유지
      bringToForeground: false,  // 앱을 포그라운드로 가져오지 않음
      onPress: (actionId, taskId) => {
        playPrevious();
      }
    },
    {
      id: 'pause',
      title: '일시정지',
      icon: 'ic_pause',
      onPress: (actionId, taskId) => {
        togglePlayPause();
      }
    },
    {
      id: 'next',
      title: '다음',
      icon: 'ic_next',
      onPress: (actionId, taskId) => {
        playNext();
      }
    }
  ]
}
```

### 채널 설정 (Android 8.0+)

```typescript
notification: {
  title: '알림',
  body: '내용',
  channelId: 'sync_channel',
  channelName: '동기화 알림',
  channelDescription: '백그라운드 동기화 알림을 표시합니다'
}
```

---

## 실행 모드

### persistent 모드

포그라운드 서비스로 항상 실행됩니다. 알림이 필수입니다.

```typescript
bridge.call('registerTask', {
  taskId: 'always-on',
  mode: 'persistent',
  interval: 10000,  // 최소 1초 (1000ms)
  notification: {   // 필수
    title: '실행 중',
    body: '백그라운드 서비스 동작 중'
  }
});
```

**특징:**
- 시스템에 의해 종료되지 않음 (높은 우선순위)
- 항상 알림 표시 (ongoing: true 강제)
- interval 최소값: 1000ms (1초)
- 배터리 사용량 높음

### efficient 모드

시스템이 관리하는 효율적 실행입니다. (WorkManager/BGTaskScheduler)

```typescript
bridge.call('registerTask', {
  taskId: 'periodic-sync',
  mode: 'efficient',
  interval: 900000,  // 최소 15분 (900000ms)
  triggers: ['network_change'],
  notification: {  // 선택
    title: '동기화',
    body: '대기 중...'
  }
});
```

**특징:**
- 시스템이 배터리/리소스에 따라 실행 시점 조정
- interval 최소값: 900000ms (15분, 시스템 제한)
- 정확한 타이밍 보장 안됨
- 배터리 효율적

---

## 이벤트

### onTaskEvent

모든 작업 이벤트를 수신합니다.

```typescript
bridge.on('onTaskEvent', (event) => {
  console.log('Event:', event);
});
```

### TaskEvent 구조

```typescript
interface TaskEvent {
  taskId: string;              // 작업 ID
  callbackId?: string;         // 등록 시 지정한 콜백 ID
  type: 'started' | 'stopped' | 'restart' | 'error' | 'trigger' | 'action';
  trigger?: TriggerType;       // 트리거 종류 (type이 'trigger'일 때)
  customTriggerId?: string;    // custom 트리거 식별자
  actionId?: string;           // 액션 버튼 ID (type이 'action'일 때)
  error?: string;              // 에러 메시지 (type이 'error'일 때)
  data?: {                     // 트리거 관련 데이터
    batteryLevel?: number;
    networkType?: 'wifi' | 'cellular' | 'ethernet' | 'none';
    isConnected?: boolean;
    location?: { latitude: number; longitude: number };
    [key: string]: unknown;
  };
  timestamp: number;           // 타임스탬프
}
```

---

## 타입 정의

### BackgroundTask

```typescript
interface BackgroundTask {
  taskId: string;
  mode: 'persistent' | 'efficient';
  interval?: number;
  triggers?: TriggerConfig[];
  scheduledTime?: number;
  callbackId?: string;
  callback?: (event: TaskEvent) => void | Promise<void>;
  notification?: NotificationConfig;
}
```

### TriggerConfig

```typescript
type TriggerType =
  | 'interval'
  | 'network_change'
  | 'location_change'
  | 'time_trigger'
  | 'battery_low'
  | 'battery_okay'
  | 'battery_charging'
  | 'battery_discharging'
  | 'app_foreground'
  | 'app_background'
  | 'app_terminate'
  | 'custom';

type TriggerConfig = TriggerType | {
  type: TriggerType;
  customId?: string;
  options?: {
    threshold?: number;
    minDistance?: number;
    networkTypes?: Array<'wifi' | 'cellular' | 'ethernet'>;
  };
};
```

### NotificationConfig

```typescript
interface NotificationConfig {
  taskId?: string;
  title: string;
  body: string;
  icon?: string;
  color?: string;
  priority?: 'min' | 'low' | 'default' | 'high' | 'max';
  ongoing?: boolean;
  progress?: {
    current: number;
    max: number;
    indeterminate?: boolean;
  };
  actions?: NotificationAction[];
  channelId?: string;
  channelName?: string;
  channelDescription?: string;
}
```

### NotificationAction

```typescript
interface NotificationAction {
  id: string;
  title: string;
  icon?: string;
  onPress?: (actionId: string, taskId: string) => void | Promise<void>;
  dismissOnPress?: boolean;   // 기본: true
  bringToForeground?: boolean; // 기본: false
}
```

### BackgroundError

```typescript
type BackgroundError =
  | 'TASK_NOT_FOUND'
  | 'TASK_ALREADY_EXISTS'
  | 'TASK_ALREADY_RUNNING'
  | 'TASK_NOT_RUNNING'
  | 'PERMISSION_DENIED'
  | 'SYSTEM_RESTRICTED'
  | 'WEBVIEW_INIT_FAILED'
  | 'INVALID_INPUT'
  | 'INVALID_INTERVAL'
  | 'INVALID_TRIGGER'
  | 'NOTIFICATION_REQUIRED'
  | 'UNKNOWN';
```

---

## 권한 설정

### Android

`AndroidManifest.xml`에 자동 추가:

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
```

### iOS

`Info.plist`에 추가:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>fetch</string>
  <string>processing</string>
</array>

<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER).background</string>
</array>
```

---

## 예제: 음악 플레이어

```typescript
// 음악 재생 백그라운드 서비스
bridge.call('registerTask', {
  taskId: 'music-player',
  mode: 'persistent',
  triggers: [
    'app_background',
    { type: 'battery_low', options: { threshold: 10 } }
  ],
  callback: (event) => {
    if (event.type === 'trigger' && event.trigger === 'battery_low') {
      // 배터리 부족 시 품질 낮춤
      setStreamQuality('low');
    }
  },
  notification: {
    title: 'Now Playing',
    body: 'Artist - Song Title',
    color: '#1DB954',
    ongoing: true,
    actions: [
      {
        id: 'prev',
        title: '이전',
        icon: 'ic_skip_previous',
        dismissOnPress: false,
        onPress: () => skipToPrevious()
      },
      {
        id: 'play_pause',
        title: '재생/일시정지',
        icon: 'ic_play_pause',
        dismissOnPress: false,
        onPress: () => togglePlayPause()
      },
      {
        id: 'next',
        title: '다음',
        icon: 'ic_skip_next',
        dismissOnPress: false,
        onPress: () => skipToNext()
      }
    ]
  }
});

// 트랙 변경 시 알림 업데이트
function onTrackChange(track) {
  bridge.call('updateNotification', {
    taskId: 'music-player',
    title: track.title,
    body: `${track.artist} - ${track.album}`,
  });
}
```

## 예제: 파일 동기화

```typescript
// 효율적 주기 동기화
bridge.call('registerTask', {
  taskId: 'file-sync',
  mode: 'efficient',
  interval: 1800000,  // 30분
  triggers: [
    { type: 'network_change', options: { networkTypes: ['wifi'] } },
    'battery_charging'
  ],
  callback: async (event) => {
    if (event.type === 'trigger') {
      // WiFi 연결되거나 충전 시작 시 동기화
      await syncFiles();
    }
  },
  notification: {
    title: '동기화 대기 중',
    body: '다음 동기화 예약됨',
    priority: 'low'
  }
});

// 동기화 진행 시 알림 업데이트
async function syncFiles() {
  const files = await getFilesToSync();

  for (let i = 0; i < files.length; i++) {
    bridge.call('updateNotification', {
      taskId: 'file-sync',
      title: '동기화 중',
      body: `${files[i].name}`,
      progress: {
        current: i + 1,
        max: files.length
      }
    });

    await uploadFile(files[i]);
  }

  bridge.call('updateNotification', {
    taskId: 'file-sync',
    title: '동기화 완료',
    body: `${files.length}개 파일 동기화됨`,
    progress: undefined
  });
}
```

---

## 라이선스

MIT
