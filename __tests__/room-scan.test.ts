import {
  canUseRoomScanMeasurements,
  getRoomScanMeasurementBlocker,
  getRoomScanQualityWarnings,
  scanHasUsdzMesh,
} from '../src/lib/room-scan';
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

  it('blocks partial RoomPlan wall sets and surfaces quality warnings', () => {
    const partial = {
      isMock: false,
      scanMode: 'roomplan',
      walls: [{ id: 'a' }, { id: 'b' }],
      roomDimensions: { length: 4.2, width: 3.5, height: 2.7 },
      hasUsdz: false,
    };
    expect(getRoomScanMeasurementBlocker(partial)).toContain('only captured part of the room');
    expect(getRoomScanQualityWarnings(partial)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Fewer than 3 walls'),
        expect.stringContaining('3D mesh is missing'),
      ]),
    );
    expect(scanHasUsdzMesh({ usdzFilePath: '/tmp/room.usdz' })).toBe(true);
    expect(scanHasUsdzMesh({ hasUsdz: true })).toBe(true);
    expect(scanHasUsdzMesh({})).toBe(false);
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
    expect(source).toContain('WalkerRoomScans');
    expect(source).toContain('documentDirectory');
    expect(source).toContain('"scanQuality"');
    expect(source).toContain('var roomHeight = room.walls.map { Double($0.dimensions.y) }.max() ?? 2.7');
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

  it('aligns rotated room scans to dominant orientation to prevent pinwheel distortion and area inflation', () => {
    // Dominic's kitchen: physical dimensions 2.83m (9.3ft) x 3.26m (10.7ft) = 9.23 m² (99 sq ft).
    // When scanned at a 35-degree angle, unrotated world AABB ballooned to 4.7m x 4.9m (23.0 m²).
    const rot = (35 * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    // 4 rotated walls centered around origin
    const walls = [
      { id: 'w1', width: 2.83, height: 2.8, angle: rot, center: { x: -1.63 * sinR, z: 1.63 * cosR } },
      { id: 'w2', width: 2.83, height: 2.8, angle: rot, center: { x: 1.63 * sinR, z: -1.63 * cosR } },
      { id: 'w3', width: 3.26, height: 2.8, angle: rot + Math.PI / 2, center: { x: -1.415 * cosR, z: -1.415 * sinR } },
      { id: 'w4', width: 3.26, height: 2.8, angle: rot + Math.PI / 2, center: { x: 1.415 * cosR, z: 1.415 * sinR } },
    ];

    const doors = [
      { id: 'd1', width: 0.9, height: 2.1, center: { x: -1.415 * cosR, z: -1.415 * sinR } },
    ];

    const plan = normalizeFloorPlan(walls, doors);

    // Verify room is closed into a clean rectangle
    expect(plan.quality).toBe('good');
    expect(plan.segments.length).toBe(4);
    expect(plan.corners.length).toBe(4);

    // Verify true orthogonal dimensions: ~2.83m width and ~3.26m length
    const minDim = Math.min(plan.bounds.roomW, plan.bounds.roomH);
    const maxDim = Math.max(plan.bounds.roomW, plan.bounds.roomH);
    expect(minDim).toBeCloseTo(2.83, 1);
    expect(maxDim).toBeCloseTo(3.26, 1);

    // Verify area is ~9.2 m², not inflated 23 m²
    const trueArea = plan.bounds.roomW * plan.bounds.roomH;
    expect(trueArea).toBeLessThan(12.0);
    expect(trueArea).toBeGreaterThan(8.0);

    // Verify doors are rotated to align with room segments
    expect(plan.normalizedDoors?.length).toBe(1);
  });
});
