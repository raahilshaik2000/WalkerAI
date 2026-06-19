import { canUseRoomScanMeasurements, getRoomScanMeasurementBlocker } from '../src/lib/room-scan';
import { distancePointToSegment, findNearestWallSegment } from '../src/lib/room-scan/floorPlanGeometry';
import { normalizeFloorPlan } from '../src/lib/room-scan/normalizeFloorPlan';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('room scan measurement helpers', () => {
  it('allows complete real scan measurements', () => {
    expect(canUseRoomScanMeasurements({
      isMock: false,
      roomDimensions: { length: 4.2, width: 3.5, height: 2.7 },
    })).toBe(true);
  });

  it('blocks simulator mock scans from estimates', () => {
    expect(getRoomScanMeasurementBlocker({
      isMock: true,
      roomDimensions: { length: 4.2, width: 3.5, height: 2.7 },
    })).toBe('Simulated scan data cannot be used for project estimates.');
  });

  it('blocks missing or invalid dimensions', () => {
    expect(canUseRoomScanMeasurements(null)).toBe(false);
    expect(canUseRoomScanMeasurements({ isMock: false, roomDimensions: { length: 4, width: 0, height: 2.7 } })).toBe(false);
    expect(canUseRoomScanMeasurements({ isMock: false, roomDimensions: { length: 4, width: 3.5 } })).toBe(false);
  });

  it('serializes RoomPlan dimensions from projected wall extents', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../ios/WalkerAI/RoomPlan/RoomCaptureViewController.swift'),
      'utf8',
    );

    expect(source).toContain('let halfX = abs(cos(angle)) * length / 2');
    expect(source).toContain('let halfZ = abs(sin(angle)) * length / 2');
    expect(source).toContain('let roomLength = hasWallBounds ? max(0, maxX - minX) : 0');
    expect(source).toContain('let roomWidth = hasWallBounds ? max(0, maxZ - minZ) : 0');
    expect(source).not.toContain("let roomWidth = (allZ.max() ?? 0) - (allZ.min() ?? 0) + Double(room.walls.first?.dimensions.x ?? 0)");
  });

  it('guards event setup and falls back to AR measurement without LiDAR', () => {
    const roomScanSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/room-scan.tsx'),
      'utf8',
    );
    const nativeModuleSource = fs.readFileSync(
      path.join(__dirname, '../ios/WalkerAI/RoomPlan/RoomPlanModule.swift'),
      'utf8',
    );

    expect(roomScanSource).toContain('let scanEmitter: NativeEventEmitter;');
    expect(roomScanSource).toContain('scanEmitter = new NativeEventEmitter(ScanModule);');
    expect(roomScanSource).toContain("setSupportReason(formatAppSafeErrorMessage(err, 'Room scanning is unavailable on this device.'))");
    expect(roomScanSource).toContain("const errorSub = scanEmitter.addListener('onScanError', (payload?: { error?: string }) => {");
    expect(roomScanSource).toContain("type ScanMode = 'roomplan' | 'ar_measure' | 'unsupported';");
    expect(roomScanSource).toContain("const usesManualAR = supportMode === 'ar_measure';");
    expect(roomScanSource).toContain('This device does not have LiDAR, so tap two points for length, width, and ceiling height.');
    expect(roomScanSource).not.toContain('const scanEmitter = ScanModule ? new NativeEventEmitter(ScanModule) : null;');

    expect(nativeModuleSource).toContain('"UNSUPPORTED_DEVICE"');
    expect(nativeModuleSource).toContain('ARWorldTrackingConfiguration.isSupported');
    expect(nativeModuleSource).toContain('let measureVC = ARMeasureViewController()');
    expect(nativeModuleSource).toContain('"mode": "ar_measure"');
    expect(nativeModuleSource).toContain('sceneView.hitTest(location, types: hitTypes)');
    expect(nativeModuleSource).toContain('"scanMode": "ar_measure"');
    expect(nativeModuleSource).toContain('while let presented = presenter.presentedViewController');
    expect(nativeModuleSource).toContain('presenter.present(captureVC, animated: true)');
  });

  it('updates 2D floor-plan dimensions after snapping wall endpoints to room corners', () => {
    const plan = normalizeFloorPlan([
      { id: 'top', width: 3.8, height: 2.5, angle: 0, center: { x: 2, z: 0 } },
      { id: 'bottom', width: 4, height: 2.5, angle: 0, center: { x: 2, z: 3 } },
      { id: 'left', width: 3, height: 2.5, angle: Math.PI / 2, center: { x: 0, z: 1.5 } },
      { id: 'right', width: 3, height: 2.5, angle: Math.PI / 2, center: { x: 4, z: 1.5 } },
    ]);

    const top = plan.segments.find((segment) => segment.id === 'top');
    expect(top?.x1).toBeCloseTo(0);
    expect(top?.x2).toBeCloseTo(4);
    expect(top?.length).toBeCloseTo(4);
  });

  it('attaches 2D door and window openings to the nearest wall line, not the nearest midpoint', () => {
    const topWall = { id: 'top', x1: 0, y1: 0, x2: 10, y2: 0 };
    const leftWall = { id: 'left', x1: 0, y1: 0, x2: 0, y2: 3 };

    expect(distancePointToSegment({ x: 1, y: 0 }, topWall)).toBeCloseTo(0);
    expect(findNearestWallSegment(
      { center: { x: 1, z: 0 } },
      [topWall, leftWall],
    )?.id).toBe('top');
  });
});
