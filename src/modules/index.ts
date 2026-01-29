/**
 * Bluetooth Module (Cross-Platform)
 * BLE 및 Classic Bluetooth 통신 기능 제공
 * Supports: Android, iOS
 */

import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import type {
  BluetoothDevice,
  BleDevice,
  ClassicDevice,
  BleService,
  BleCharacteristic,
  ConnectionInfo,
  BleScanOptions,
  ClassicScanOptions,
  ConnectionOptions,
  ClassicConnectionOptions,
  WriteOptions,
  ReadResult,
  BluetoothPermissionStatus,
  BluetoothState,
  BluetoothEvent,
  BluetoothResult,
  ScanStartResult,
  ConnectResult,
  DiscoverServicesResult,
  MtuResult,
  DevicesResult,
  ConnectedDevicesResult,
  BondedDevicesResult,
} from '../types/bluetooth-module';

// Lazy 모듈 로드 (크래시 방지)
let BluetoothModule: any = null;

function getBluetoothModule() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return null;
  }

  if (BluetoothModule === null) {
    try {
      BluetoothModule = requireNativeModule('CustomBluetooth');
    } catch (error) {
      console.error('[CustomBluetooth] Failed to load native module:', error);
      BluetoothModule = undefined;
      return null;
    }
  }

  return BluetoothModule === undefined ? null : BluetoothModule;
}

// ============================================================================
// State & Permission
// ============================================================================

/**
 * Bluetooth 상태 확인
 */
export async function getBluetoothState(): Promise<BluetoothState> {
  const module = getBluetoothModule();
  if (!module) {
    return 'unsupported';
  }
  return await module.getBluetoothState();
}

/**
 * Bluetooth 권한 확인
 */
export async function checkPermissions(): Promise<BluetoothPermissionStatus> {
  const module = getBluetoothModule();
  if (!module) {
    return {
      isAvailable: false,
      isEnabled: false,
      scanPermission: 'denied',
      connectPermission: 'denied',
      requiredPermissions: [],
      deniedPermissions: [],
    };
  }
  return await module.checkPermissions();
}

/**
 * Bluetooth 권한 요청
 */
export async function requestPermissions(): Promise<BluetoothPermissionStatus> {
  const module = getBluetoothModule();
  if (!module) {
    return {
      isAvailable: false,
      isEnabled: false,
      scanPermission: 'denied',
      connectPermission: 'denied',
      requiredPermissions: [],
      deniedPermissions: [],
    };
  }
  return await module.requestPermissions();
}

/**
 * Bluetooth 활성화 요청 (Android only)
 */
export async function requestEnableBluetooth(): Promise<BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.requestEnableBluetooth();
}

// ============================================================================
// BLE Scanning
// ============================================================================

/**
 * BLE 장치 스캔 시작
 */
export async function startBleScan(options?: BleScanOptions): Promise<ScanStartResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.startBleScan(options || {});
}

/**
 * BLE 장치 스캔 중지
 */
export async function stopBleScan(): Promise<BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.stopBleScan();
}

/**
 * BLE 스캔 중 여부
 */
export async function isScanning(): Promise<boolean> {
  const module = getBluetoothModule();
  if (!module) {
    return false;
  }
  return await module.isScanning();
}

// ============================================================================
// Classic Bluetooth Scanning (Android only)
// ============================================================================

/**
 * Classic Bluetooth 장치 스캔 시작 (Android only)
 */
export async function startClassicScan(options?: ClassicScanOptions): Promise<ScanStartResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  if (Platform.OS !== 'android') {
    return { success: false, error: 'OPERATION_NOT_SUPPORTED', message: 'Classic Bluetooth scan is only supported on Android' };
  }
  return await module.startClassicScan(options || {});
}

/**
 * Classic Bluetooth 장치 스캔 중지 (Android only)
 */
export async function stopClassicScan(): Promise<BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  if (Platform.OS !== 'android') {
    return { success: false, error: 'OPERATION_NOT_SUPPORTED' };
  }
  return await module.stopClassicScan();
}

/**
 * 페어링된 장치 목록 조회 (Android only)
 */
export async function getBondedDevices(): Promise<BondedDevicesResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  if (Platform.OS !== 'android') {
    return { success: false, error: 'OPERATION_NOT_SUPPORTED' };
  }
  return await module.getBondedDevices();
}

// ============================================================================
// Connection
// ============================================================================

/**
 * BLE 장치 연결
 */
export async function connectBle(deviceId: string, options?: ConnectionOptions): Promise<ConnectResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.connectBle(deviceId, options || {});
}

/**
 * Classic Bluetooth 장치 연결 (Android only)
 */
export async function connectClassic(address: string, options?: ClassicConnectionOptions): Promise<ConnectResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  if (Platform.OS !== 'android') {
    return { success: false, error: 'OPERATION_NOT_SUPPORTED', message: 'Classic Bluetooth is only supported on Android' };
  }
  return await module.connectClassic(address, options || {});
}

/**
 * 장치 연결 해제
 */
export async function disconnect(deviceId: string): Promise<BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.disconnect(deviceId);
}

/**
 * 모든 장치 연결 해제
 */
export async function disconnectAll(): Promise<BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.disconnectAll();
}

/**
 * 연결 상태 확인
 */
export async function isConnected(deviceId: string): Promise<boolean> {
  const module = getBluetoothModule();
  if (!module) {
    return false;
  }
  return await module.isConnected(deviceId);
}

/**
 * 연결된 장치 목록 조회
 */
export async function getConnectedDevices(): Promise<ConnectedDevicesResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.getConnectedDevices();
}

// ============================================================================
// BLE GATT Operations
// ============================================================================

/**
 * BLE 서비스 발견
 */
export async function discoverServices(deviceId: string): Promise<DiscoverServicesResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.discoverServices(deviceId);
}

/**
 * BLE 특성 읽기
 */
export async function readCharacteristic(
  deviceId: string,
  serviceUuid: string,
  characteristicUuid: string
): Promise<ReadResult & BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE', deviceId, value: '', timestamp: 0 };
  }
  return await module.readCharacteristic(deviceId, serviceUuid, characteristicUuid);
}

/**
 * BLE 특성 쓰기
 */
export async function writeCharacteristic(
  deviceId: string,
  serviceUuid: string,
  characteristicUuid: string,
  value: string,
  options?: WriteOptions
): Promise<BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.writeCharacteristic(deviceId, serviceUuid, characteristicUuid, value, options || {});
}

/**
 * BLE 알림 활성화/비활성화
 */
export async function setNotification(
  deviceId: string,
  serviceUuid: string,
  characteristicUuid: string,
  enable: boolean
): Promise<BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.setNotification(deviceId, serviceUuid, characteristicUuid, enable);
}

/**
 * MTU 크기 요청 (Android only)
 */
export async function requestMtu(deviceId: string, mtu: number): Promise<MtuResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  return await module.requestMtu(deviceId, mtu);
}

// ============================================================================
// Classic Bluetooth Data (Android only)
// ============================================================================

/**
 * Classic Bluetooth 데이터 쓰기 (Android only)
 */
export async function writeClassic(deviceId: string, value: string): Promise<BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  if (Platform.OS !== 'android') {
    return { success: false, error: 'OPERATION_NOT_SUPPORTED' };
  }
  return await module.writeClassic(deviceId, value);
}

// ============================================================================
// Bonding (Android only)
// ============================================================================

/**
 * 장치 페어링 (Android only)
 */
export async function createBond(deviceId: string): Promise<BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  if (Platform.OS !== 'android') {
    return { success: false, error: 'OPERATION_NOT_SUPPORTED' };
  }
  return await module.createBond(deviceId);
}

/**
 * 장치 페어링 해제 (Android only)
 */
export async function removeBond(deviceId: string): Promise<BluetoothResult> {
  const module = getBluetoothModule();
  if (!module) {
    return { success: false, error: 'BLUETOOTH_UNAVAILABLE' };
  }
  if (Platform.OS !== 'android') {
    return { success: false, error: 'OPERATION_NOT_SUPPORTED' };
  }
  return await module.removeBond(deviceId);
}

// ============================================================================
// Event Listener
// ============================================================================

/**
 * Bluetooth 이벤트 리스너 등록
 */
export function addBluetoothEventListener(
  listener: (event: BluetoothEvent) => void
): { remove: () => void } {
  const module = getBluetoothModule();
  if (!module || !module.addListener) {
    return { remove: () => {} };
  }
  return module.addListener('onBluetoothEvent', listener);
}
