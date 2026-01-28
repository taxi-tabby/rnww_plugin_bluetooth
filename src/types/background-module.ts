/**
 * Background 모듈 타입 정의
 */

// ============================================================================
// Callback Types
// ============================================================================

/** 전방 선언 */
export interface TaskEvent {
  taskId: string;
  callbackId?: string;
  type: 'started' | 'stopped' | 'restart' | 'error' | 'trigger' | 'action';
  trigger?: 'interval' | 'network_change' | 'location_change' | 'time_trigger';
  actionId?: string;
  error?: string;
  timestamp: number;
}

/**
 * 작업 이벤트 콜백 함수 타입
 */
export type TaskCallback = (event: TaskEvent) => void | Promise<void>;

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
  /** 콜백 식별자 (이벤트 라우팅용) */
  callbackId?: string;
  /** 초기 알림 설정 */
  notification?: NotificationConfig;
  /** 이벤트 발생 시 실행할 콜백 함수 */
  callback?: TaskCallback;
}

/**
 * 알림 액션 버튼
 */
export interface NotificationAction {
  /** 액션 식별자 */
  id: string;
  /** 버튼 텍스트 */
  title: string;
  /** 버튼 아이콘 (Android) */
  icon?: string;
}

/**
 * 알림 진행 상태바
 */
export interface NotificationProgress {
  /** 현재 값 */
  current: number;
  /** 최대 값 */
  max: number;
  /** 무한 진행 표시 여부 */
  indeterminate?: boolean;
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

  // 스타일/색상 옵션
  /** 아이콘/강조 색상 (hex) */
  color?: string;
  /** 알림 우선순위 */
  priority?: 'min' | 'low' | 'default' | 'high' | 'max';
  /** 지속 알림 여부 (dismiss 불가) */
  ongoing?: boolean;

  // 진행 상태바
  /** 진행 상태바 설정 */
  progress?: NotificationProgress;

  // 액션 버튼 (최대 3개)
  /** 알림 액션 버튼 목록 */
  actions?: NotificationAction[];

  // 채널 설정 (Android)
  /** 알림 채널 ID */
  channelId?: string;
  /** 알림 채널 이름 */
  channelName?: string;
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
