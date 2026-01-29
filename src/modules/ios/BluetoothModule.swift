import ExpoModulesCore
import CoreBluetooth

public class BluetoothModule: Module {
    private var centralManager: CBCentralManager?
    private var centralDelegate: CentralManagerDelegate?

    // Connected peripherals
    private var connectedPeripherals: [String: CBPeripheral] = [:]
    private var peripheralDelegates: [String: PeripheralDelegate] = [:]

    // Discovered services cache
    private var discoveredServices: [String: [CBService]] = [:]

    // Scanning state
    private var isScanning = false
    private var scanTimer: Timer?

    public func definition() -> ModuleDefinition {
        Name("CustomBluetooth")

        Events("onBluetoothEvent")

        OnCreate {
            centralDelegate = CentralManagerDelegate(module: self)
            centralManager = CBCentralManager(delegate: centralDelegate, queue: nil)
        }

        OnDestroy {
            stopScanInternal()
            disconnectAllInternal()
            centralManager = nil
            centralDelegate = nil
        }

        // ============================================================================
        // State & Permission Functions
        // ============================================================================

        AsyncFunction("getBluetoothState") { () -> String in
            return self.getBluetoothStateInternal()
        }

        AsyncFunction("checkPermissions") { () -> [String: Any] in
            return self.checkPermissionsInternal()
        }

        AsyncFunction("requestPermissions") { (promise: Promise) in
            // iOS handles permissions automatically when using Bluetooth
            promise.resolve(self.checkPermissionsInternal())
        }

        AsyncFunction("requestEnableBluetooth") { (promise: Promise) in
            // iOS doesn't allow programmatic Bluetooth enable
            if self.centralManager?.state == .poweredOn {
                promise.resolve(["success": true])
            } else {
                promise.resolve([
                    "success": false,
                    "error": "BLUETOOTH_DISABLED",
                    "message": "Please enable Bluetooth in Settings"
                ])
            }
        }

        // ============================================================================
        // BLE Scan Functions
        // ============================================================================

        AsyncFunction("startBleScan") { (options: [String: Any]) -> [String: Any] in
            return self.startBleScanInternal(options: options)
        }

        AsyncFunction("stopBleScan") { () -> [String: Any] in
            return self.stopScanInternal()
        }

        AsyncFunction("isScanning") { () -> Bool in
            return self.isScanning
        }

        // ============================================================================
        // Classic Bluetooth (Not supported on iOS)
        // ============================================================================

        AsyncFunction("startClassicScan") { (options: [String: Any]) -> [String: Any] in
            return [
                "success": false,
                "error": "OPERATION_NOT_SUPPORTED",
                "message": "Classic Bluetooth is not supported on iOS"
            ]
        }

        AsyncFunction("stopClassicScan") { () -> [String: Any] in
            return [
                "success": false,
                "error": "OPERATION_NOT_SUPPORTED"
            ]
        }

        AsyncFunction("getBondedDevices") { () -> [String: Any] in
            return [
                "success": false,
                "error": "OPERATION_NOT_SUPPORTED",
                "message": "Classic Bluetooth is not supported on iOS"
            ]
        }

        // ============================================================================
        // Connection Functions
        // ============================================================================

        AsyncFunction("connectBle") { (deviceId: String, options: [String: Any]) -> [String: Any] in
            return self.connectBleInternal(deviceId: deviceId, options: options)
        }

        AsyncFunction("connectClassic") { (address: String, options: [String: Any]) -> [String: Any] in
            return [
                "success": false,
                "error": "OPERATION_NOT_SUPPORTED",
                "message": "Classic Bluetooth is not supported on iOS"
            ]
        }

        AsyncFunction("disconnect") { (deviceId: String) -> [String: Any] in
            return self.disconnectInternal(deviceId: deviceId)
        }

        AsyncFunction("disconnectAll") { () -> [String: Any] in
            return self.disconnectAllInternal()
        }

        AsyncFunction("isConnected") { (deviceId: String) -> Bool in
            return self.connectedPeripherals[deviceId] != nil
        }

        AsyncFunction("getConnectedDevices") { () -> [String: Any] in
            return self.getConnectedDevicesInternal()
        }

        // ============================================================================
        // BLE GATT Functions
        // ============================================================================

        AsyncFunction("discoverServices") { (deviceId: String) -> [String: Any] in
            return self.discoverServicesInternal(deviceId: deviceId)
        }

        AsyncFunction("readCharacteristic") { (deviceId: String, serviceUuid: String, characteristicUuid: String) -> [String: Any] in
            return self.readCharacteristicInternal(deviceId: deviceId, serviceUuid: serviceUuid, characteristicUuid: characteristicUuid)
        }

        AsyncFunction("writeCharacteristic") { (deviceId: String, serviceUuid: String, characteristicUuid: String, value: String, options: [String: Any]) -> [String: Any] in
            return self.writeCharacteristicInternal(deviceId: deviceId, serviceUuid: serviceUuid, characteristicUuid: characteristicUuid, value: value, options: options)
        }

        AsyncFunction("setNotification") { (deviceId: String, serviceUuid: String, characteristicUuid: String, enable: Bool) -> [String: Any] in
            return self.setNotificationInternal(deviceId: deviceId, serviceUuid: serviceUuid, characteristicUuid: characteristicUuid, enable: enable)
        }

        AsyncFunction("requestMtu") { (deviceId: String, mtu: Int) -> [String: Any] in
            // iOS automatically negotiates MTU
            if let peripheral = self.connectedPeripherals[deviceId] {
                let currentMtu = peripheral.maximumWriteValueLength(for: .withoutResponse) + 3
                return ["success": true, "mtu": currentMtu]
            }
            return ["success": false, "error": "DEVICE_NOT_CONNECTED"]
        }

        // ============================================================================
        // Classic Bluetooth Data (Not supported)
        // ============================================================================

        AsyncFunction("writeClassic") { (deviceId: String, value: String) -> [String: Any] in
            return [
                "success": false,
                "error": "OPERATION_NOT_SUPPORTED"
            ]
        }

        // ============================================================================
        // Bonding (Not supported on iOS)
        // ============================================================================

        AsyncFunction("createBond") { (deviceId: String) -> [String: Any] in
            return [
                "success": false,
                "error": "OPERATION_NOT_SUPPORTED",
                "message": "Manual bonding is not supported on iOS"
            ]
        }

        AsyncFunction("removeBond") { (deviceId: String) -> [String: Any] in
            return [
                "success": false,
                "error": "OPERATION_NOT_SUPPORTED",
                "message": "Manual bonding removal is not supported on iOS"
            ]
        }
    }

    // ============================================================================
    // Internal Implementations
    // ============================================================================

    private func getBluetoothStateInternal() -> String {
        guard let manager = centralManager else {
            return "unknown"
        }

        switch manager.state {
        case .unknown:
            return "unknown"
        case .resetting:
            return "resetting"
        case .unsupported:
            return "unsupported"
        case .unauthorized:
            return "unauthorized"
        case .poweredOff:
            return "poweredOff"
        case .poweredOn:
            return "poweredOn"
        @unknown default:
            return "unknown"
        }
    }

    private func checkPermissionsInternal() -> [String: Any] {
        let state = centralManager?.state ?? .unknown

        let isAvailable = state != .unsupported
        let isEnabled = state == .poweredOn

        var scanPermission = "undetermined"
        var connectPermission = "undetermined"
        var deniedPermissions: [String] = []

        if #available(iOS 13.1, *) {
            switch CBCentralManager.authorization {
            case .allowedAlways:
                scanPermission = "granted"
                connectPermission = "granted"
            case .denied, .restricted:
                scanPermission = "denied"
                connectPermission = "denied"
                deniedPermissions.append("bluetooth")
            case .notDetermined:
                scanPermission = "undetermined"
                connectPermission = "undetermined"
            @unknown default:
                scanPermission = "undetermined"
                connectPermission = "undetermined"
            }
        } else {
            // iOS < 13.1
            if state == .unauthorized {
                scanPermission = "denied"
                connectPermission = "denied"
                deniedPermissions.append("bluetooth")
            } else if state == .poweredOn {
                scanPermission = "granted"
                connectPermission = "granted"
            }
        }

        return [
            "isAvailable": isAvailable,
            "isEnabled": isEnabled,
            "scanPermission": scanPermission,
            "connectPermission": connectPermission,
            "requiredPermissions": ["bluetooth"],
            "deniedPermissions": deniedPermissions
        ]
    }

    // ============================================================================
    // BLE Scan
    // ============================================================================

    private func startBleScanInternal(options: [String: Any]) -> [String: Any] {
        guard let manager = centralManager, manager.state == .poweredOn else {
            return ["success": false, "error": "BLUETOOTH_UNAVAILABLE"]
        }

        if isScanning {
            stopScanInternal()
        }

        var serviceUUIDs: [CBUUID]? = nil
        if let uuidStrings = options["serviceUUIDs"] as? [String] {
            serviceUUIDs = uuidStrings.compactMap { CBUUID(string: $0) }
            if serviceUUIDs?.isEmpty == true {
                serviceUUIDs = nil
            }
        }

        let allowDuplicates = options["allowDuplicates"] as? Bool ?? false

        var scanOptions: [String: Any] = [
            CBCentralManagerScanOptionAllowDuplicatesKey: allowDuplicates
        ]

        manager.scanForPeripherals(withServices: serviceUUIDs, options: scanOptions)
        isScanning = true

        // Set timeout if specified
        if let timeout = options["timeout"] as? Int, timeout > 0 {
            scanTimer?.invalidate()
            scanTimer = Timer.scheduledTimer(withTimeInterval: Double(timeout) / 1000.0, repeats: false) { [weak self] _ in
                self?.stopScanInternal()
            }
        }

        sendEvent("onBluetoothEvent", [
            "type": "scanStarted",
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])

        return ["success": true]
    }

    @discardableResult
    private func stopScanInternal() -> [String: Any] {
        scanTimer?.invalidate()
        scanTimer = nil

        if isScanning {
            centralManager?.stopScan()
            isScanning = false

            sendEvent("onBluetoothEvent", [
                "type": "scanStopped",
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
        }

        return ["success": true]
    }

    // ============================================================================
    // Connection
    // ============================================================================

    private func connectBleInternal(deviceId: String, options: [String: Any]) -> [String: Any] {
        guard let manager = centralManager, manager.state == .poweredOn else {
            return ["success": false, "error": "BLUETOOTH_UNAVAILABLE"]
        }

        if connectedPeripherals[deviceId] != nil {
            return ["success": false, "error": "ALREADY_CONNECTED"]
        }

        // Get peripheral from discovered devices
        guard let peripheral = centralDelegate?.discoveredPeripherals[deviceId] else {
            return ["success": false, "error": "DEVICE_NOT_FOUND"]
        }

        let delegate = PeripheralDelegate(module: self, deviceId: deviceId)
        peripheral.delegate = delegate
        peripheralDelegates[deviceId] = delegate

        manager.connect(peripheral, options: nil)

        return [
            "success": true,
            "connection": [
                "deviceId": deviceId,
                "state": "connecting",
                "type": "ble"
            ]
        ]
    }

    private func disconnectInternal(deviceId: String) -> [String: Any] {
        guard let peripheral = connectedPeripherals[deviceId] else {
            return ["success": false, "error": "DEVICE_NOT_CONNECTED"]
        }

        centralManager?.cancelPeripheralConnection(peripheral)
        return ["success": true]
    }

    @discardableResult
    private func disconnectAllInternal() -> [String: Any] {
        for (_, peripheral) in connectedPeripherals {
            centralManager?.cancelPeripheralConnection(peripheral)
        }
        connectedPeripherals.removeAll()
        peripheralDelegates.removeAll()
        discoveredServices.removeAll()

        return ["success": true]
    }

    private func getConnectedDevicesInternal() -> [String: Any] {
        let connections = connectedPeripherals.map { (deviceId, peripheral) -> [String: Any] in
            return [
                "deviceId": deviceId,
                "state": peripheral.state == .connected ? "connected" : "disconnected",
                "type": "ble"
            ]
        }

        return ["success": true, "connections": connections]
    }

    // ============================================================================
    // GATT Operations
    // ============================================================================

    private func discoverServicesInternal(deviceId: String) -> [String: Any] {
        guard let peripheral = connectedPeripherals[deviceId] else {
            return ["success": false, "error": "DEVICE_NOT_CONNECTED"]
        }

        peripheral.discoverServices(nil)
        return ["success": true]
    }

    private func findCharacteristic(deviceId: String, serviceUuid: String, characteristicUuid: String) -> (CBPeripheral, CBCharacteristic)? {
        guard let peripheral = connectedPeripherals[deviceId] else {
            return nil
        }

        let serviceUUID = CBUUID(string: serviceUuid)
        let charUUID = CBUUID(string: characteristicUuid)

        guard let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }),
              let characteristic = service.characteristics?.first(where: { $0.uuid == charUUID }) else {
            return nil
        }

        return (peripheral, characteristic)
    }

    private func readCharacteristicInternal(deviceId: String, serviceUuid: String, characteristicUuid: String) -> [String: Any] {
        guard let (peripheral, characteristic) = findCharacteristic(deviceId: deviceId, serviceUuid: serviceUuid, characteristicUuid: characteristicUuid) else {
            if connectedPeripherals[deviceId] == nil {
                return ["success": false, "error": "DEVICE_NOT_CONNECTED"]
            }
            return ["success": false, "error": "CHARACTERISTIC_NOT_FOUND"]
        }

        peripheral.readValue(for: characteristic)
        return ["success": true]
    }

    private func writeCharacteristicInternal(deviceId: String, serviceUuid: String, characteristicUuid: String, value: String, options: [String: Any]) -> [String: Any] {
        guard let (peripheral, characteristic) = findCharacteristic(deviceId: deviceId, serviceUuid: serviceUuid, characteristicUuid: characteristicUuid) else {
            if connectedPeripherals[deviceId] == nil {
                return ["success": false, "error": "DEVICE_NOT_CONNECTED"]
            }
            return ["success": false, "error": "CHARACTERISTIC_NOT_FOUND"]
        }

        guard let data = Data(base64Encoded: value) else {
            return ["success": false, "error": "INVALID_INPUT", "message": "Invalid Base64 value"]
        }

        let withResponse = options["withResponse"] as? Bool ?? true
        let writeType: CBCharacteristicWriteType = withResponse ? .withResponse : .withoutResponse

        peripheral.writeValue(data, for: characteristic, type: writeType)
        return ["success": true]
    }

    private func setNotificationInternal(deviceId: String, serviceUuid: String, characteristicUuid: String, enable: Bool) -> [String: Any] {
        guard let (peripheral, characteristic) = findCharacteristic(deviceId: deviceId, serviceUuid: serviceUuid, characteristicUuid: characteristicUuid) else {
            if connectedPeripherals[deviceId] == nil {
                return ["success": false, "error": "DEVICE_NOT_CONNECTED"]
            }
            return ["success": false, "error": "CHARACTERISTIC_NOT_FOUND"]
        }

        peripheral.setNotifyValue(enable, for: characteristic)
        return ["success": true]
    }

    // ============================================================================
    // Event Helpers
    // ============================================================================

    func onPeripheralDiscovered(peripheral: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
        let deviceId = peripheral.identifier.uuidString

        var serviceUUIDs: [String] = []
        if let uuids = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] {
            serviceUUIDs = uuids.map { $0.uuidString }
        }

        var advertisementDataBase64 = ""
        if let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
            advertisementDataBase64 = manufacturerData.base64EncodedString()
        }

        let isConnectable = advertisementData[CBAdvertisementDataIsConnectable] as? Bool ?? true
        let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let txPowerLevel = advertisementData[CBAdvertisementDataTxPowerLevelKey] as? Int

        let deviceMap: [String: Any] = [
            "id": deviceId,
            "name": peripheral.name ?? deviceId,
            "type": "ble",
            "rssi": rssi.intValue,
            "ble": [
                "id": deviceId,
                "name": peripheral.name as Any,
                "rssi": rssi.intValue,
                "advertisementData": advertisementDataBase64,
                "serviceUUIDs": serviceUUIDs,
                "isConnectable": isConnectable,
                "localName": localName as Any,
                "txPowerLevel": txPowerLevel as Any
            ]
        ]

        sendEvent("onBluetoothEvent", [
            "type": "deviceDiscovered",
            "deviceId": deviceId,
            "data": ["device": deviceMap],
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }

    func onPeripheralConnected(peripheral: CBPeripheral) {
        let deviceId = peripheral.identifier.uuidString
        connectedPeripherals[deviceId] = peripheral

        sendEvent("onBluetoothEvent", [
            "type": "connected",
            "deviceId": deviceId,
            "data": ["state": "connected"],
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }

    func onPeripheralDisconnected(peripheral: CBPeripheral, error: Error?) {
        let deviceId = peripheral.identifier.uuidString
        connectedPeripherals.removeValue(forKey: deviceId)
        peripheralDelegates.removeValue(forKey: deviceId)
        discoveredServices.removeValue(forKey: deviceId)

        sendEvent("onBluetoothEvent", [
            "type": "disconnected",
            "deviceId": deviceId,
            "data": error != nil ? ["error": error!.localizedDescription] : [:],
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }

    func onConnectionFailed(peripheral: CBPeripheral, error: Error?) {
        let deviceId = peripheral.identifier.uuidString
        peripheralDelegates.removeValue(forKey: deviceId)

        sendEvent("onBluetoothEvent", [
            "type": "connectionFailed",
            "deviceId": deviceId,
            "data": ["error": error?.localizedDescription ?? "Connection failed"],
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }

    func onServicesDiscovered(peripheral: CBPeripheral) {
        let deviceId = peripheral.identifier.uuidString

        // Discover characteristics for each service
        peripheral.services?.forEach { service in
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    func onCharacteristicsDiscovered(peripheral: CBPeripheral, service: CBService) {
        let deviceId = peripheral.identifier.uuidString

        // Check if all services have characteristics discovered
        let allDiscovered = peripheral.services?.allSatisfy { $0.characteristics != nil } ?? false

        if allDiscovered {
            let services = peripheral.services?.map { service -> [String: Any] in
                let characteristics = service.characteristics?.map { char -> [String: Any] in
                    return [
                        "uuid": char.uuid.uuidString,
                        "serviceUuid": service.uuid.uuidString,
                        "properties": [
                            "broadcast": char.properties.contains(.broadcast),
                            "read": char.properties.contains(.read),
                            "writeWithoutResponse": char.properties.contains(.writeWithoutResponse),
                            "write": char.properties.contains(.write),
                            "notify": char.properties.contains(.notify),
                            "indicate": char.properties.contains(.indicate),
                            "authenticatedSignedWrites": char.properties.contains(.authenticatedSignedWrites),
                            "extendedProperties": char.properties.contains(.extendedProperties)
                        ]
                    ]
                } ?? []

                return [
                    "uuid": service.uuid.uuidString,
                    "isPrimary": service.isPrimary,
                    "characteristics": characteristics
                ]
            } ?? []

            sendEvent("onBluetoothEvent", [
                "type": "servicesDiscovered",
                "deviceId": deviceId,
                "data": ["services": services],
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
        }
    }

    func onCharacteristicRead(peripheral: CBPeripheral, characteristic: CBCharacteristic, error: Error?) {
        let deviceId = peripheral.identifier.uuidString

        if let error = error {
            sendEvent("onBluetoothEvent", [
                "type": "error",
                "deviceId": deviceId,
                "data": ["error": error.localizedDescription, "errorCode": "READ_FAILED"],
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
            return
        }

        let value = characteristic.value?.base64EncodedString() ?? ""

        sendEvent("onBluetoothEvent", [
            "type": "characteristicRead",
            "deviceId": deviceId,
            "data": [
                "result": [
                    "deviceId": deviceId,
                    "serviceUuid": characteristic.service?.uuid.uuidString ?? "",
                    "characteristicUuid": characteristic.uuid.uuidString,
                    "value": value,
                    "timestamp": Date().timeIntervalSince1970 * 1000
                ]
            ],
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }

    func onCharacteristicWritten(peripheral: CBPeripheral, characteristic: CBCharacteristic, error: Error?) {
        let deviceId = peripheral.identifier.uuidString

        sendEvent("onBluetoothEvent", [
            "type": "characteristicWritten",
            "deviceId": deviceId,
            "data": [
                "serviceUuid": characteristic.service?.uuid.uuidString ?? "",
                "characteristicUuid": characteristic.uuid.uuidString,
                "success": error == nil,
                "error": error?.localizedDescription as Any
            ],
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }

    func onCharacteristicNotification(peripheral: CBPeripheral, characteristic: CBCharacteristic) {
        let deviceId = peripheral.identifier.uuidString
        let value = characteristic.value?.base64EncodedString() ?? ""

        sendEvent("onBluetoothEvent", [
            "type": "notification",
            "deviceId": deviceId,
            "data": [
                "notification": [
                    "deviceId": deviceId,
                    "serviceUuid": characteristic.service?.uuid.uuidString ?? "",
                    "characteristicUuid": characteristic.uuid.uuidString,
                    "value": value,
                    "timestamp": Date().timeIntervalSince1970 * 1000
                ]
            ],
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }

    func onBluetoothStateChanged(state: CBManagerState) {
        let stateString: String
        switch state {
        case .unknown:
            stateString = "unknown"
        case .resetting:
            stateString = "resetting"
        case .unsupported:
            stateString = "unsupported"
        case .unauthorized:
            stateString = "unauthorized"
        case .poweredOff:
            stateString = "poweredOff"
        case .poweredOn:
            stateString = "poweredOn"
        @unknown default:
            stateString = "unknown"
        }

        sendEvent("onBluetoothEvent", [
            "type": "stateChange",
            "data": ["state": stateString],
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }
}

// ============================================================================
// Central Manager Delegate
// ============================================================================

class CentralManagerDelegate: NSObject, CBCentralManagerDelegate {
    weak var module: BluetoothModule?
    var discoveredPeripherals: [String: CBPeripheral] = [:]

    init(module: BluetoothModule) {
        self.module = module
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        module?.onBluetoothStateChanged(state: central.state)
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let deviceId = peripheral.identifier.uuidString
        discoveredPeripherals[deviceId] = peripheral
        module?.onPeripheralDiscovered(peripheral: peripheral, advertisementData: advertisementData, rssi: RSSI)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        module?.onPeripheralConnected(peripheral: peripheral)
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        module?.onPeripheralDisconnected(peripheral: peripheral, error: error)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        module?.onConnectionFailed(peripheral: peripheral, error: error)
    }
}

// ============================================================================
// Peripheral Delegate
// ============================================================================

class PeripheralDelegate: NSObject, CBPeripheralDelegate {
    weak var module: BluetoothModule?
    let deviceId: String

    init(module: BluetoothModule, deviceId: String) {
        self.module = module
        self.deviceId = deviceId
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if error == nil {
            module?.onServicesDiscovered(peripheral: peripheral)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if error == nil {
            module?.onCharacteristicsDiscovered(peripheral: peripheral, service: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if characteristic.isNotifying {
            module?.onCharacteristicNotification(peripheral: peripheral, characteristic: characteristic)
        } else {
            module?.onCharacteristicRead(peripheral: peripheral, characteristic: characteristic, error: error)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        module?.onCharacteristicWritten(peripheral: peripheral, characteristic: characteristic, error: error)
    }
}
