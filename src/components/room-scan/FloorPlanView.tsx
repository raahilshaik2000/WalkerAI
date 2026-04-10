import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Text as SvgText, Rect, G, Circle } from 'react-native-svg';
import { Colors } from '@/constants/theme';

interface Point {
  x: number;
  z: number;
}

interface WallData {
  id: string;
  width: number;
  height: number;
  center: { x: number; y: number; z: number };
}

interface DoorData {
  id: string;
  width: number;
  height: number;
  center: { x: number; y: number; z: number };
}

interface WindowData {
  id: string;
  width: number;
  height: number;
  center: { x: number; y: number; z: number };
}

interface FloorPlanViewProps {
  walls: WallData[];
  doors: DoorData[];
  windows: WindowData[];
  size: number; // viewport size in pixels
}

export function FloorPlanView({ walls, doors, windows, size }: FloorPlanViewProps) {
  const { wallLines, doorMarkers, windowMarkers, viewBox } = useMemo(() => {
    if (walls.length === 0) {
      return { wallLines: [], doorMarkers: [], windowMarkers: [], viewBox: '-5 -5 10 10' };
    }

    // Find bounds of all wall centers
    const allX = walls.map(w => w.center.x);
    const allZ = walls.map(w => w.center.z);
    const minX = Math.min(...allX) - 1;
    const maxX = Math.max(...allX) + 1;
    const minZ = Math.min(...allZ) - 1;
    const maxZ = Math.max(...allZ) + 1;

    const rangeX = maxX - minX;
    const rangeZ = maxZ - minZ;
    const padding = 1.5;

    const vb = `${minX - padding} ${minZ - padding} ${rangeX + padding * 2} ${rangeZ + padding * 2}`;

    // Build wall segments — each wall is drawn as a thick line
    // We estimate wall endpoints from center + half-width along the dominant axis
    const wLines = walls.map((wall) => {
      const cx = wall.center.x;
      const cz = wall.center.z;
      const halfW = wall.width / 2;

      // Determine if wall is more horizontal (along X) or vertical (along Z)
      // by checking if other walls share similar Z (horizontal) or X (vertical)
      const isHorizontal = walls.filter(w => Math.abs(w.center.z - cz) < 0.3).length >=
                           walls.filter(w => Math.abs(w.center.x - cx) < 0.3).length;

      let x1: number, z1: number, x2: number, z2: number;
      if (isHorizontal) {
        x1 = cx - halfW;
        z1 = cz;
        x2 = cx + halfW;
        z2 = cz;
      } else {
        x1 = cx;
        z1 = cz - halfW;
        x2 = cx;
        z2 = cz + halfW;
      }

      return {
        id: wall.id,
        x1, z1, x2, z2,
        label: `${wall.width.toFixed(1)}m`,
        labelX: cx,
        labelZ: cz,
        isHorizontal,
      };
    });

    // Door markers — small gap indicators
    const dMarkers = doors.map((door) => ({
      id: door.id,
      cx: door.center.x,
      cz: door.center.z,
      width: door.width,
      label: `${door.width.toFixed(1)}m`,
    }));

    // Window markers — double-line indicators
    const winMarkers = windows.map((win) => ({
      id: win.id,
      cx: win.center.x,
      cz: win.center.z,
      width: win.width,
      label: `${win.width.toFixed(1)}m`,
    }));

    return { wallLines: wLines, doorMarkers: dMarkers, windowMarkers: winMarkers, viewBox: vb };
  }, [walls, doors, windows]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={viewBox}>
        {/* Walls */}
        {wallLines.map((wall) => (
          <G key={wall.id}>
            <Line
              x1={wall.x1}
              y1={wall.z1}
              x2={wall.x2}
              y2={wall.z2}
              stroke="#FFFFFF"
              strokeWidth={0.12}
              strokeLinecap="round"
            />
            {/* Dimension label */}
            <SvgText
              x={wall.labelX}
              y={wall.labelZ + (wall.isHorizontal ? -0.3 : 0)}
              dx={wall.isHorizontal ? 0 : 0.3}
              fill="#FF6B00"
              fontSize={0.35}
              fontWeight="600"
              textAnchor="middle"
            >
              {wall.label}
            </SvgText>
          </G>
        ))}

        {/* Doors — shown as orange circles */}
        {doorMarkers.map((door) => (
          <G key={door.id}>
            <Circle
              cx={door.cx}
              cy={door.cz}
              r={0.2}
              fill="none"
              stroke="#34D399"
              strokeWidth={0.06}
            />
            <SvgText
              x={door.cx}
              y={door.cz + 0.55}
              fill="#34D399"
              fontSize={0.28}
              fontWeight="500"
              textAnchor="middle"
            >
              {door.label}
            </SvgText>
          </G>
        ))}

        {/* Windows — shown as blue dashes */}
        {windowMarkers.map((win) => (
          <G key={win.id}>
            <Line
              x1={win.cx - win.width / 2}
              y1={win.cz}
              x2={win.cx + win.width / 2}
              y2={win.cz}
              stroke="#60A5FA"
              strokeWidth={0.1}
              strokeDasharray="0.15,0.1"
            />
            <SvgText
              x={win.cx}
              y={win.cz - 0.3}
              fill="#60A5FA"
              fontSize={0.28}
              fontWeight="500"
              textAnchor="middle"
            >
              {win.label}
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.bg.primary,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
