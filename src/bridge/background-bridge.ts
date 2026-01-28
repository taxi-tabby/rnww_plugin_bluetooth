/**
 * Background 브릿지 핸들러
 * 의존성 주입을 통해 동작하는 순수한 브릿지 로직
 */

import type { IBridge, IPlatform } from '../types';
import * as Background from '../modules';
import type {
  BackgroundTask,
  NotificationConfig,
  TaskEvent,
  TaskCallback,
} from '../types/background-module';

// ============================================================================
// Types
// ============================================================================

/**
 * Background 브릿지 설정
 */
export interface BackgroundBridgeConfig {
  bridge: IBridge;
  platform: IPlatform;
  logger?: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * 이벤트 구독 객체 타입
 */
interface EventSubscription {
  remove: () => void;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * taskId 유효성 검사
 */
function isValidTaskId(taskId: unknown): taskId is string {
  return typeof taskId === 'string' && taskId.trim().length > 0;
}

/**
 * BackgroundTask 기본 유효성 검사
 */
function isValidBackgroundTask(task: unknown): task is BackgroundTask {
  if (!task || typeof task !== 'object') return false;
  const t = task as Record<string, unknown>;
  return (
    isValidTaskId(t.taskId) &&
    (t.mode === 'persistent' || t.mode === 'efficient')
  );
}

/**
 * NotificationConfig 유효성 검사
 */
function isValidNotificationConfig(config: unknown): config is NotificationConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  return (
    typeof c.title === 'string' &&
    typeof c.body === 'string'
  );
}

/**
 * hex color 유효성 검사
 */
function isValidHexColor(color: unknown): boolean {
  if (typeof color !== 'string') return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color);
}

/**
 * NotificationConfig 정규화 (보안 및 제한 적용)
 */
function sanitizeNotificationConfig(config: NotificationConfig): NotificationConfig {
  const sanitized = { ...config };

  // color 검증
  if (sanitized.color && !isValidHexColor(sanitized.color)) {
    delete sanitized.color;
  }

  // actions 최대 3개 제한
  if (sanitized.actions && sanitized.actions.length > 3) {
    sanitized.actions = sanitized.actions.slice(0, 3);
  }

  // progress 값 검증
  if (sanitized.progress) {
    sanitized.progress = {
      ...sanitized.progress,
      current: Math.max(0, sanitized.progress.current),
      max: Math.max(1, sanitized.progress.max),
    };
    // current가 max를 초과하지 않도록
    if (sanitized.progress.current > sanitized.progress.max) {
      sanitized.progress.current = sanitized.progress.max;
    }
  }

  return sanitized;
}

// ============================================================================
// Main Handler
// ============================================================================

/** 중복 등록 방지 플래그 */
let isRegistered = false;

/**
 * Background 브릿지 핸들러를 등록합니다
 */
export const registerBackgroundHandlers = (config: BackgroundBridgeConfig): void => {
  const { bridge, platform, logger = console } = config;

  // 플랫폼 체크
  if (platform.OS !== 'android' && platform.OS !== 'ios') {
    logger.log('[Bridge] Background handlers skipped (Android/iOS only)');
    return;
  }

  // 중복 등록 방지
  if (isRegistered) {
    logger.warn('[Bridge] Background handlers already registered, skipping');
    return;
  }
  isRegistered = true;

  // 이벤트 리스너 구독 객체
  let eventSubscription: EventSubscription | null = null;

  // 작업별 콜백 ID 매핑 (taskId → callbackId)
  const callbackIdMap = new Map<string, string>();

  // 콜백 함수 저장소 (taskId → callback)
  const callbackMap = new Map<string, TaskCallback>();

  /**
   * 이벤트 핸들러 - 콜백 실행 및 Web 전달
   */
  const handleTaskEvent = (event: TaskEvent): void => {
    // 이벤트 검증
    if (!event || !isValidTaskId(event.taskId)) {
      logger.warn('[Bridge] Invalid task event received:', event);
      return;
    }

    // callbackId 추가
    const enrichedEvent: TaskEvent = {
      ...event,
      callbackId: callbackIdMap.get(event.taskId),
    };

    // Web으로 이벤트 전달 (먼저, non-blocking)
    try {
      bridge.sendToWeb('onTaskEvent', enrichedEvent);
    } catch (error) {
      logger.error('[Bridge] Failed to send event to web:', error);
    }

    // 등록된 콜백 실행 (비동기, non-blocking)
    const callback = callbackMap.get(event.taskId);
    if (callback) {
      Promise.resolve()
        .then(() => callback(enrichedEvent))
        .catch((error) => {
          logger.error('[Bridge] Callback execution error:', error);
        });
    }
  };

  /**
   * 이벤트 리스너 초기화
   */
  const ensureEventListener = (): void => {
    if (!eventSubscription) {
      eventSubscription = Background.addTaskEventListener(handleTaskEvent);
    }
  };

  // ============================================================================
  // Handler Registration
  // ============================================================================

  // 작업 등록
  bridge.registerHandler('registerTask', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      // 입력 검증
      if (!isValidBackgroundTask(payload)) {
        respond({
          success: false,
          error: 'INVALID_INPUT',
          message: 'Invalid task configuration: taskId and mode are required',
        });
        return;
      }

      const task = payload as BackgroundTask;
      const { callback, notification, ...taskConfig } = task;

      // notification 정규화
      const sanitizedTask = {
        ...taskConfig,
        ...(notification && { notification: sanitizeNotificationConfig(notification) }),
      };

      // 네이티브 모듈에 등록
      const result = await Background.registerTask(sanitizedTask);

      // 등록 성공 시에만 콜백 저장
      if (result.success) {
        if (task.callbackId) {
          callbackIdMap.set(task.taskId, task.callbackId);
        }
        if (callback && typeof callback === 'function') {
          callbackMap.set(task.taskId, callback);
        }
      }

      respond(result);
    } catch (error) {
      logger.error('[Bridge] registerTask error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to register task',
      });
    }
  });

  // 작업 해제
  bridge.registerHandler('unregisterTask', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const taskId = data?.taskId;

      // 입력 검증
      if (!isValidTaskId(taskId)) {
        respond({
          success: false,
          error: 'INVALID_INPUT',
          message: 'Invalid taskId',
        });
        return;
      }

      // 매핑 제거 (네이티브 호출 전에 제거 - 실패해도 정리)
      callbackIdMap.delete(taskId);
      callbackMap.delete(taskId);

      const result = await Background.unregisterTask(taskId);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] unregisterTask error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to unregister task',
      });
    }
  });

  // 작업 시작
  bridge.registerHandler('startTask', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const taskId = data?.taskId;

      // 입력 검증
      if (!isValidTaskId(taskId)) {
        respond({
          success: false,
          error: 'INVALID_INPUT',
          message: 'Invalid taskId',
        });
        return;
      }

      ensureEventListener();

      const result = await Background.startTask(taskId);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] startTask error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to start task',
      });
    }
  });

  // 작업 중지
  bridge.registerHandler('stopTask', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const taskId = data?.taskId;

      // 입력 검증
      if (!isValidTaskId(taskId)) {
        respond({
          success: false,
          error: 'INVALID_INPUT',
          message: 'Invalid taskId',
        });
        return;
      }

      const result = await Background.stopTask(taskId);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] stopTask error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to stop task',
      });
    }
  });

  // 모든 작업 중지
  bridge.registerHandler('stopAllTasks', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const result = await Background.stopAllTasks();

      // 이벤트 리스너 해제
      if (eventSubscription) {
        eventSubscription.remove();
        eventSubscription = null;
      }

      // 모든 매핑 제거
      callbackIdMap.clear();
      callbackMap.clear();

      respond(result);
    } catch (error) {
      logger.error('[Bridge] stopAllTasks error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to stop all tasks',
      });
    }
  });

  // 알림 업데이트
  bridge.registerHandler('updateNotification', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      // 입력 검증
      if (!isValidNotificationConfig(payload)) {
        respond({
          success: false,
          error: 'Invalid notification config: title and body are required',
        });
        return;
      }

      const sanitizedConfig = sanitizeNotificationConfig(payload);
      const result = await Background.updateNotification(sanitizedConfig);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] updateNotification error:', error);
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update notification',
      });
    }
  });

  // 특정 작업 상태 조회
  bridge.registerHandler('getTaskStatus', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const taskId = data?.taskId;

      // 입력 검증
      if (!isValidTaskId(taskId)) {
        respond({
          success: false,
          error: 'Invalid taskId',
        });
        return;
      }

      const status = await Background.getTaskStatus(taskId);
      respond({ success: true, status });
    } catch (error) {
      logger.error('[Bridge] getTaskStatus error:', error);
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get task status',
      });
    }
  });

  // 전체 작업 상태 조회
  bridge.registerHandler('getAllTasksStatus', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const status = await Background.getAllTasksStatus();
      respond({ success: true, ...status });
    } catch (error) {
      logger.error('[Bridge] getAllTasksStatus error:', error);
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get all tasks status',
      });
    }
  });

  // 권한 확인
  bridge.registerHandler('checkBackgroundPermission', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const status = await Background.checkBackgroundPermission();
      respond({ success: true, ...status });
    } catch (error) {
      logger.error('[Bridge] checkBackgroundPermission error:', error);
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check permission',
      });
    }
  });

  // 권한 요청
  bridge.registerHandler('requestBackgroundPermission', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const status = await Background.requestBackgroundPermission();
      respond({ success: true, ...status });
    } catch (error) {
      logger.error('[Bridge] requestBackgroundPermission error:', error);
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to request permission',
      });
    }
  });

  // 리소스 정리 (dispose)
  bridge.registerHandler('disposeBackgroundHandlers', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      // 이벤트 리스너 해제
      if (eventSubscription) {
        eventSubscription.remove();
        eventSubscription = null;
      }

      // 모든 매핑 제거
      callbackIdMap.clear();
      callbackMap.clear();

      // 재등록 가능하도록 플래그 리셋
      isRegistered = false;

      logger.log('[Bridge] Background handlers disposed');
      respond({ success: true });
    } catch (error) {
      logger.error('[Bridge] disposeBackgroundHandlers error:', error);
      respond({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to dispose handlers',
      });
    }
  });

  logger.log('[Bridge] Background handlers registered');
};
