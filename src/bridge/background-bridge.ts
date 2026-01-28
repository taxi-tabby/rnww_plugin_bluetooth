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
