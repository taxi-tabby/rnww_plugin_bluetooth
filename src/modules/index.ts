/**
 * Background Module (Cross-Platform)
 * 백그라운드 실행 제어 기능 제공
 * Supports: Android, iOS
 */

import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import type {
  BackgroundTask,
  NotificationConfig,
  TaskStatus,
  BackgroundStatus,
  PermissionStatus,
  RegisterTaskResult,
  TaskActionResult,
  NotificationResult,
} from '../types/background-module';

// Lazy 모듈 로드 (크래시 방지)
let BackgroundModule: any = null;

function getBackgroundModule() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return null;
  }

  if (BackgroundModule === null) {
    try {
      BackgroundModule = requireNativeModule('CustomBackground');
    } catch (error) {
      console.error('[CustomBackground] Failed to load native module:', error);
      BackgroundModule = undefined;
      return null;
    }
  }

  return BackgroundModule === undefined ? null : BackgroundModule;
}

/**
 * 백그라운드 작업 등록
 */
export async function registerTask(task: BackgroundTask): Promise<RegisterTaskResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'UNKNOWN' };
  }
  return await module.registerTask(task);
}

/**
 * 백그라운드 작업 해제
 */
export async function unregisterTask(taskId: string): Promise<TaskActionResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'UNKNOWN' };
  }
  return await module.unregisterTask(taskId);
}

/**
 * 백그라운드 작업 시작
 */
export async function startTask(taskId: string): Promise<TaskActionResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'UNKNOWN' };
  }
  return await module.startTask(taskId);
}

/**
 * 백그라운드 작업 중지
 */
export async function stopTask(taskId: string): Promise<TaskActionResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'UNKNOWN' };
  }
  return await module.stopTask(taskId);
}

/**
 * 모든 백그라운드 작업 중지
 */
export async function stopAllTasks(): Promise<TaskActionResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'UNKNOWN' };
  }
  return await module.stopAllTasks();
}

/**
 * 알림 업데이트
 */
export async function updateNotification(config: NotificationConfig): Promise<NotificationResult> {
  const module = getBackgroundModule();
  if (!module) {
    return { success: false, error: 'Module not available' };
  }
  return await module.updateNotification(config);
}

/**
 * 특정 작업 상태 조회
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatus | null> {
  const module = getBackgroundModule();
  if (!module) {
    return null;
  }
  return await module.getTaskStatus(taskId);
}

/**
 * 전체 작업 상태 조회
 */
export async function getAllTasksStatus(): Promise<BackgroundStatus> {
  const module = getBackgroundModule();
  if (!module) {
    return { tasks: [], isAnyRunning: false };
  }
  return await module.getAllTasksStatus();
}

/**
 * 백그라운드 권한 확인
 */
export async function checkBackgroundPermission(): Promise<PermissionStatus> {
  const module = getBackgroundModule();
  if (!module) {
    return { canRunBackground: false, requiredPermissions: [] };
  }
  return await module.checkBackgroundPermission();
}

/**
 * 백그라운드 권한 요청
 */
export async function requestBackgroundPermission(): Promise<PermissionStatus> {
  const module = getBackgroundModule();
  if (!module) {
    return { canRunBackground: false, requiredPermissions: [] };
  }
  return await module.requestBackgroundPermission();
}

/**
 * 이벤트 리스너 등록
 */
export function addTaskEventListener(
  listener: (event: any) => void
): { remove: () => void } {
  const module = getBackgroundModule();
  if (!module || !module.addListener) {
    return { remove: () => {} };
  }
  return module.addListener('onTaskEvent', listener);
}
