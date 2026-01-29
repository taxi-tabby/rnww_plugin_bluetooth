# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

This is `rnww-plugin-bluetooth`, an Expo native module that enables Bluetooth communication (BLE and Classic) for React Native WebView applications. It provides a bridge between WebView and native Bluetooth APIs.

## Build Commands

```bash
npm run build      # Compile TypeScript (src/ → lib/)
npm run clean      # Remove lib/ directory
npm run prepare    # Build before publish
```

## Architecture

### Three-Layer Structure

1. **Bridge Layer** (`src/bridge/`) - WebView communication handlers
   - `registerBluetoothHandlers(config)` accepts `IBridge` and `IPlatform`

2. **Module Wrapper** (`src/modules/index.ts`) - Cross-platform TypeScript API
   - Lazy-loads native module via `requireNativeModule('CustomBluetooth')`

3. **Native Modules** (`src/modules/android/`, `src/modules/ios/`)
   - Android: Kotlin with BLE and Classic Bluetooth support
   - iOS: Swift with CoreBluetooth (BLE only)

### Key Features

- **BLE Support:** Scan, connect, read/write characteristics, notifications
- **Classic Bluetooth:** Android-only SPP communication
- **Cross-platform:** Unified API with platform-specific implementations
- **Event-driven:** Real-time device discovery and data events

### Bridge Handlers

**State & Permissions:**
- `getBluetoothState`, `checkBluetoothPermissions`, `requestBluetoothPermissions`
- `requestEnableBluetooth` (Android only)

**Scanning:**
- `startBleScan`, `stopBleScan`, `isScanning`
- `startClassicScan`, `stopClassicScan` (Android only)
- `getBondedDevices` (Android only)

**Connection:**
- `connectBle`, `connectClassic` (Android only)
- `disconnect`, `disconnectAll`
- `isConnected`, `getConnectedDevices`

**GATT Operations:**
- `discoverServices`, `readCharacteristic`, `writeCharacteristic`
- `setNotification`, `requestMtu`

**Classic Data:**
- `writeClassic` (Android only)

**Bonding:**
- `createBond`, `removeBond` (Android only)

**Events:**
- `onBluetoothEvent` - All Bluetooth events (stateChange, deviceDiscovered, connected, disconnected, notification, etc.)

### Platform Differences

| Feature | Android | iOS |
|---------|---------|-----|
| BLE | ✅ | ✅ |
| Classic Bluetooth | ✅ | ❌ |
| Manual Bonding | ✅ | ❌ |
| Enable Bluetooth | ✅ | ❌ |
| MTU Request | ✅ | Auto |
