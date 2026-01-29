# RNWW Plugin Bluetooth

React Native WebView Bluetooth 통신 플러그인 (BLE + Classic Bluetooth)

## 설치

```bash
npm install rnww-plugin-bluetooth
```

## 빠른 시작

```typescript
import { registerBluetoothHandlers } from 'rnww-plugin-bluetooth';

registerBluetoothHandlers({
  bridge: yourBridgeImplementation,
  platform: { OS: Platform.OS },
});
```

---

## 플랫폼 지원

| 기능 | Android | iOS |
|------|---------|-----|
| BLE 스캔 | ✅ | ✅ |
| BLE 연결 | ✅ | ✅ |
| GATT 읽기/쓰기 | ✅ | ✅ |
| BLE 알림 | ✅ | ✅ |
| Classic Bluetooth | ✅ | ❌ |
| 페어링 관리 | ✅ | ❌ |
| Bluetooth 활성화 요청 | ✅ | ❌ |
| MTU 요청 | ✅ | 자동 |

---

## Bridge Handlers

### 상태 및 권한

#### getBluetoothState

Bluetooth 상태를 확인합니다.

```typescript
const result = await bridge.call('getBluetoothState');
// result.state: 'poweredOn' | 'poweredOff' | 'unauthorized' | 'unsupported' | 'unknown' | 'resetting'
```

#### checkBluetoothPermissions / requestBluetoothPermissions

권한을 확인하고 요청합니다.

```typescript
const permission = await bridge.call('checkBluetoothPermissions');
// {
//   isAvailable: boolean,
//   isEnabled: boolean,
//   scanPermission: 'granted' | 'denied' | 'undetermined',
//   connectPermission: 'granted' | 'denied' | 'undetermined',
//   requiredPermissions: string[],
//   deniedPermissions: string[]
// }

if (permission.scanPermission !== 'granted') {
  await bridge.call('requestBluetoothPermissions');
}
```

#### requestEnableBluetooth (Android only)

Bluetooth 활성화를 요청합니다.

```typescript
const result = await bridge.call('requestEnableBluetooth');
```

---

### BLE 스캔

#### startBleScan

BLE 장치 스캔을 시작합니다.

```typescript
bridge.call('startBleScan', {
  timeout: 10000,              // 스캔 타임아웃 (ms), 0 = 무제한
  scanMode: 'balanced',        // 'lowPower' | 'balanced' | 'lowLatency'
  serviceUUIDs: ['180D'],      // 필터링할 서비스 UUID (선택)
  allowDuplicates: false,      // 중복 장치 허용 여부
  nameFilter: 'MyDevice',      // 이름 필터 (선택)
  rssiThreshold: -70           // RSSI 임계값 (선택)
});
```

#### stopBleScan

BLE 스캔을 중지합니다.

```typescript
bridge.call('stopBleScan');
```

#### isScanning

스캔 중인지 확인합니다.

```typescript
const result = await bridge.call('isScanning');
// result.isScanning: boolean
```

---

### Classic Bluetooth 스캔 (Android only)

#### startClassicScan

Classic Bluetooth 장치 스캔을 시작합니다.

```typescript
bridge.call('startClassicScan', {
  timeout: 12000,       // 스캔 타임아웃 (ms)
  nameFilter: 'HC-05'   // 이름 필터 (선택)
});
```

#### stopClassicScan

Classic 스캔을 중지합니다.

```typescript
bridge.call('stopClassicScan');
```

#### getBondedDevices

페어링된 장치 목록을 조회합니다.

```typescript
const result = await bridge.call('getBondedDevices');
// result.devices: [{ address, name, bondState }]
```

---

### 연결

#### connectBle

BLE 장치에 연결합니다.

```typescript
bridge.call('connectBle', {
  deviceId: 'AA:BB:CC:DD:EE:FF',
  options: {
    timeout: 10000,           // 연결 타임아웃 (ms)
    autoConnect: false,       // 자동 재연결 여부
    requestMtu: 512,          // MTU 크기 요청 (Android)
    connectionPriority: 'balanced'  // 'balanced' | 'high' | 'lowPower'
  }
});
```

#### connectClassic (Android only)

Classic Bluetooth 장치에 연결합니다.

```typescript
bridge.call('connectClassic', {
  address: 'AA:BB:CC:DD:EE:FF',
  options: {
    uuid: '00001101-0000-1000-8000-00805F9B34FB',  // SPP UUID (기본값)
    secure: true,   // 보안 연결 사용 여부
    timeout: 10000
  }
});
```

#### disconnect

장치 연결을 해제합니다.

```typescript
bridge.call('disconnect', { deviceId: 'AA:BB:CC:DD:EE:FF' });
```

#### disconnectAll

모든 장치 연결을 해제합니다.

```typescript
bridge.call('disconnectAll');
```

#### isConnected

연결 상태를 확인합니다.

```typescript
const result = await bridge.call('isConnected', { deviceId: 'AA:BB:CC:DD:EE:FF' });
// result.isConnected: boolean
```

#### getConnectedDevices

연결된 장치 목록을 조회합니다.

```typescript
const result = await bridge.call('getConnectedDevices');
// result.connections: [{ deviceId, state, type }]
```

---

### BLE GATT 작업

#### discoverServices

서비스를 발견합니다.

```typescript
bridge.call('discoverServices', { deviceId: 'AA:BB:CC:DD:EE:FF' });

// 결과는 onBluetoothEvent 'servicesDiscovered' 이벤트로 수신
```

#### readCharacteristic

특성 값을 읽습니다.

```typescript
bridge.call('readCharacteristic', {
  deviceId: 'AA:BB:CC:DD:EE:FF',
  serviceUuid: '180D',
  characteristicUuid: '2A37'
});

// 결과는 onBluetoothEvent 'characteristicRead' 이벤트로 수신
```

#### writeCharacteristic

특성 값을 씁니다.

```typescript
bridge.call('writeCharacteristic', {
  deviceId: 'AA:BB:CC:DD:EE:FF',
  serviceUuid: '180D',
  characteristicUuid: '2A39',
  value: 'SGVsbG8=',  // Base64 인코딩된 데이터
  options: {
    withResponse: true  // Write with response (기본: true)
  }
});
```

#### setNotification

알림(Notification)을 활성화/비활성화합니다.

```typescript
bridge.call('setNotification', {
  deviceId: 'AA:BB:CC:DD:EE:FF',
  serviceUuid: '180D',
  characteristicUuid: '2A37',
  enable: true
});

// 알림 데이터는 onBluetoothEvent 'notification' 이벤트로 수신
```

#### requestMtu (Android only)

MTU 크기를 요청합니다.

```typescript
bridge.call('requestMtu', {
  deviceId: 'AA:BB:CC:DD:EE:FF',
  mtu: 512  // 23-517
});

// 결과는 onBluetoothEvent 'mtuChanged' 이벤트로 수신
```

---

### Classic Bluetooth 데이터 (Android only)

#### writeClassic

Classic Bluetooth 데이터를 전송합니다.

```typescript
bridge.call('writeClassic', {
  deviceId: 'AA:BB:CC:DD:EE:FF',
  value: 'SGVsbG8='  // Base64 인코딩된 데이터
});
```

수신 데이터는 `onBluetoothEvent`의 `notification` 이벤트로 전달됩니다.

---

### 페어링 (Android only)

#### createBond

장치를 페어링합니다.

```typescript
bridge.call('createBond', { deviceId: 'AA:BB:CC:DD:EE:FF' });
```

#### removeBond

페어링을 해제합니다.

```typescript
bridge.call('removeBond', { deviceId: 'AA:BB:CC:DD:EE:FF' });
```

---

### 리소스 정리

#### disposeBluetoothHandlers

브릿지 핸들러와 리소스를 정리합니다.

```typescript
bridge.call('disposeBluetoothHandlers');
```

---

## 이벤트

### onBluetoothEvent

모든 Bluetooth 이벤트를 수신합니다.

```typescript
bridge.on('onBluetoothEvent', (event) => {
  console.log('Bluetooth Event:', event.type, event);
});
```

### 이벤트 타입

| 타입 | 설명 |
|------|------|
| `stateChange` | Bluetooth 상태 변경 |
| `deviceDiscovered` | 장치 발견 |
| `scanStarted` | 스캔 시작 |
| `scanStopped` | 스캔 중지 |
| `connected` | 연결됨 |
| `disconnected` | 연결 해제됨 |
| `connectionFailed` | 연결 실패 |
| `servicesDiscovered` | 서비스 발견 완료 |
| `characteristicRead` | 특성 읽기 완료 |
| `characteristicWritten` | 특성 쓰기 완료 |
| `notification` | 알림 데이터 수신 |
| `mtuChanged` | MTU 변경됨 |
| `bondStateChanged` | 페어링 상태 변경 |
| `error` | 에러 발생 |

### BluetoothEvent 구조

```typescript
interface BluetoothEvent {
  type: BluetoothEventType;
  deviceId?: string;
  data?: {
    state?: BluetoothState;
    device?: BluetoothDevice;
    services?: BleService[];
    result?: ReadResult;
    notification?: NotificationEvent;
    mtu?: number;
    bondState?: 'none' | 'bonding' | 'bonded';
    error?: string;
    errorCode?: string;
  };
  timestamp: number;
}
```

---

## 타입 정의

### BluetoothDevice

```typescript
interface BluetoothDevice {
  id: string;           // 장치 ID (BLE: UUID, Classic: MAC)
  name: string | null;
  type: 'ble' | 'classic';
  rssi?: number;
  ble?: BleDevice;
  classic?: ClassicDevice;
}
```

### BleDevice

```typescript
interface BleDevice {
  id: string;
  name: string | null;
  rssi: number;
  advertisementData?: string;  // Base64
  serviceUUIDs?: string[];
  isConnectable?: boolean;
  manufacturerData?: {
    companyId: number;
    data: string;  // Base64
  };
  localName?: string;
  txPowerLevel?: number;
}
```

### BleService

```typescript
interface BleService {
  uuid: string;
  isPrimary: boolean;
  characteristics?: BleCharacteristic[];
}
```

### BleCharacteristic

```typescript
interface BleCharacteristic {
  uuid: string;
  serviceUuid: string;
  properties: {
    broadcast: boolean;
    read: boolean;
    writeWithoutResponse: boolean;
    write: boolean;
    notify: boolean;
    indicate: boolean;
    authenticatedSignedWrites: boolean;
    extendedProperties: boolean;
  };
  value?: string;  // Base64
}
```

### BluetoothError

```typescript
type BluetoothError =
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
  | 'OPERATION_FAILED'
  | 'OPERATION_NOT_SUPPORTED'
  | 'WRITE_FAILED'
  | 'READ_FAILED'
  | 'NOTIFICATION_FAILED'
  | 'SCAN_FAILED'
  | 'BONDING_FAILED'
  | 'INVALID_INPUT'
  | 'UNKNOWN';
```

---

## 권한 설정

### Android

`AndroidManifest.xml`에 자동 추가:

```xml
<!-- Android 12+ (API 31+) -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />

<!-- Android 11 이하 -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

<!-- BLE 스캔에 필요 (Android 6-11) -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### iOS

`Info.plist`에 추가:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Bluetooth를 사용하여 장치와 통신합니다.</string>

<key>NSBluetoothPeripheralUsageDescription</key>
<string>Bluetooth를 사용하여 장치와 통신합니다.</string>
```

---

## 예제: Heart Rate Monitor

```typescript
// 권한 확인
const permission = await bridge.call('checkBluetoothPermissions');
if (!permission.isEnabled) {
  await bridge.call('requestEnableBluetooth');
}
if (permission.scanPermission !== 'granted') {
  await bridge.call('requestBluetoothPermissions');
}

// 이벤트 리스너 등록
bridge.on('onBluetoothEvent', (event) => {
  switch (event.type) {
    case 'deviceDiscovered':
      console.log('발견:', event.data?.device?.name);
      // Heart Rate 서비스(180D)를 가진 장치 연결
      if (event.data?.device?.ble?.serviceUUIDs?.includes('180D')) {
        bridge.call('stopBleScan');
        bridge.call('connectBle', {
          deviceId: event.deviceId
        });
      }
      break;

    case 'connected':
      console.log('연결됨:', event.deviceId);
      bridge.call('discoverServices', { deviceId: event.deviceId });
      break;

    case 'servicesDiscovered':
      console.log('서비스 발견:', event.data?.services);
      // Heart Rate Measurement 특성에 알림 활성화
      bridge.call('setNotification', {
        deviceId: event.deviceId,
        serviceUuid: '180D',
        characteristicUuid: '2A37',
        enable: true
      });
      break;

    case 'notification':
      // Heart Rate 데이터 수신
      const value = event.data?.notification?.value;
      if (value) {
        const bytes = atob(value);
        const heartRate = bytes.charCodeAt(1);
        console.log('Heart Rate:', heartRate, 'bpm');
      }
      break;

    case 'disconnected':
      console.log('연결 해제:', event.deviceId);
      break;
  }
});

// BLE 스캔 시작 (Heart Rate 서비스 필터)
bridge.call('startBleScan', {
  serviceUUIDs: ['180D'],
  timeout: 10000
});
```

## 예제: Classic Bluetooth SPP (Android)

```typescript
// 페어링된 장치 확인
const bonded = await bridge.call('getBondedDevices');
const hc05 = bonded.devices?.find(d => d.name?.includes('HC-05'));

if (hc05) {
  // Classic Bluetooth 연결
  bridge.call('connectClassic', {
    address: hc05.address
  });
}

// 이벤트 리스너
bridge.on('onBluetoothEvent', (event) => {
  switch (event.type) {
    case 'connected':
      console.log('SPP 연결됨');
      // 데이터 전송
      const data = btoa('Hello Arduino!');
      bridge.call('writeClassic', {
        deviceId: event.deviceId,
        value: data
      });
      break;

    case 'notification':
      // 데이터 수신
      const received = atob(event.data?.notification?.value || '');
      console.log('수신:', received);
      break;
  }
});
```

---

## 라이선스

MIT
