package expo.modules.custombluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class BluetoothModule : Module() {
    private val TAG = "BluetoothModule"

    // Managers
    private var bluetoothManager: BluetoothManager? = null
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bleScanner: BluetoothLeScanner? = null

    // State
    private var isBleScanActive = false
    private var isClassicScanActive = false
    private val handler = Handler(Looper.getMainLooper())

    // Connections
    private val bleConnections = ConcurrentHashMap<String, BluetoothGatt>()
    private val classicConnections = ConcurrentHashMap<String, BluetoothSocket>()
    private val discoveredServices = ConcurrentHashMap<String, List<BluetoothGattService>>()

    // SPP UUID for Classic Bluetooth
    private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    // CCCD UUID for notifications
    private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    // Coroutine scope
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun definition() = ModuleDefinition {
        Name("CustomBluetooth")

        Events("onBluetoothEvent")

        OnCreate {
            bluetoothManager = appContext.reactContext?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            bluetoothAdapter = bluetoothManager?.adapter
            bleScanner = bluetoothAdapter?.bluetoothLeScanner
            registerBluetoothStateReceiver()
        }

        OnDestroy {
            scope.cancel()
            unregisterBluetoothStateReceiver()
            disconnectAllInternal()
        }

        // ============================================================================
        // State & Permission Functions
        // ============================================================================

        AsyncFunction("getBluetoothState") {
            getBluetoothStateInternal()
        }

        AsyncFunction("checkPermissions") {
            checkPermissionsInternal()
        }

        AsyncFunction("requestPermissions") { promise: Promise ->
            requestPermissionsInternal(promise)
        }

        AsyncFunction("requestEnableBluetooth") { promise: Promise ->
            requestEnableBluetoothInternal(promise)
        }

        // ============================================================================
        // BLE Scan Functions
        // ============================================================================

        AsyncFunction("startBleScan") { options: Map<String, Any?> ->
            startBleScanInternal(options)
        }

        AsyncFunction("stopBleScan") {
            stopBleScanInternal()
        }

        AsyncFunction("isScanning") {
            isBleScanActive || isClassicScanActive
        }

        // ============================================================================
        // Classic Scan Functions
        // ============================================================================

        AsyncFunction("startClassicScan") { options: Map<String, Any?> ->
            startClassicScanInternal(options)
        }

        AsyncFunction("stopClassicScan") {
            stopClassicScanInternal()
        }

        AsyncFunction("getBondedDevices") {
            getBondedDevicesInternal()
        }

        // ============================================================================
        // Connection Functions
        // ============================================================================

        AsyncFunction("connectBle") { deviceId: String, options: Map<String, Any?> ->
            connectBleInternal(deviceId, options)
        }

        AsyncFunction("connectClassic") { address: String, options: Map<String, Any?> ->
            connectClassicInternal(address, options)
        }

        AsyncFunction("disconnect") { deviceId: String ->
            disconnectInternal(deviceId)
        }

        AsyncFunction("disconnectAll") {
            disconnectAllInternal()
        }

        AsyncFunction("isConnected") { deviceId: String ->
            isConnectedInternal(deviceId)
        }

        AsyncFunction("getConnectedDevices") {
            getConnectedDevicesInternal()
        }

        // ============================================================================
        // BLE GATT Functions
        // ============================================================================

        AsyncFunction("discoverServices") { deviceId: String ->
            discoverServicesInternal(deviceId)
        }

        AsyncFunction("readCharacteristic") { deviceId: String, serviceUuid: String, characteristicUuid: String ->
            readCharacteristicInternal(deviceId, serviceUuid, characteristicUuid)
        }

        AsyncFunction("writeCharacteristic") { deviceId: String, serviceUuid: String, characteristicUuid: String, value: String, options: Map<String, Any?> ->
            writeCharacteristicInternal(deviceId, serviceUuid, characteristicUuid, value, options)
        }

        AsyncFunction("setNotification") { deviceId: String, serviceUuid: String, characteristicUuid: String, enable: Boolean ->
            setNotificationInternal(deviceId, serviceUuid, characteristicUuid, enable)
        }

        AsyncFunction("requestMtu") { deviceId: String, mtu: Int ->
            requestMtuInternal(deviceId, mtu)
        }

        // ============================================================================
        // Classic Bluetooth Data Functions
        // ============================================================================

        AsyncFunction("writeClassic") { deviceId: String, value: String ->
            writeClassicInternal(deviceId, value)
        }

        // ============================================================================
        // Bonding Functions
        // ============================================================================

        AsyncFunction("createBond") { deviceId: String ->
            createBondInternal(deviceId)
        }

        AsyncFunction("removeBond") { deviceId: String ->
            removeBondInternal(deviceId)
        }
    }

    // ============================================================================
    // Internal Implementations
    // ============================================================================

    private fun getBluetoothStateInternal(): String {
        if (bluetoothAdapter == null) {
            return "unsupported"
        }
        return when {
            !bluetoothAdapter!!.isEnabled -> "poweredOff"
            else -> "poweredOn"
        }
    }

    private fun checkPermissionsInternal(): Map<String, Any> {
        val context = appContext.reactContext ?: return mapOf(
            "isAvailable" to false,
            "isEnabled" to false,
            "scanPermission" to "denied",
            "connectPermission" to "denied",
            "requiredPermissions" to emptyList<String>(),
            "deniedPermissions" to emptyList<String>()
        )

        val isAvailable = bluetoothAdapter != null
        val isEnabled = bluetoothAdapter?.isEnabled == true

        val requiredPermissions = mutableListOf<String>()
        val deniedPermissions = mutableListOf<String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requiredPermissions.add(Manifest.permission.BLUETOOTH_SCAN)
            requiredPermissions.add(Manifest.permission.BLUETOOTH_CONNECT)
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                deniedPermissions.add(Manifest.permission.BLUETOOTH_SCAN)
            }
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                deniedPermissions.add(Manifest.permission.BLUETOOTH_CONNECT)
            }
        } else {
            requiredPermissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                deniedPermissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }

        val scanPermission = if (deniedPermissions.isEmpty()) "granted" else "denied"
        val connectPermission = scanPermission

        return mapOf(
            "isAvailable" to isAvailable,
            "isEnabled" to isEnabled,
            "scanPermission" to scanPermission,
            "connectPermission" to connectPermission,
            "requiredPermissions" to requiredPermissions,
            "deniedPermissions" to deniedPermissions
        )
    }

    private fun requestPermissionsInternal(promise: Promise) {
        val activity = appContext.currentActivity
        if (activity == null) {
            promise.resolve(checkPermissionsInternal())
            return
        }

        val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        ActivityCompat.requestPermissions(activity, permissions, 1001)

        // Return current status (actual result would come through onRequestPermissionsResult)
        promise.resolve(checkPermissionsInternal())
    }

    private fun requestEnableBluetoothInternal(promise: Promise) {
        if (bluetoothAdapter == null) {
            promise.resolve(mapOf("success" to false, "error" to "BLUETOOTH_UNAVAILABLE"))
            return
        }

        if (bluetoothAdapter!!.isEnabled) {
            promise.resolve(mapOf("success" to true))
            return
        }

        val activity = appContext.currentActivity
        if (activity == null) {
            promise.resolve(mapOf("success" to false, "error" to "NO_ACTIVITY"))
            return
        }

        val intent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
        activity.startActivityForResult(intent, 1002)
        promise.resolve(mapOf("success" to true))
    }

    // ============================================================================
    // BLE Scan
    // ============================================================================

    private val bleScanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            val deviceMap = mapOf(
                "id" to device.address,
                "name" to (device.name ?: device.address),
                "type" to "ble",
                "rssi" to result.rssi,
                "ble" to mapOf(
                    "id" to device.address,
                    "name" to device.name,
                    "rssi" to result.rssi,
                    "advertisementData" to (result.scanRecord?.bytes?.let { Base64.encodeToString(it, Base64.NO_WRAP) } ?: ""),
                    "serviceUUIDs" to (result.scanRecord?.serviceUuids?.map { it.uuid.toString() } ?: emptyList<String>()),
                    "isConnectable" to (result.isConnectable ?: true),
                    "txPowerLevel" to (result.scanRecord?.txPowerLevel ?: 0)
                )
            )

            sendEvent("onBluetoothEvent", mapOf(
                "type" to "deviceDiscovered",
                "deviceId" to device.address,
                "data" to mapOf("device" to deviceMap),
                "timestamp" to System.currentTimeMillis()
            ))
        }

        override fun onScanFailed(errorCode: Int) {
            isBleScanActive = false
            sendEvent("onBluetoothEvent", mapOf(
                "type" to "error",
                "data" to mapOf(
                    "error" to "BLE scan failed",
                    "errorCode" to "SCAN_ERROR_$errorCode"
                ),
                "timestamp" to System.currentTimeMillis()
            ))
        }
    }

    private fun startBleScanInternal(options: Map<String, Any?>): Map<String, Any> {
        if (bleScanner == null) {
            return mapOf("success" to false, "error" to "BLUETOOTH_UNAVAILABLE")
        }

        if (!hasBluetoothPermission()) {
            return mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }

        if (isBleScanActive) {
            stopBleScanInternal()
        }

        val timeout = (options["timeout"] as? Number)?.toLong() ?: 0L
        val scanMode = when (options["scanMode"] as? String) {
            "lowPower" -> ScanSettings.SCAN_MODE_LOW_POWER
            "lowLatency" -> ScanSettings.SCAN_MODE_LOW_LATENCY
            else -> ScanSettings.SCAN_MODE_BALANCED
        }

        val settingsBuilder = ScanSettings.Builder()
            .setScanMode(scanMode)

        val filters = mutableListOf<ScanFilter>()
        val serviceUUIDs = options["serviceUUIDs"] as? List<String>
        serviceUUIDs?.forEach { uuid ->
            try {
                filters.add(ScanFilter.Builder()
                    .setServiceUuid(ParcelUuid(UUID.fromString(uuid)))
                    .build())
            } catch (e: Exception) {
                // Invalid UUID, skip
            }
        }

        try {
            if (filters.isEmpty()) {
                bleScanner?.startScan(null, settingsBuilder.build(), bleScanCallback)
            } else {
                bleScanner?.startScan(filters, settingsBuilder.build(), bleScanCallback)
            }
            isBleScanActive = true

            if (timeout > 0) {
                handler.postDelayed({
                    stopBleScanInternal()
                }, timeout)
            }

            sendEvent("onBluetoothEvent", mapOf(
                "type" to "scanStarted",
                "timestamp" to System.currentTimeMillis()
            ))

            return mapOf("success" to true)
        } catch (e: SecurityException) {
            return mapOf("success" to false, "error" to "PERMISSION_DENIED")
        } catch (e: Exception) {
            return mapOf("success" to false, "error" to "SCAN_FAILED", "message" to (e.message ?: ""))
        }
    }

    private fun stopBleScanInternal(): Map<String, Any> {
        if (!isBleScanActive) {
            return mapOf("success" to true)
        }

        try {
            bleScanner?.stopScan(bleScanCallback)
            isBleScanActive = false

            sendEvent("onBluetoothEvent", mapOf(
                "type" to "scanStopped",
                "timestamp" to System.currentTimeMillis()
            ))

            return mapOf("success" to true)
        } catch (e: SecurityException) {
            return mapOf("success" to false, "error" to "PERMISSION_DENIED")
        } catch (e: Exception) {
            return mapOf("success" to false, "error" to "UNKNOWN", "message" to (e.message ?: ""))
        }
    }

    // ============================================================================
    // Classic Bluetooth Scan
    // ============================================================================

    private val classicScanReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                BluetoothDevice.ACTION_FOUND -> {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }

                    device?.let {
                        val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()
                        val bondState = when (it.bondState) {
                            BluetoothDevice.BOND_BONDED -> "bonded"
                            BluetoothDevice.BOND_BONDING -> "bonding"
                            else -> "none"
                        }

                        val deviceMap = mapOf(
                            "id" to it.address,
                            "name" to (it.name ?: it.address),
                            "type" to "classic",
                            "rssi" to rssi,
                            "classic" to mapOf(
                                "address" to it.address,
                                "name" to it.name,
                                "bondState" to bondState,
                                "rssi" to rssi
                            )
                        )

                        sendEvent("onBluetoothEvent", mapOf(
                            "type" to "deviceDiscovered",
                            "deviceId" to it.address,
                            "data" to mapOf("device" to deviceMap),
                            "timestamp" to System.currentTimeMillis()
                        ))
                    }
                }
                BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                    isClassicScanActive = false
                    sendEvent("onBluetoothEvent", mapOf(
                        "type" to "scanStopped",
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
            }
        }
    }

    private fun startClassicScanInternal(options: Map<String, Any?>): Map<String, Any> {
        if (bluetoothAdapter == null) {
            return mapOf("success" to false, "error" to "BLUETOOTH_UNAVAILABLE")
        }

        if (!hasBluetoothPermission()) {
            return mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }

        if (isClassicScanActive) {
            stopClassicScanInternal()
        }

        val context = appContext.reactContext ?: return mapOf("success" to false, "error" to "NO_CONTEXT")

        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        context.registerReceiver(classicScanReceiver, filter)

        try {
            val started = bluetoothAdapter?.startDiscovery() == true
            if (started) {
                isClassicScanActive = true

                sendEvent("onBluetoothEvent", mapOf(
                    "type" to "scanStarted",
                    "timestamp" to System.currentTimeMillis()
                ))

                return mapOf("success" to true)
            } else {
                return mapOf("success" to false, "error" to "SCAN_FAILED")
            }
        } catch (e: SecurityException) {
            return mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }
    }

    private fun stopClassicScanInternal(): Map<String, Any> {
        if (!isClassicScanActive) {
            return mapOf("success" to true)
        }

        try {
            bluetoothAdapter?.cancelDiscovery()
            appContext.reactContext?.unregisterReceiver(classicScanReceiver)
            isClassicScanActive = false
            return mapOf("success" to true)
        } catch (e: Exception) {
            return mapOf("success" to false, "error" to "UNKNOWN", "message" to (e.message ?: ""))
        }
    }

    private fun getBondedDevicesInternal(): Map<String, Any> {
        if (bluetoothAdapter == null) {
            return mapOf("success" to false, "error" to "BLUETOOTH_UNAVAILABLE")
        }

        try {
            val bondedDevices = bluetoothAdapter?.bondedDevices ?: emptySet()
            val devices = bondedDevices.map { device ->
                mapOf(
                    "address" to device.address,
                    "name" to device.name,
                    "bondState" to "bonded"
                )
            }
            return mapOf("success" to true, "devices" to devices)
        } catch (e: SecurityException) {
            return mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }
    }

    // ============================================================================
    // BLE Connection
    // ============================================================================

    private fun connectBleInternal(deviceId: String, options: Map<String, Any?>): Map<String, Any> {
        if (bluetoothAdapter == null) {
            return mapOf("success" to false, "error" to "BLUETOOTH_UNAVAILABLE")
        }

        if (!hasBluetoothPermission()) {
            return mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }

        if (bleConnections.containsKey(deviceId)) {
            return mapOf("success" to false, "error" to "ALREADY_CONNECTED")
        }

        val device = bluetoothAdapter?.getRemoteDevice(deviceId)
        if (device == null) {
            return mapOf("success" to false, "error" to "DEVICE_NOT_FOUND")
        }

        val autoConnect = options["autoConnect"] as? Boolean ?: false
        val context = appContext.reactContext ?: return mapOf("success" to false, "error" to "NO_CONTEXT")

        try {
            val gatt = device.connectGatt(context, autoConnect, gattCallback)
            if (gatt == null) {
                return mapOf("success" to false, "error" to "CONNECTION_FAILED")
            }

            bleConnections[deviceId] = gatt
            return mapOf(
                "success" to true,
                "connection" to mapOf(
                    "deviceId" to deviceId,
                    "state" to "connecting",
                    "type" to "ble"
                )
            )
        } catch (e: SecurityException) {
            return mapOf("success" to false, "error" to "PERMISSION_DENIED")
        } catch (e: Exception) {
            return mapOf("success" to false, "error" to "CONNECTION_FAILED", "message" to (e.message ?: ""))
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            val deviceId = gatt.device.address
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    sendEvent("onBluetoothEvent", mapOf(
                        "type" to "connected",
                        "deviceId" to deviceId,
                        "data" to mapOf(
                            "state" to "connected"
                        ),
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    bleConnections.remove(deviceId)
                    discoveredServices.remove(deviceId)
                    gatt.close()
                    sendEvent("onBluetoothEvent", mapOf(
                        "type" to "disconnected",
                        "deviceId" to deviceId,
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val deviceId = gatt.device.address
            if (status == BluetoothGatt.GATT_SUCCESS) {
                discoveredServices[deviceId] = gatt.services
                val services = gatt.services.map { service ->
                    mapOf(
                        "uuid" to service.uuid.toString(),
                        "isPrimary" to (service.type == BluetoothGattService.SERVICE_TYPE_PRIMARY),
                        "characteristics" to service.characteristics.map { char ->
                            mapOf(
                                "uuid" to char.uuid.toString(),
                                "serviceUuid" to service.uuid.toString(),
                                "properties" to mapOf(
                                    "broadcast" to ((char.properties and BluetoothGattCharacteristic.PROPERTY_BROADCAST) != 0),
                                    "read" to ((char.properties and BluetoothGattCharacteristic.PROPERTY_READ) != 0),
                                    "writeWithoutResponse" to ((char.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0),
                                    "write" to ((char.properties and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0),
                                    "notify" to ((char.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0),
                                    "indicate" to ((char.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0),
                                    "authenticatedSignedWrites" to ((char.properties and BluetoothGattCharacteristic.PROPERTY_SIGNED_WRITE) != 0),
                                    "extendedProperties" to ((char.properties and BluetoothGattCharacteristic.PROPERTY_EXTENDED_PROPS) != 0)
                                )
                            )
                        }
                    )
                }
                sendEvent("onBluetoothEvent", mapOf(
                    "type" to "servicesDiscovered",
                    "deviceId" to deviceId,
                    "data" to mapOf("services" to services),
                    "timestamp" to System.currentTimeMillis()
                ))
            }
        }

        override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                sendEvent("onBluetoothEvent", mapOf(
                    "type" to "characteristicRead",
                    "deviceId" to gatt.device.address,
                    "data" to mapOf(
                        "result" to mapOf(
                            "deviceId" to gatt.device.address,
                            "serviceUuid" to characteristic.service.uuid.toString(),
                            "characteristicUuid" to characteristic.uuid.toString(),
                            "value" to Base64.encodeToString(characteristic.value ?: ByteArray(0), Base64.NO_WRAP),
                            "timestamp" to System.currentTimeMillis()
                        )
                    ),
                    "timestamp" to System.currentTimeMillis()
                ))
            }
        }

        override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            sendEvent("onBluetoothEvent", mapOf(
                "type" to "characteristicWritten",
                "deviceId" to gatt.device.address,
                "data" to mapOf(
                    "serviceUuid" to characteristic.service.uuid.toString(),
                    "characteristicUuid" to characteristic.uuid.toString(),
                    "success" to (status == BluetoothGatt.GATT_SUCCESS)
                ),
                "timestamp" to System.currentTimeMillis()
            ))
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            sendEvent("onBluetoothEvent", mapOf(
                "type" to "notification",
                "deviceId" to gatt.device.address,
                "data" to mapOf(
                    "notification" to mapOf(
                        "deviceId" to gatt.device.address,
                        "serviceUuid" to characteristic.service.uuid.toString(),
                        "characteristicUuid" to characteristic.uuid.toString(),
                        "value" to Base64.encodeToString(characteristic.value ?: ByteArray(0), Base64.NO_WRAP),
                        "timestamp" to System.currentTimeMillis()
                    )
                ),
                "timestamp" to System.currentTimeMillis()
            ))
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                sendEvent("onBluetoothEvent", mapOf(
                    "type" to "mtuChanged",
                    "deviceId" to gatt.device.address,
                    "data" to mapOf("mtu" to mtu),
                    "timestamp" to System.currentTimeMillis()
                ))
            }
        }
    }

    // ============================================================================
    // Classic Bluetooth Connection
    // ============================================================================

    private fun connectClassicInternal(address: String, options: Map<String, Any?>): Map<String, Any> {
        if (bluetoothAdapter == null) {
            return mapOf("success" to false, "error" to "BLUETOOTH_UNAVAILABLE")
        }

        if (!hasBluetoothPermission()) {
            return mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }

        if (classicConnections.containsKey(address)) {
            return mapOf("success" to false, "error" to "ALREADY_CONNECTED")
        }

        val device = bluetoothAdapter?.getRemoteDevice(address)
        if (device == null) {
            return mapOf("success" to false, "error" to "DEVICE_NOT_FOUND")
        }

        val uuidString = options["uuid"] as? String
        val uuid = if (uuidString != null) UUID.fromString(uuidString) else SPP_UUID
        val secure = options["secure"] as? Boolean ?: true

        scope.launch(Dispatchers.IO) {
            try {
                val socket = if (secure) {
                    device.createRfcommSocketToServiceRecord(uuid)
                } else {
                    device.createInsecureRfcommSocketToServiceRecord(uuid)
                }

                bluetoothAdapter?.cancelDiscovery()
                socket.connect()
                classicConnections[address] = socket

                handler.post {
                    sendEvent("onBluetoothEvent", mapOf(
                        "type" to "connected",
                        "deviceId" to address,
                        "data" to mapOf("state" to "connected"),
                        "timestamp" to System.currentTimeMillis()
                    ))
                }

                // Start reading data
                startClassicDataReader(address, socket)
            } catch (e: IOException) {
                handler.post {
                    sendEvent("onBluetoothEvent", mapOf(
                        "type" to "connectionFailed",
                        "deviceId" to address,
                        "data" to mapOf("error" to (e.message ?: "Connection failed")),
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
            } catch (e: SecurityException) {
                handler.post {
                    sendEvent("onBluetoothEvent", mapOf(
                        "type" to "connectionFailed",
                        "deviceId" to address,
                        "data" to mapOf("error" to "Permission denied"),
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
            }
        }

        return mapOf(
            "success" to true,
            "connection" to mapOf(
                "deviceId" to address,
                "state" to "connecting",
                "type" to "classic"
            )
        )
    }

    private fun startClassicDataReader(address: String, socket: BluetoothSocket) {
        scope.launch(Dispatchers.IO) {
            val buffer = ByteArray(1024)
            val inputStream = socket.inputStream

            while (socket.isConnected && classicConnections.containsKey(address)) {
                try {
                    val bytesRead = inputStream.read(buffer)
                    if (bytesRead > 0) {
                        val data = buffer.copyOf(bytesRead)
                        handler.post {
                            sendEvent("onBluetoothEvent", mapOf(
                                "type" to "notification",
                                "deviceId" to address,
                                "data" to mapOf(
                                    "notification" to mapOf(
                                        "deviceId" to address,
                                        "value" to Base64.encodeToString(data, Base64.NO_WRAP),
                                        "timestamp" to System.currentTimeMillis()
                                    )
                                ),
                                "timestamp" to System.currentTimeMillis()
                            ))
                        }
                    }
                } catch (e: IOException) {
                    break
                }
            }

            // Connection closed
            classicConnections.remove(address)
            handler.post {
                sendEvent("onBluetoothEvent", mapOf(
                    "type" to "disconnected",
                    "deviceId" to address,
                    "timestamp" to System.currentTimeMillis()
                ))
            }
        }
    }

    // ============================================================================
    // Disconnect
    // ============================================================================

    private fun disconnectInternal(deviceId: String): Map<String, Any> {
        // Try BLE disconnect
        bleConnections[deviceId]?.let { gatt ->
            try {
                gatt.disconnect()
                return mapOf("success" to true)
            } catch (e: SecurityException) {
                return mapOf("success" to false, "error" to "PERMISSION_DENIED")
            }
        }

        // Try Classic disconnect
        classicConnections[deviceId]?.let { socket ->
            try {
                socket.close()
                classicConnections.remove(deviceId)
                return mapOf("success" to true)
            } catch (e: IOException) {
                return mapOf("success" to false, "error" to "UNKNOWN", "message" to (e.message ?: ""))
            }
        }

        return mapOf("success" to false, "error" to "DEVICE_NOT_CONNECTED")
    }

    private fun disconnectAllInternal(): Map<String, Any> {
        // Disconnect all BLE
        bleConnections.forEach { (_, gatt) ->
            try {
                gatt.disconnect()
            } catch (e: SecurityException) {
                // Ignore
            }
        }
        bleConnections.clear()
        discoveredServices.clear()

        // Disconnect all Classic
        classicConnections.forEach { (_, socket) ->
            try {
                socket.close()
            } catch (e: IOException) {
                // Ignore
            }
        }
        classicConnections.clear()

        return mapOf("success" to true)
    }

    private fun isConnectedInternal(deviceId: String): Boolean {
        return bleConnections.containsKey(deviceId) || classicConnections.containsKey(deviceId)
    }

    private fun getConnectedDevicesInternal(): Map<String, Any> {
        val connections = mutableListOf<Map<String, Any>>()

        bleConnections.forEach { (deviceId, _) ->
            connections.add(mapOf(
                "deviceId" to deviceId,
                "state" to "connected",
                "type" to "ble"
            ))
        }

        classicConnections.forEach { (deviceId, _) ->
            connections.add(mapOf(
                "deviceId" to deviceId,
                "state" to "connected",
                "type" to "classic"
            ))
        }

        return mapOf("success" to true, "connections" to connections)
    }

    // ============================================================================
    // BLE GATT Operations
    // ============================================================================

    private fun discoverServicesInternal(deviceId: String): Map<String, Any> {
        val gatt = bleConnections[deviceId]
            ?: return mapOf("success" to false, "error" to "DEVICE_NOT_CONNECTED")

        return try {
            val started = gatt.discoverServices()
            if (started) {
                mapOf("success" to true)
            } else {
                mapOf("success" to false, "error" to "OPERATION_FAILED")
            }
        } catch (e: SecurityException) {
            mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }
    }

    private fun readCharacteristicInternal(deviceId: String, serviceUuid: String, characteristicUuid: String): Map<String, Any> {
        val gatt = bleConnections[deviceId]
            ?: return mapOf("success" to false, "error" to "DEVICE_NOT_CONNECTED")

        val service = gatt.getService(UUID.fromString(serviceUuid))
            ?: return mapOf("success" to false, "error" to "SERVICE_NOT_FOUND")

        val characteristic = service.getCharacteristic(UUID.fromString(characteristicUuid))
            ?: return mapOf("success" to false, "error" to "CHARACTERISTIC_NOT_FOUND")

        return try {
            val started = gatt.readCharacteristic(characteristic)
            if (started) {
                mapOf("success" to true)
            } else {
                mapOf("success" to false, "error" to "READ_FAILED")
            }
        } catch (e: SecurityException) {
            mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }
    }

    private fun writeCharacteristicInternal(
        deviceId: String,
        serviceUuid: String,
        characteristicUuid: String,
        value: String,
        options: Map<String, Any?>
    ): Map<String, Any> {
        val gatt = bleConnections[deviceId]
            ?: return mapOf("success" to false, "error" to "DEVICE_NOT_CONNECTED")

        val service = gatt.getService(UUID.fromString(serviceUuid))
            ?: return mapOf("success" to false, "error" to "SERVICE_NOT_FOUND")

        val characteristic = service.getCharacteristic(UUID.fromString(characteristicUuid))
            ?: return mapOf("success" to false, "error" to "CHARACTERISTIC_NOT_FOUND")

        val withResponse = options["withResponse"] as? Boolean ?: true
        val writeType = if (withResponse) {
            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        } else {
            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        }

        return try {
            val data = Base64.decode(value, Base64.DEFAULT)
            characteristic.value = data
            characteristic.writeType = writeType
            val started = gatt.writeCharacteristic(characteristic)
            if (started) {
                mapOf("success" to true)
            } else {
                mapOf("success" to false, "error" to "WRITE_FAILED")
            }
        } catch (e: SecurityException) {
            mapOf("success" to false, "error" to "PERMISSION_DENIED")
        } catch (e: IllegalArgumentException) {
            mapOf("success" to false, "error" to "INVALID_INPUT", "message" to "Invalid Base64 value")
        }
    }

    private fun setNotificationInternal(
        deviceId: String,
        serviceUuid: String,
        characteristicUuid: String,
        enable: Boolean
    ): Map<String, Any> {
        val gatt = bleConnections[deviceId]
            ?: return mapOf("success" to false, "error" to "DEVICE_NOT_CONNECTED")

        val service = gatt.getService(UUID.fromString(serviceUuid))
            ?: return mapOf("success" to false, "error" to "SERVICE_NOT_FOUND")

        val characteristic = service.getCharacteristic(UUID.fromString(characteristicUuid))
            ?: return mapOf("success" to false, "error" to "CHARACTERISTIC_NOT_FOUND")

        return try {
            gatt.setCharacteristicNotification(characteristic, enable)

            val descriptor = characteristic.getDescriptor(CCCD_UUID)
            if (descriptor != null) {
                descriptor.value = if (enable) {
                    BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                } else {
                    BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
                }
                gatt.writeDescriptor(descriptor)
            }

            mapOf("success" to true)
        } catch (e: SecurityException) {
            mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }
    }

    private fun requestMtuInternal(deviceId: String, mtu: Int): Map<String, Any> {
        val gatt = bleConnections[deviceId]
            ?: return mapOf("success" to false, "error" to "DEVICE_NOT_CONNECTED")

        return try {
            val started = gatt.requestMtu(mtu)
            if (started) {
                mapOf("success" to true)
            } else {
                mapOf("success" to false, "error" to "OPERATION_FAILED")
            }
        } catch (e: SecurityException) {
            mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }
    }

    // ============================================================================
    // Classic Bluetooth Data
    // ============================================================================

    private fun writeClassicInternal(deviceId: String, value: String): Map<String, Any> {
        val socket = classicConnections[deviceId]
            ?: return mapOf("success" to false, "error" to "DEVICE_NOT_CONNECTED")

        return try {
            val data = Base64.decode(value, Base64.DEFAULT)
            socket.outputStream.write(data)
            socket.outputStream.flush()
            mapOf("success" to true)
        } catch (e: IOException) {
            mapOf("success" to false, "error" to "WRITE_FAILED", "message" to (e.message ?: ""))
        } catch (e: IllegalArgumentException) {
            mapOf("success" to false, "error" to "INVALID_INPUT", "message" to "Invalid Base64 value")
        }
    }

    // ============================================================================
    // Bonding
    // ============================================================================

    private fun createBondInternal(deviceId: String): Map<String, Any> {
        if (bluetoothAdapter == null) {
            return mapOf("success" to false, "error" to "BLUETOOTH_UNAVAILABLE")
        }

        val device = bluetoothAdapter?.getRemoteDevice(deviceId)
            ?: return mapOf("success" to false, "error" to "DEVICE_NOT_FOUND")

        return try {
            val started = device.createBond()
            if (started) {
                mapOf("success" to true)
            } else {
                mapOf("success" to false, "error" to "BONDING_FAILED")
            }
        } catch (e: SecurityException) {
            mapOf("success" to false, "error" to "PERMISSION_DENIED")
        }
    }

    private fun removeBondInternal(deviceId: String): Map<String, Any> {
        if (bluetoothAdapter == null) {
            return mapOf("success" to false, "error" to "BLUETOOTH_UNAVAILABLE")
        }

        val device = bluetoothAdapter?.getRemoteDevice(deviceId)
            ?: return mapOf("success" to false, "error" to "DEVICE_NOT_FOUND")

        return try {
            val method = device.javaClass.getMethod("removeBond")
            val result = method.invoke(device) as Boolean
            if (result) {
                mapOf("success" to true)
            } else {
                mapOf("success" to false, "error" to "OPERATION_FAILED")
            }
        } catch (e: Exception) {
            mapOf("success" to false, "error" to "OPERATION_FAILED", "message" to (e.message ?: ""))
        }
    }

    // ============================================================================
    // Bluetooth State Receiver
    // ============================================================================

    private val bluetoothStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                BluetoothAdapter.ACTION_STATE_CHANGED -> {
                    val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                    val stateString = when (state) {
                        BluetoothAdapter.STATE_OFF -> "poweredOff"
                        BluetoothAdapter.STATE_ON -> "poweredOn"
                        BluetoothAdapter.STATE_TURNING_OFF -> "resetting"
                        BluetoothAdapter.STATE_TURNING_ON -> "resetting"
                        else -> "unknown"
                    }
                    sendEvent("onBluetoothEvent", mapOf(
                        "type" to "stateChange",
                        "data" to mapOf("state" to stateString),
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
            }
        }
    }

    private fun registerBluetoothStateReceiver() {
        val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
        appContext.reactContext?.registerReceiver(bluetoothStateReceiver, filter)
    }

    private fun unregisterBluetoothStateReceiver() {
        try {
            appContext.reactContext?.unregisterReceiver(bluetoothStateReceiver)
        } catch (e: Exception) {
            // Already unregistered
        }
    }

    // ============================================================================
    // Helpers
    // ============================================================================

    private fun hasBluetoothPermission(): Boolean {
        val context = appContext.reactContext ?: return false

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        }
    }
}
