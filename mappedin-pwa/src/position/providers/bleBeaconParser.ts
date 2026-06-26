const IBEACON_COMPANY_ID = 0x004c;
const IBEACON_TYPE = 0x02;
const IBEACON_LENGTH = 0x15;
const EDDYSTONE_SERVICE_UUID = 0xfeaa;
const EDDYSTONE_UID_FRAME = 0x00;

export interface ParsedBeaconAdvert {
  uuid: string;
  major?: number;
  minor?: number;
  rssi: number;
  timestamp: number;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toUpperCase();
}

function readUint16BE(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

export function parseIBeaconManufacturerData(
  manufacturerData: DataView | ArrayBuffer | undefined,
  rssi: number,
): ParsedBeaconAdvert | null {
  if (!manufacturerData) return null;

  const buffer =
    manufacturerData instanceof ArrayBuffer
      ? manufacturerData
      : manufacturerData.buffer.slice(
          manufacturerData.byteOffset,
          manufacturerData.byteOffset + manufacturerData.byteLength,
        );

  const view = new DataView(buffer);
  if (view.byteLength < 25) return null;

  const companyId = view.getUint16(0, true);
  if (companyId !== IBEACON_COMPANY_ID) return null;

  const type = view.getUint8(2);
  const length = view.getUint8(3);
  if (type !== IBEACON_TYPE || length !== IBEACON_LENGTH) return null;

  const uuidBytes = new Uint8Array(buffer, 4, 16);
  const major = readUint16BE(view, 20);
  const minor = readUint16BE(view, 22);

  return {
    uuid: formatUuid(uuidBytes),
    major,
    minor,
    rssi,
    timestamp: Date.now(),
  };
}

export function parseEddystoneUidServiceData(
  serviceData: Map<number, DataView> | undefined,
  rssi: number,
): ParsedBeaconAdvert | null {
  if (!serviceData?.has(EDDYSTONE_SERVICE_UUID)) return null;

  const data = serviceData.get(EDDYSTONE_SERVICE_UUID)!;
  if (data.byteLength < 18) return null;

  const frameType = data.getUint8(0);
  if (frameType !== EDDYSTONE_UID_FRAME) return null;

  const namespace = new Uint8Array(
    data.buffer,
    data.byteOffset + 2,
    10,
  );
  const instance = new Uint8Array(
    data.buffer,
    data.byteOffset + 12,
    6,
  );

  const uuid = `${Array.from(namespace, (b) => b.toString(16).padStart(2, '0')).join('')}-${Array.from(instance, (b) => b.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

  return {
    uuid,
    rssi,
    timestamp: Date.now(),
  };
}

export function parseAdvertisementEvent(event: {
  rssi?: number;
  manufacturerData?: DataView;
  serviceData?: Map<number, DataView>;
}): ParsedBeaconAdvert | null {
  const rssi = event.rssi ?? -127;

  const iBeacon = parseIBeaconManufacturerData(event.manufacturerData, rssi);
  if (iBeacon) return iBeacon;

  return parseEddystoneUidServiceData(event.serviceData, rssi);
}

export function beaconKey(uuid: string, major?: number, minor?: number): string {
  return `${uuid.toUpperCase()}:${major ?? '*'}:${minor ?? '*'}`;
}
