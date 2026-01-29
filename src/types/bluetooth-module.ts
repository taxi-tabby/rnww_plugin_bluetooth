/**
 * Bluetooth 모듈 타입 정의
 */

// ============================================================================
// Device Types
// ============================================================================

/**
 * Bluetooth 장치 타입
 */
export type BluetoothDeviceType = 'ble' | 'classic';

/**
 * BLE 장치 정보
 */
export interface BleDevice {
  /** 장치 고유 ID (UUID) */
  id: string;
  /** 장치 이름 */
  name: string | null;
  /** RSSI 신호 강도 */
  rssi: number;
  /** 광고 데이터 (Base64 인코딩) */
  advertisementData?: string;
  /** 서비스 UUID 목록 */
  serviceUUIDs?: string[];
  /** 연결 가능 여부 */
  isConnectable?: boolean;
  /** 제조사 데이터 */
  manufacturerData?: {
    companyId: number;
    data: string; // Base64
  };
  /** 로컬 이름 */
  localName?: string;
  /** TX 파워 레벨 */
  txPowerLevel?: number;
}

/**
 * Classic Bluetooth 장치 정보
 */
export interface ClassicDevice {
  /** 장치 주소 (MAC) */
  address: string;
  /** 장치 이름 */
  name: string | null;
  /** 장치 클래스 */
  deviceClass?: number;
  /** 본딩(페어링) 상태 */
  bondState: 'none' | 'bonding' | 'bonded';
  /** 장치 타입 */
  type?: 'unknown' | 'classic' | 'le' | 'dual';
  /** RSSI 신호 강도 (스캔 중에만 사용 가능) */
  rssi?: number;
}

/**
 * 통합 Bluetooth 장치 정보
 */
export interface BluetoothDevice {
  /** 장치 ID (BLE: UUID, Classic: MAC) */
  id: string;
  /** 장치 이름 */
  name: string | null;
  /** 장치 타입 */
  type: BluetoothDeviceType;
  /** RSSI 신호 강도 */
  rssi?: number;
  /** BLE 장치 정보 */
  ble?: BleDevice;
  /** Classic 장치 정보 */
  classic?: ClassicDevice;
}

// ============================================================================
// BLE GATT Types
// ============================================================================

/**
 * BLE 서비스
 */
export interface BleService {
  /** 서비스 UUID */
  uuid: string;
  /** 기본 서비스 여부 */
  isPrimary: boolean;
  /** 특성 목록 */
  characteristics?: BleCharacteristic[];
}

/**
 * BLE 특성
 */
export interface BleCharacteristic {
  /** 특성 UUID */
  uuid: string;
  /** 서비스 UUID */
  serviceUuid: string;
  /** 속성 */
  properties: CharacteristicProperties;
  /** 현재 값 (Base64) */
  value?: string;
  /** 디스크립터 목록 */
  descriptors?: BleDescriptor[];
}

/**
 * BLE 특성 속성
 */
export interface CharacteristicProperties {
  broadcast: boolean;
  read: boolean;
  writeWithoutResponse: boolean;
  write: boolean;
  notify: boolean;
  indicate: boolean;
  authenticatedSignedWrites: boolean;
  extendedProperties: boolean;
}

/**
 * BLE 디스크립터
 */
export interface BleDescriptor {
  /** 디스크립터 UUID */
  uuid: string;
  /** 특성 UUID */
  characteristicUuid: string;
  /** 현재 값 (Base64) */
  value?: string;
}

// ============================================================================
// Connection Types
// ============================================================================

/**
 * 연결 상태
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

/**
 * 연결 옵션
 */
export interface ConnectionOptions {
  /** 연결 타임아웃 (ms) */
  timeout?: number;
  /** 자동 재연결 여부 (BLE) */
  autoConnect?: boolean;
  /** MTU 크기 요청 (BLE, Android) */
  requestMtu?: number;
  /** 연결 우선순위 (BLE, Android) */
  connectionPriority?: 'balanced' | 'high' | 'lowPower';
}

/**
 * Classic Bluetooth 연결 옵션
 */
export interface ClassicConnectionOptions extends ConnectionOptions {
  /** SPP UUID (기본값: 00001101-0000-1000-8000-00805F9B34FB) */
  uuid?: string;
  /** 보안 연결 사용 여부 */
  secure?: boolean;
}

/**
 * 연결 정보
 */
export interface ConnectionInfo {
  /** 장치 ID */
  deviceId: string;
  /** 연결 상태 */
  state: ConnectionState;
  /** 장치 타입 */
  type: BluetoothDeviceType;
  /** MTU 크기 (BLE) */
  mtu?: number;
  /** 연결 시간 */
  connectedAt?: number;
}

// ============================================================================
// Scan Types
// ============================================================================

/**
 * 스캔 모드
 */
export type ScanMode = 'lowPower' | 'balanced' | 'lowLatency';

/**
 * BLE 스캔 옵션
 */
export interface BleScanOptions {
  /** 스캔 타임아웃 (ms, 0 = 무제한) */
  timeout?: number;
  /** 스캔 모드 */
  scanMode?: ScanMode;
  /** 필터링할 서비스 UUID 목록 */
  serviceUUIDs?: string[];
  /** 중복 장치 허용 여부 */
  allowDuplicates?: boolean;
  /** 이름 필터 (부분 일치) */
  nameFilter?: string;
  /** RSSI 임계값 (이 값보다 강한 신호만) */
  rssiThreshold?: number;
}

/**
 * Classic Bluetooth 스캔 옵션
 */
export interface ClassicScanOptions {
  /** 스캔 타임아웃 (ms, 기본 12000) */
  timeout?: number;
  /** 이름 필터 (부분 일치) */
  nameFilter?: string;
}

// ============================================================================
// Data Transfer Types
// ============================================================================

/**
 * 데이터 쓰기 옵션
 */
export interface WriteOptions {
  /** 응답 대기 여부 (BLE write with/without response) */
  withResponse?: boolean;
}

/**
 * 데이터 읽기 결과
 */
export interface ReadResult {
  /** 장치 ID */
  deviceId: string;
  /** 특성 UUID (BLE) */
  characteristicUuid?: string;
  /** 서비스 UUID (BLE) */
  serviceUuid?: string;
  /** 데이터 (Base64) */
  value: string;
  /** 타임스탬프 */
  timestamp: number;
}

/**
 * 알림/표시 이벤트
 */
export interface NotificationEvent {
  /** 장치 ID */
  deviceId: string;
  /** 서비스 UUID */
  serviceUuid: string;
  /** 특성 UUID */
  characteristicUuid: string;
  /** 데이터 (Base64) */
  value: string;
  /** 타임스탬프 */
  timestamp: number;
}

// ============================================================================
// Permission Types
// ============================================================================

/**
 * Bluetooth 권한 상태
 */
export interface BluetoothPermissionStatus {
  /** Bluetooth 사용 가능 여부 */
  isAvailable: boolean;
  /** Bluetooth 활성화 상태 */
  isEnabled: boolean;
  /** 스캔 권한 */
  scanPermission: 'granted' | 'denied' | 'undetermined';
  /** 연결 권한 */
  connectPermission: 'granted' | 'denied' | 'undetermined';
  /** 위치 권한 (Android, BLE 스캔에 필요) */
  locationPermission?: 'granted' | 'denied' | 'undetermined';
  /** 필요한 권한 목록 */
  requiredPermissions: string[];
  /** 거부된 권한 목록 */
  deniedPermissions: string[];
}

/**
 * Bluetooth 상태
 */
export type BluetoothState = 'unknown' | 'resetting' | 'unsupported' | 'unauthorized' | 'poweredOff' | 'poweredOn';

// ============================================================================
// Event Types
// ============================================================================

/**
 * Bluetooth 이벤트 타입
 */
export type BluetoothEventType =
  | 'stateChange'
  | 'deviceDiscovered'
  | 'scanStarted'
  | 'scanStopped'
  | 'connected'
  | 'disconnected'
  | 'connectionFailed'
  | 'servicesDiscovered'
  | 'characteristicRead'
  | 'characteristicWritten'
  | 'notification'
  | 'mtuChanged'
  | 'bondStateChanged'
  | 'error';

/**
 * Bluetooth 이벤트
 */
export interface BluetoothEvent {
  /** 이벤트 타입 */
  type: BluetoothEventType;
  /** 장치 ID */
  deviceId?: string;
  /** 이벤트 데이터 */
  data?: {
    /** Bluetooth 상태 */
    state?: BluetoothState;
    /** 발견된 장치 */
    device?: BluetoothDevice;
    /** 서비스 목록 */
    services?: BleService[];
    /** 읽기/쓰기 결과 */
    result?: ReadResult;
    /** 알림 데이터 */
    notification?: NotificationEvent;
    /** MTU 크기 */
    mtu?: number;
    /** 본딩 상태 */
    bondState?: 'none' | 'bonding' | 'bonded';
    /** 에러 메시지 */
    error?: string;
    /** 에러 코드 */
    errorCode?: string;
    /** 추가 데이터 */
    [key: string]: unknown;
  };
  /** 타임스탬프 */
  timestamp: number;
}

/**
 * 이벤트 콜백 타입
 */
export type BluetoothEventCallback = (event: BluetoothEvent) => void | Promise<void>;

// ============================================================================
// Error Types
// ============================================================================

/**
 * Bluetooth 에러 타입
 */
export type BluetoothError =
  | 'BLUETOOTH_UNAVAILABLE'
  | 'BLUETOOTH_DISABLED'
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_NOT_CONNECTED'
  | 'ALREADY_CONNECTED'
  | 'CONNECTION_FAILED'
  | 'CONNECTION_TIMEOUT'
  | 'SERVICE_NOT_FOUND'
  | 'CHARACTERISTIC_NOT_FOUND'
  | 'DESCRIPTOR_NOT_FOUND'
  | 'OPERATION_FAILED'
  | 'OPERATION_NOT_SUPPORTED'
  | 'WRITE_FAILED'
  | 'READ_FAILED'
  | 'NOTIFICATION_FAILED'
  | 'SCAN_FAILED'
  | 'BONDING_FAILED'
  | 'INVALID_INPUT'
  | 'UNKNOWN';

// ============================================================================
// Result Types
// ============================================================================

/**
 * 기본 결과 타입
 */
export interface BluetoothResult {
  success: boolean;
  error?: BluetoothError;
  message?: string;
}

/**
 * 스캔 시작 결과
 */
export interface ScanStartResult extends BluetoothResult {
  /** 스캔 세션 ID */
  scanId?: string;
}

/**
 * 연결 결과
 */
export interface ConnectResult extends BluetoothResult {
  /** 연결 정보 */
  connection?: ConnectionInfo;
}

/**
 * 서비스 발견 결과
 */
export interface DiscoverServicesResult extends BluetoothResult {
  /** 발견된 서비스 목록 */
  services?: BleService[];
}

/**
 * MTU 변경 결과
 */
export interface MtuResult extends BluetoothResult {
  /** 협상된 MTU 크기 */
  mtu?: number;
}

/**
 * 장치 목록 결과
 */
export interface DevicesResult extends BluetoothResult {
  /** 장치 목록 */
  devices?: BluetoothDevice[];
}

/**
 * 연결 장치 목록 결과
 */
export interface ConnectedDevicesResult extends BluetoothResult {
  /** 연결된 장치 정보 목록 */
  connections?: ConnectionInfo[];
}

/**
 * 본딩된 장치 목록 결과
 */
export interface BondedDevicesResult extends BluetoothResult {
  /** 본딩된 장치 목록 */
  devices?: ClassicDevice[];
}
