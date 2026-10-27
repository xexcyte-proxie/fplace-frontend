/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_MAPPEDIN_MAP_ID: string;
  readonly VITE_AR_URL: string;
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_DEV_HTTP?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_POSITION_SOURCE?: string;
  readonly VITE_INDOOR_ATLAS_API_KEY?: string;
  readonly VITE_INDOOR_ATLAS_API_SECRET?: string;
  readonly VITE_BLE_RSSI_THRESHOLD_DBM?: string;
  readonly VITE_BLE_SCAN_INTERVAL_MS?: string;
  readonly VITE_DEBUG_POSITION_HUD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface BluetoothLEScan extends EventTarget {
  active: boolean;
  stop(): Promise<void>;
}

interface BluetoothAdvertisingEvent extends Event {
  readonly device: BluetoothDevice;
  readonly rssi?: number;
  readonly manufacturerData?: DataView;
  readonly serviceData?: Map<number, DataView>;
}

interface BluetoothLEScanOptions {
  filters?: BluetoothLEScanFilter[];
  acceptAllAdvertisements?: boolean;
  keepRepeatedDevices?: boolean;
}

interface BluetoothLEScanFilter {
  services?: BluetoothServiceUUID[];
  name?: string;
  namePrefix?: string;
  manufacturerData?: { companyIdentifier: number; dataPrefix?: BufferSource }[];
}

interface Bluetooth {
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
  requestLEScan?(options?: BluetoothLEScanOptions): Promise<BluetoothLEScan>;
}

interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: BluetoothServiceUUID[];
  acceptAllDevices?: boolean;
}

type BluetoothServiceUUID = number | string;

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
}

interface Navigator {
  bluetooth?: Bluetooth;
  addEventListener(
    type: 'advertisementreceived',
    listener: (event: BluetoothAdvertisingEvent) => void,
  ): void;
  removeEventListener(
    type: 'advertisementreceived',
    listener: (event: BluetoothAdvertisingEvent) => void,
  ): void;
}
