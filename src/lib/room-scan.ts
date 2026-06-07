type RoomScanLike = {
  isMock?: boolean;
  roomDimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };
} | null | undefined;

function isPositiveFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getRoomScanMeasurementBlocker(scanData: RoomScanLike): string | null {
  if (!scanData) return 'Measurement data is unavailable.';
  if (scanData.isMock) return 'Simulated scan data cannot be used for project estimates.';

  const dimensions = scanData.roomDimensions;
  if (
    !isPositiveFiniteNumber(dimensions?.length)
    || !isPositiveFiniteNumber(dimensions?.width)
    || !isPositiveFiniteNumber(dimensions?.height)
  ) {
    return 'Room scan measurements are incomplete.';
  }

  return null;
}

export function canUseRoomScanMeasurements(scanData: RoomScanLike) {
  return getRoomScanMeasurementBlocker(scanData) == null;
}
