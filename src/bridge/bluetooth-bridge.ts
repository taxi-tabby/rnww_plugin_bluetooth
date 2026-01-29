/**
 * Bluetooth 브릿지 핸들러
 * 의존성 주입을 통해 동작하는 순수한 브릿지 로직
 */

import type { IBridge, IPlatform } from '../types';
import * as Bluetooth from '../modules';
import type {
  BluetoothDevice,
  BleScanOptions,
  ClassicScanOptions,
  ConnectionOptions,
  ClassicConnectionOptions,
  WriteOptions,
  BluetoothEvent,
  BluetoothEventCallback,
} from '../types/bluetooth-module';

// ============================================================================
// Types
// ============================================================================

/**
 * Bluetooth 브릿지 설정
 */
export interface BluetoothBridgeConfig {
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
 * deviceId 유효성 검사
 */
function isValidDeviceId(deviceId: unknown): deviceId is string {
  return typeof deviceId === 'string' && deviceId.trim().length > 0;
}

/**
 * UUID 유효성 검사
 */
function isValidUuid(uuid: unknown): uuid is string {
  return typeof uuid === 'string' && uuid.trim().length > 0;
}

/**
 * Base64 문자열 유효성 검사
 */
function isValidBase64(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return value.length > 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Main Handler
// ============================================================================

/** 중복 등록 방지 플래그 */
let isRegistered = false;

/**
 * Bluetooth 브릿지 핸들러를 등록합니다
 */
export const registerBluetoothHandlers = (config: BluetoothBridgeConfig): void => {
  const { bridge, platform, logger = console } = config;

  // 플랫폼 체크
  if (platform.OS !== 'android' && platform.OS !== 'ios') {
    logger.log('[Bridge] Bluetooth handlers skipped (Android/iOS only)');
    return;
  }

  // 중복 등록 방지
  if (isRegistered) {
    logger.warn('[Bridge] Bluetooth handlers already registered, skipping');
    return;
  }
  isRegistered = true;

  // 이벤트 리스너 구독 객체
  let eventSubscription: EventSubscription | null = null;

  // 이벤트 콜백 저장소
  const eventCallbacks = new Set<BluetoothEventCallback>();

  /**
   * 이벤트 핸들러 - 콜백 실행 및 Web 전달
   */
  const handleBluetoothEvent = (event: BluetoothEvent): void => {
    // Web으로 이벤트 전달 (non-blocking)
    try {
      bridge.sendToWeb('onBluetoothEvent', event);
    } catch (error) {
      logger.error('[Bridge] Failed to send event to web:', error);
    }

    // 콜백 실행
    eventCallbacks.forEach((callback) => {
      Promise.resolve()
        .then(() => callback(event))
        .catch((error) => {
          logger.error('[Bridge] Event callback error:', error);
        });
    });
  };

  /**
   * 이벤트 리스너 초기화
   */
  const ensureEventListener = (): void => {
    if (!eventSubscription) {
      eventSubscription = Bluetooth.addBluetoothEventListener(handleBluetoothEvent);
    }
  };

  // ============================================================================
  // State & Permission Handlers
  // ============================================================================

  // Bluetooth 상태 확인
  bridge.registerHandler('getBluetoothState', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const state = await Bluetooth.getBluetoothState();
      respond({ success: true, state });
    } catch (error) {
      logger.error('[Bridge] getBluetoothState error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to get Bluetooth state',
      });
    }
  });

  // 권한 확인
  bridge.registerHandler('checkBluetoothPermissions', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const status = await Bluetooth.checkPermissions();
      respond({ success: true, ...status });
    } catch (error) {
      logger.error('[Bridge] checkBluetoothPermissions error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to check permissions',
      });
    }
  });

  // 권한 요청
  bridge.registerHandler('requestBluetoothPermissions', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const status = await Bluetooth.requestPermissions();
      respond({ success: true, ...status });
    } catch (error) {
      logger.error('[Bridge] requestBluetoothPermissions error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to request permissions',
      });
    }
  });

  // Bluetooth 활성화 요청
  bridge.registerHandler('requestEnableBluetooth', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const result = await Bluetooth.requestEnableBluetooth();
      respond(result);
    } catch (error) {
      logger.error('[Bridge] requestEnableBluetooth error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to enable Bluetooth',
      });
    }
  });

  // ============================================================================
  // BLE Scan Handlers
  // ============================================================================

  // BLE 스캔 시작
  bridge.registerHandler('startBleScan', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const options = (payload as BleScanOptions) || {};
      ensureEventListener();
      const result = await Bluetooth.startBleScan(options);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] startBleScan error:', error);
      respond({
        success: false,
        error: 'SCAN_FAILED',
        message: error instanceof Error ? error.message : 'Failed to start BLE scan',
      });
    }
  });

  // BLE 스캔 중지
  bridge.registerHandler('stopBleScan', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const result = await Bluetooth.stopBleScan();
      respond(result);
    } catch (error) {
      logger.error('[Bridge] stopBleScan error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to stop BLE scan',
      });
    }
  });

  // 스캔 중 여부 확인
  bridge.registerHandler('isScanning', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const isScanning = await Bluetooth.isScanning();
      respond({ success: true, isScanning });
    } catch (error) {
      logger.error('[Bridge] isScanning error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to check scanning state',
      });
    }
  });

  // ============================================================================
  // Classic Bluetooth Scan Handlers (Android only)
  // ============================================================================

  // Classic 스캔 시작
  bridge.registerHandler('startClassicScan', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const options = (payload as ClassicScanOptions) || {};
      ensureEventListener();
      const result = await Bluetooth.startClassicScan(options);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] startClassicScan error:', error);
      respond({
        success: false,
        error: 'SCAN_FAILED',
        message: error instanceof Error ? error.message : 'Failed to start Classic scan',
      });
    }
  });

  // Classic 스캔 중지
  bridge.registerHandler('stopClassicScan', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const result = await Bluetooth.stopClassicScan();
      respond(result);
    } catch (error) {
      logger.error('[Bridge] stopClassicScan error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to stop Classic scan',
      });
    }
  });

  // 페어링된 장치 목록
  bridge.registerHandler('getBondedDevices', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const result = await Bluetooth.getBondedDevices();
      respond(result);
    } catch (error) {
      logger.error('[Bridge] getBondedDevices error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to get bonded devices',
      });
    }
  });

  // ============================================================================
  // Connection Handlers
  // ============================================================================

  // BLE 연결
  bridge.registerHandler('connectBle', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;

      if (!isValidDeviceId(deviceId)) {
        respond({
          success: false,
          error: 'INVALID_INPUT',
          message: 'Invalid deviceId',
        });
        return;
      }

      ensureEventListener();
      const options = (data?.options as ConnectionOptions) || {};
      const result = await Bluetooth.connectBle(deviceId, options);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] connectBle error:', error);
      respond({
        success: false,
        error: 'CONNECTION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to connect BLE device',
      });
    }
  });

  // Classic 연결
  bridge.registerHandler('connectClassic', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const address = data?.address;

      if (!isValidDeviceId(address)) {
        respond({
          success: false,
          error: 'INVALID_INPUT',
          message: 'Invalid address',
        });
        return;
      }

      ensureEventListener();
      const options = (data?.options as ClassicConnectionOptions) || {};
      const result = await Bluetooth.connectClassic(address as string, options);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] connectClassic error:', error);
      respond({
        success: false,
        error: 'CONNECTION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to connect Classic device',
      });
    }
  });

  // 연결 해제
  bridge.registerHandler('disconnect', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;

      if (!isValidDeviceId(deviceId)) {
        respond({
          success: false,
          error: 'INVALID_INPUT',
          message: 'Invalid deviceId',
        });
        return;
      }

      const result = await Bluetooth.disconnect(deviceId);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] disconnect error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to disconnect',
      });
    }
  });

  // 모든 연결 해제
  bridge.registerHandler('disconnectAll', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const result = await Bluetooth.disconnectAll();
      respond(result);
    } catch (error) {
      logger.error('[Bridge] disconnectAll error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to disconnect all',
      });
    }
  });

  // 연결 상태 확인
  bridge.registerHandler('isConnected', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;

      if (!isValidDeviceId(deviceId)) {
        respond({
          success: false,
          error: 'INVALID_INPUT',
          message: 'Invalid deviceId',
        });
        return;
      }

      const isConnected = await Bluetooth.isConnected(deviceId);
      respond({ success: true, isConnected });
    } catch (error) {
      logger.error('[Bridge] isConnected error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to check connection',
      });
    }
  });

  // 연결된 장치 목록
  bridge.registerHandler('getConnectedDevices', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      const result = await Bluetooth.getConnectedDevices();
      respond(result);
    } catch (error) {
      logger.error('[Bridge] getConnectedDevices error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to get connected devices',
      });
    }
  });

  // ============================================================================
  // BLE GATT Handlers
  // ============================================================================

  // 서비스 발견
  bridge.registerHandler('discoverServices', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;

      if (!isValidDeviceId(deviceId)) {
        respond({
          success: false,
          error: 'INVALID_INPUT',
          message: 'Invalid deviceId',
        });
        return;
      }

      const result = await Bluetooth.discoverServices(deviceId);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] discoverServices error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to discover services',
      });
    }
  });

  // 특성 읽기
  bridge.registerHandler('readCharacteristic', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;
      const serviceUuid = data?.serviceUuid;
      const characteristicUuid = data?.characteristicUuid;

      if (!isValidDeviceId(deviceId)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid deviceId' });
        return;
      }
      if (!isValidUuid(serviceUuid)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid serviceUuid' });
        return;
      }
      if (!isValidUuid(characteristicUuid)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid characteristicUuid' });
        return;
      }

      const result = await Bluetooth.readCharacteristic(deviceId, serviceUuid, characteristicUuid);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] readCharacteristic error:', error);
      respond({
        success: false,
        error: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Failed to read characteristic',
      });
    }
  });

  // 특성 쓰기
  bridge.registerHandler('writeCharacteristic', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;
      const serviceUuid = data?.serviceUuid;
      const characteristicUuid = data?.characteristicUuid;
      const value = data?.value;
      const options = (data?.options as WriteOptions) || {};

      if (!isValidDeviceId(deviceId)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid deviceId' });
        return;
      }
      if (!isValidUuid(serviceUuid)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid serviceUuid' });
        return;
      }
      if (!isValidUuid(characteristicUuid)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid characteristicUuid' });
        return;
      }
      if (!isValidBase64(value)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid value (expected Base64 string)' });
        return;
      }

      const result = await Bluetooth.writeCharacteristic(deviceId, serviceUuid, characteristicUuid, value, options);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] writeCharacteristic error:', error);
      respond({
        success: false,
        error: 'WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to write characteristic',
      });
    }
  });

  // 알림 설정
  bridge.registerHandler('setNotification', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;
      const serviceUuid = data?.serviceUuid;
      const characteristicUuid = data?.characteristicUuid;
      const enable = data?.enable;

      if (!isValidDeviceId(deviceId)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid deviceId' });
        return;
      }
      if (!isValidUuid(serviceUuid)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid serviceUuid' });
        return;
      }
      if (!isValidUuid(characteristicUuid)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid characteristicUuid' });
        return;
      }
      if (typeof enable !== 'boolean') {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid enable value' });
        return;
      }

      ensureEventListener();
      const result = await Bluetooth.setNotification(deviceId, serviceUuid, characteristicUuid, enable);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] setNotification error:', error);
      respond({
        success: false,
        error: 'NOTIFICATION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to set notification',
      });
    }
  });

  // MTU 요청
  bridge.registerHandler('requestMtu', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;
      const mtu = data?.mtu;

      if (!isValidDeviceId(deviceId)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid deviceId' });
        return;
      }
      if (typeof mtu !== 'number' || mtu < 23 || mtu > 517) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid MTU (23-517)' });
        return;
      }

      const result = await Bluetooth.requestMtu(deviceId, mtu);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] requestMtu error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to request MTU',
      });
    }
  });

  // ============================================================================
  // Classic Bluetooth Data Handlers
  // ============================================================================

  // Classic 데이터 쓰기
  bridge.registerHandler('writeClassic', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;
      const value = data?.value;

      if (!isValidDeviceId(deviceId)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid deviceId' });
        return;
      }
      if (!isValidBase64(value)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid value (expected Base64 string)' });
        return;
      }

      const result = await Bluetooth.writeClassic(deviceId, value);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] writeClassic error:', error);
      respond({
        success: false,
        error: 'WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to write Classic data',
      });
    }
  });

  // ============================================================================
  // Bonding Handlers
  // ============================================================================

  // 페어링
  bridge.registerHandler('createBond', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;

      if (!isValidDeviceId(deviceId)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid deviceId' });
        return;
      }

      const result = await Bluetooth.createBond(deviceId);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] createBond error:', error);
      respond({
        success: false,
        error: 'BONDING_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create bond',
      });
    }
  });

  // 페어링 해제
  bridge.registerHandler('removeBond', async (payload: unknown, respond: (data: unknown) => void) => {
    try {
      const data = payload as Record<string, unknown>;
      const deviceId = data?.deviceId;

      if (!isValidDeviceId(deviceId)) {
        respond({ success: false, error: 'INVALID_INPUT', message: 'Invalid deviceId' });
        return;
      }

      const result = await Bluetooth.removeBond(deviceId);
      respond(result);
    } catch (error) {
      logger.error('[Bridge] removeBond error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to remove bond',
      });
    }
  });

  // ============================================================================
  // Dispose Handler
  // ============================================================================

  // 리소스 정리
  bridge.registerHandler('disposeBluetoothHandlers', async (_payload: unknown, respond: (data: unknown) => void) => {
    try {
      // 이벤트 리스너 해제
      if (eventSubscription) {
        eventSubscription.remove();
        eventSubscription = null;
      }

      // 콜백 정리
      eventCallbacks.clear();

      // 재등록 가능하도록 플래그 리셋
      isRegistered = false;

      logger.log('[Bridge] Bluetooth handlers disposed');
      respond({ success: true });
    } catch (error) {
      logger.error('[Bridge] disposeBluetoothHandlers error:', error);
      respond({
        success: false,
        error: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to dispose handlers',
      });
    }
  });

  logger.log('[Bridge] Bluetooth handlers registered');
};
