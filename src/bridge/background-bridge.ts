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

  // 작업별 콜백 ID 매핑 (taskId → callbackId)
  const callbackIdMap = new Map<string, string>();

  // 콜백 함수 저장소 (taskId → callback)
  const callbackMap = new Map<string, TaskCallback>();

  /**
   * 이벤트 핸들러 - 콜백 실행 및 Web 전달
   */
  const handleTaskEvent = async (event: TaskEvent): Promise<void> => {
    // callbackId 추가
    const enrichedEvent: TaskEvent = {
      ...event,
      callbackId: callbackIdMap.get(event.taskId),
    };

    // 등록된 콜백 실행
    const callback = callbackMap.get(event.taskId);
    if (callback) {
      try {
        await callback(enrichedEvent);
      } catch (error) {
        logger.error('[Bridge] Callback execution error:', error);
      }
    }

    // Web으로도 이벤트 전달
    bridge.sendToWeb('onTaskEvent', enrichedEvent);
  };

  /**
   * 이벤트 리스너 초기화
   */
  const ensureEventListener = (): void => {
    if (!eventSubscription) {
      eventSubscription = Background.addTaskEventListener(handleTaskEvent);
    }
  };

  // 작업 등록
  bridge.registerHandler('registerTask', async (payload: any, respond: any) => {
    try {
      const task = payload as BackgroundTask;

      // callbackId 저장
      if (task.callbackId) {
        callbackIdMap.set(task.taskId, task.callbackId);
      }

      // callback 함수 저장
      if (task.callback) {
        callbackMap.set(task.taskId, task.callback);
      }

      // 네이티브 모듈에는 callback 제외하고 전달
      const { callback, ...taskWithoutCallback } = task;
      const result = await Background.registerTask(taskWithoutCallback);
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

      // 매핑 제거
      callbackIdMap.delete(taskId);
      callbackMap.delete(taskId);

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

      ensureEventListener();

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

      // 모든 매핑 제거
      callbackIdMap.clear();
      callbackMap.clear();

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
      const notificationConfig = payload as NotificationConfig;
      const result = await Background.updateNotification(notificationConfig);
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
