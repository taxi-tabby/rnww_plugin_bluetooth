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
