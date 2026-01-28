/**
 * Background 모듈 타입 정의
 */

// ============================================================================
// Trigger Types
// ============================================================================

/**
 * 트리거 타입
 * - interval: 주기적 실행
 * - network_change: 네트워크 상태 변경 (연결/해제)
 * - location_change: 위치 변경 (significant location change)
 * - time_trigger: 예약된 시간에 실행
 * - battery_low: 배터리 부족 (15% 이하)
 * - battery_okay: 배터리 정상 복귀
 * - battery_charging: 충전 시작
 * - battery_discharging: 충전 해제
 * - app_foreground: 앱이 포그라운드로 전환
 * - app_background: 앱이 백그라운드로 전환
 * - app_terminate: 앱 종료 시
 * - custom: 사용자 정의 트리거
 */
export type TriggerType =
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

/**
 * 트리거 설정 (triggers 배열에서 사용)
 * 문자열 또는 상세 설정 객체
 */
export type TriggerConfig = TriggerType | {
  /** 트리거 타입 */
  type: TriggerType;
  /** custom 트리거의 식별자 */
  customId?: string;
  /** 트리거별 추가 옵션 */
  options?: {
    /** battery_low: 임계값 % (기본 15) */
    threshold?: number;
    /** location_change: 최소 이동 거리(m) */
    minDistance?: number;
    /** network_change: 특정 타입만 감지 */
    networkTypes?: Array<'wifi' | 'cellular' | 'ethernet'>;
  };
};

// ============================================================================
// Callback Types
// ============================================================================

/**
 * 작업 이벤트
 */
export interface TaskEvent {
  /** 작업 ID */
  taskId: string;
  /** 등록 시 지정한 콜백 ID */
  callbackId?: string;
  /** 이벤트 타입 */
  type: 'started' | 'stopped' | 'restart' | 'error' | 'trigger' | 'action';
  /** 트리거 종류 (type이 'trigger'일 때) */
  trigger?: TriggerType;
  /** custom 트리거 식별자 */
  customTriggerId?: string;
  /** 알림 액션 버튼 ID (type이 'action'일 때) */
  actionId?: string;
  /** 에러 메시지 (type이 'error'일 때) */
  error?: string;
  /** 트리거 관련 데이터 */
  data?: {
    /** 배터리 레벨 (%) */
    batteryLevel?: number;
    /** 네트워크 타입 */
    networkType?: 'wifi' | 'cellular' | 'ethernet' | 'none';
    /** 네트워크 연결 상태 */
    isConnected?: boolean;
    /** 위치 정보 */
    location?: { latitude: number; longitude: number };
    /** 기타 커스텀 데이터 */
    [key: string]: unknown;
  };
  /** 타임스탬프 */
  timestamp: number;
}

/**
 * 작업 이벤트 콜백 함수 타입
 */
export type TaskCallback = (event: TaskEvent) => void | Promise<void>;

/**
 * 액션 버튼 콜백 함수 타입
 */
export type ActionCallback = (actionId: string, taskId: string) => void | Promise<void>;

// ============================================================================
// Task Types
// ============================================================================

/**
 * 백그라운드 작업 설정
 */
export interface BackgroundTask {
  /** 작업 고유 ID (WebView에서 직접 지정) */
  taskId: string;

  /**
   * 실행 모드
   * - persistent: 포그라운드 서비스로 항상 실행 (Android), 지속적 백그라운드 (iOS)
   * - efficient: 시스템이 관리하는 효율적 실행 (WorkManager/BGTaskScheduler)
   */
  mode: 'persistent' | 'efficient';

  /**
   * 간격 기반 실행 (밀리초)
   * - 0 또는 미지정: interval 트리거 비활성화
   * - persistent 모드: 최소 1000ms (1초)
   * - efficient 모드: 최소 900000ms (15분, 시스템 제한)
   */
  interval?: number;

  /**
   * 이벤트 트리거 목록
   * 문자열 또는 상세 설정 객체 배열
   */
  triggers?: TriggerConfig[];

  /**
   * 예약 실행 시간 (Unix timestamp, ms)
   * time_trigger 사용 시 필요
   */
  scheduledTime?: number;

  /**
   * 콜백 식별자
   * 여러 작업의 이벤트를 구분하기 위한 ID
   */
  callbackId?: string;

  /** 초기 알림 설정 (persistent 모드 필수) */
  notification?: NotificationConfig;

  /**
   * 이벤트 발생 시 실행할 콜백 함수
   * 모든 이벤트 타입에 대해 호출됨
   */
  callback?: TaskCallback;
}

// ============================================================================
// Notification Types
// ============================================================================

/**
 * 알림 액션 버튼
 */
export interface NotificationAction {
  /** 액션 고유 식별자 */
  id: string;

  /** 버튼에 표시될 텍스트 */
  title: string;

  /** 버튼 아이콘 리소스명 (Android only) */
  icon?: string;

  /**
   * 버튼 클릭 시 실행될 콜백 함수
   * 지정하지 않으면 onTaskEvent로 'action' 이벤트 전달
   */
  onPress?: ActionCallback;

  /**
   * 버튼 클릭 시 알림 자동 닫기 여부
   * @default true
   */
  dismissOnPress?: boolean;

  /**
   * 버튼 클릭 시 앱을 포그라운드로 가져올지 여부
   * @default false
   */
  bringToForeground?: boolean;
}

/**
 * 알림 진행 상태바
 */
export interface NotificationProgress {
  /** 현재 진행 값 */
  current: number;
  /** 최대 값 */
  max: number;
  /**
   * 무한 진행 표시 (indeterminate progress bar)
   * true면 current/max 무시
   */
  indeterminate?: boolean;
}

/**
 * 알림 설정
 */
export interface NotificationConfig {
  /** 대상 작업 ID (updateNotification 시 필요) */
  taskId?: string;

  /** 알림 제목 */
  title: string;

  /** 알림 본문 */
  body: string;

  /**
   * 알림 아이콘 리소스명 (Android)
   * @example 'ic_notification' → res/drawable/ic_notification.png
   */
  icon?: string;

  /**
   * 아이콘/강조 색상 (hex)
   * @example '#4CAF50', '#FF5733'
   */
  color?: string;

  /**
   * 알림 우선순위
   * - min: 최소 (무음, 상태바에만 표시)
   * - low: 낮음 (무음)
   * - default: 기본
   * - high: 높음 (헤드업 알림)
   * - max: 최대 (긴급, 헤드업 알림)
   */
  priority?: 'min' | 'low' | 'default' | 'high' | 'max';

  /**
   * 지속 알림 여부
   * true면 사용자가 스와이프로 닫을 수 없음
   * persistent 모드에서는 항상 true로 강제됨
   */
  ongoing?: boolean;

  /** 진행 상태바 설정 */
  progress?: NotificationProgress;

  /**
   * 알림 액션 버튼 목록
   * 최대 3개까지 지원
   */
  actions?: NotificationAction[];

  /**
   * 알림 채널 ID (Android 8.0+)
   * 미지정 시 기본 채널 사용
   */
  channelId?: string;

  /**
   * 알림 채널 이름 (Android 8.0+)
   * 채널 생성 시 사용자에게 표시되는 이름
   */
  channelName?: string;

  /**
   * 알림 채널 설명 (Android 8.0+)
   */
  channelDescription?: string;
}

// ============================================================================
// Status Types
// ============================================================================

/**
 * 개별 작업 상태
 */
export interface TaskStatus {
  /** 작업 ID */
  taskId: string;
  /** 실행 중 여부 */
  isRunning: boolean;
  /** 실행 모드 */
  mode: 'persistent' | 'efficient';
  /** 시작 시간 (Unix timestamp, ms) */
  startedAt?: number;
  /** 마지막 트리거 시간 */
  lastTriggeredAt?: number;
  /** 총 트리거 횟수 */
  triggerCount?: number;
}

/**
 * 전체 백그라운드 상태
 */
export interface BackgroundStatus {
  /** 등록된 작업 목록 */
  tasks: TaskStatus[];
  /** 실행 중인 작업이 있는지 여부 */
  isAnyRunning: boolean;
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
  /** 거부된 권한 목록 */
  deniedPermissions?: string[];
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
  | 'TASK_NOT_RUNNING'
  | 'PERMISSION_DENIED'
  | 'SYSTEM_RESTRICTED'
  | 'WEBVIEW_INIT_FAILED'
  | 'INVALID_INPUT'
  | 'INVALID_INTERVAL'
  | 'INVALID_TRIGGER'
  | 'NOTIFICATION_REQUIRED'
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
  message?: string;
}

/**
 * 작업 시작/중지 결과
 */
export interface TaskActionResult {
  success: boolean;
  taskId?: string;
  error?: BackgroundError;
  message?: string;
}

/**
 * 알림 업데이트 결과
 */
export interface NotificationResult {
  success: boolean;
  error?: string;
}
