type RoomScanLike = {
  isMock?: boolean;
  usdzFilePath?: string | null;
  hasUsdz?: boolean;
  scanMode?: string;
  walls?: unknown[];
  roomDimensions?: {
    length?: number;
    width?: number;
    height?: number;
    area?: number;
  };
  scanQuality?: {
    wallCount?: number;
    hasUsdz?: boolean;
    warnings?: string[];
  };
  usdzExportError?: string | null;
} | null | undefined;

function isPositiveFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getRoomScanQualityWarnings(scanData: RoomScanLike): string[] {
  if (!scanData || scanData.isMock) return [];
  const fromNative = Array.isArray(scanData.scanQuality?.warnings)
    ? scanData.scanQuality!.warnings!.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
    : [];
  if (fromNative.length > 0) return fromNative;

  const warnings: string[] = [];
  const wallCount = Array.isArray(scanData.walls)
    ? scanData.walls.length
    : (scanData.scanQuality?.wallCount ?? 0);
  const dims = scanData.roomDimensions;
  const hasUsdz = Boolean(
    scanData.hasUsdz
    || scanData.scanQuality?.hasUsdz
    || (typeof scanData.usdzFilePath === 'string' && scanData.usdzFilePath.length > 0),
  );

  if (scanData.scanMode === 'roomplan' || wallCount > 0) {
    if (wallCount > 0 && wallCount < 3) {
      warnings.push('Fewer than 3 walls were captured — rescan slowly around the full room.');
    }
    if (isPositiveFiniteNumber(dims?.length) && isPositiveFiniteNumber(dims?.width)) {
      if ((dims!.length as number) < 1.5 || (dims!.width as number) < 1.5) {
        warnings.push('Room footprint looks too small — walk closer to each wall and rescan.');
      }
    }
    if (isPositiveFiniteNumber(dims?.height)) {
      const h = dims!.height as number;
      if (h < 2.0 || h > 4.5) {
        warnings.push('Ceiling height looks unusual — include the ceiling while scanning.');
      }
    }
    if (!hasUsdz && scanData.scanMode !== 'ar_measure') {
      warnings.push('3D mesh is missing — rescan to unlock the interactive room model.');
    }
  }

  if (typeof scanData.usdzExportError === 'string' && scanData.usdzExportError.trim()) {
    warnings.push('3D mesh export failed — rescan to unlock the interactive room model.');
  }

  return warnings;
}

export function scanHasUsdzMesh(scanData: RoomScanLike): boolean {
  if (!scanData) return false;
  if (scanData.hasUsdz === true || scanData.scanQuality?.hasUsdz === true) return true;
  return typeof scanData.usdzFilePath === 'string' && scanData.usdzFilePath.trim().length > 0;
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

  const wallCount = Array.isArray(scanData.walls)
    ? scanData.walls.length
    : (scanData.scanQuality?.wallCount ?? 0);

  // RoomPlan captures should include a usable wall set for layout fidelity.
  if ((scanData.scanMode === 'roomplan' || wallCount > 0) && wallCount > 0 && wallCount < 3) {
    return 'This scan only captured part of the room. Rescan all walls before continuing.';
  }

  return null;
}

export function canUseRoomScanMeasurements(scanData: RoomScanLike) {
  return getRoomScanMeasurementBlocker(scanData) == null;
}
