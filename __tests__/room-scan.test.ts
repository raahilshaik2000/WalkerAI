import { canUseRoomScanMeasurements, getRoomScanMeasurementBlocker } from '../src/lib/room-scan';

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
});
