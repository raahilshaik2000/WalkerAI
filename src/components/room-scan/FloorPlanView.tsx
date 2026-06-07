import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Line,
  Text as SvgText,
  Rect,
  G,
  Path,
  Polygon,
} from 'react-native-svg';
import { normalizeFloorPlan, type NormalizedSegment } from '@/lib/room-scan/normalizeFloorPlan';

interface WallData {
  id: string;
  width: number;
  height: number;
  angle?: number;
  center: { x: number; y: number; z: number };
}

interface DoorData {
  id: string;
  width: number;
  height: number;
  angle?: number;
  center: { x: number; y: number; z: number };
}

interface WindowData {
  id: string;
  width: number;
  height: number;
  angle?: number;
  center: { x: number; y: number; z: number };
}

interface FloorPlanViewProps {
  walls: WallData[];
  doors: DoorData[];
  windows: WindowData[];
  size: number;
}

type WallSegment = NormalizedSegment;

const WALL_THICKNESS = 0.18;
const WALL_COLOR = '#FFFFFF';
const DIM_COLOR = '#FF6B00';
const DOOR_COLOR = '#34D399';
const WINDOW_COLOR = '#60A5FA';
const GRID_COLOR = '#1A1A1A';
const DIM_LINE_COLOR = '#444444';
const FLOOR_FILL = '#0D0D0D';

export function FloorPlanView({ walls, doors, windows, size }: FloorPlanViewProps) {
  const plan = useMemo(() => {
    const normalized = normalizeFloorPlan(walls);
    if (normalized.quality === 'empty') return null;

    const { segments, corners, bounds } = normalized;

    // Add generous padding for dimension lines
    const pad = Math.max(bounds.roomW, bounds.roomH) * 0.35;
    const vbX = bounds.minX - pad;
    const vbY = bounds.minY - pad;
    const vbW = bounds.roomW + pad * 2;
    const vbH = bounds.roomH + pad * 2;

    return {
      segments,
      corners,
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
      bounds,
      scale: Math.max(bounds.roomW, bounds.roomH),
    };
  }, [walls]);

  if (!plan) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox="-5 -5 10 10" />
      </View>
    );
  }

  const { segments, corners, viewBox, bounds, scale } = plan;
  const fontSize = scale * 0.055;
  const dimOffset = scale * 0.12;
  const arrowSize = scale * 0.04;
  const t = WALL_THICKNESS * (scale / 5); // scale wall thickness

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={viewBox}>
        {/* Grid */}
        <GridPattern bounds={bounds} scale={scale} />

        {/* Room floor fill */}
        {corners.length >= 3 && (
          <Polygon
            points={corners.map(c => `${c.x},${c.y}`).join(' ')}
            fill={FLOOR_FILL}
            stroke="none"
          />
        )}

        {/* Walls as thick rectangles */}
        {segments.map((seg) => (
          <G key={seg.id}>
            {seg.isHorizontal ? (
              <Rect
                x={seg.x1}
                y={seg.y1 - t / 2}
                width={seg.length}
                height={t}
                fill={WALL_COLOR}
                rx={t * 0.15}
              />
            ) : (
              <Rect
                x={seg.x1 - t / 2}
                y={seg.y1}
                width={t}
                height={seg.length}
                fill={WALL_COLOR}
                rx={t * 0.15}
              />
            )}
          </G>
        ))}

        {/* Corner fills — fill gaps where walls meet */}
        {corners.map((corner, i) => (
          <Rect
            key={`corner_${i}`}
            x={corner.x - t / 2}
            y={corner.y - t / 2}
            width={t}
            height={t}
            fill={WALL_COLOR}
          />
        ))}

        {/* Doors — gap in wall + swing arc */}
        {doors.map((door) => {
          const seg = findNearestWall(door, segments);
          if (!seg) return null;
          const dw = door.width;
          const cx = door.center.x;
          const cy = door.center.z;
          if (seg.isHorizontal) {
            // Clear door gap
            return (
              <G key={door.id}>
                <Rect
                  x={cx - dw / 2}
                  y={cy - t}
                  width={dw}
                  height={t * 2}
                  fill={FLOOR_FILL}
                />
                {/* Door swing arc */}
                <Path
                  d={`M ${cx - dw / 2} ${cy} A ${dw} ${dw} 0 0 1 ${cx - dw / 2} ${cy - dw}`}
                  stroke={DOOR_COLOR}
                  strokeWidth={t * 0.3}
                  fill="none"
                  strokeDasharray={`${t * 0.5},${t * 0.3}`}
                />
                {/* Door leaf line */}
                <Line
                  x1={cx - dw / 2} y1={cy}
                  x2={cx + dw / 2} y2={cy}
                  stroke={DOOR_COLOR}
                  strokeWidth={t * 0.5}
                />
              </G>
            );
          } else {
            return (
              <G key={door.id}>
                <Rect
                  x={cx - t}
                  y={cy - dw / 2}
                  width={t * 2}
                  height={dw}
                  fill={FLOOR_FILL}
                />
                <Path
                  d={`M ${cx} ${cy - dw / 2} A ${dw} ${dw} 0 0 1 ${cx + dw} ${cy - dw / 2}`}
                  stroke={DOOR_COLOR}
                  strokeWidth={t * 0.3}
                  fill="none"
                  strokeDasharray={`${t * 0.5},${t * 0.3}`}
                />
                <Line
                  x1={cx} y1={cy - dw / 2}
                  x2={cx} y2={cy + dw / 2}
                  stroke={DOOR_COLOR}
                  strokeWidth={t * 0.5}
                />
              </G>
            );
          }
        })}

        {/* Windows — three parallel lines */}
        {windows.map((win) => {
          const seg = findNearestWall(win, segments);
          if (!seg) return null;
          const ww = win.width;
          const cx = win.center.x;
          const cy = win.center.z;
          const g = t * 0.4;
          if (seg.isHorizontal) {
            return (
              <G key={win.id}>
                <Rect
                  x={cx - ww / 2}
                  y={cy - t}
                  width={ww}
                  height={t * 2}
                  fill={FLOOR_FILL}
                />
                <Line x1={cx - ww / 2} y1={cy - g} x2={cx + ww / 2} y2={cy - g}
                  stroke={WINDOW_COLOR} strokeWidth={t * 0.25} />
                <Line x1={cx - ww / 2} y1={cy} x2={cx + ww / 2} y2={cy}
                  stroke={WINDOW_COLOR} strokeWidth={t * 0.35} />
                <Line x1={cx - ww / 2} y1={cy + g} x2={cx + ww / 2} y2={cy + g}
                  stroke={WINDOW_COLOR} strokeWidth={t * 0.25} />
              </G>
            );
          } else {
            return (
              <G key={win.id}>
                <Rect
                  x={cx - t}
                  y={cy - ww / 2}
                  width={t * 2}
                  height={ww}
                  fill={FLOOR_FILL}
                />
                <Line x1={cx - g} y1={cy - ww / 2} x2={cx - g} y2={cy + ww / 2}
                  stroke={WINDOW_COLOR} strokeWidth={t * 0.25} />
                <Line x1={cx} y1={cy - ww / 2} x2={cx} y2={cy + ww / 2}
                  stroke={WINDOW_COLOR} strokeWidth={t * 0.35} />
                <Line x1={cx + g} y1={cy - ww / 2} x2={cx + g} y2={cy + ww / 2}
                  stroke={WINDOW_COLOR} strokeWidth={t * 0.25} />
              </G>
            );
          }
        })}

        {/* Dimension lines outside the room */}
        {segments.map((seg) => {
          const label = `${(seg.length * 3.28084).toFixed(1)}ft`;
          if (seg.isHorizontal) {
            // Position dimension below or above wall
            const isTop = seg.y1 <= (bounds.minY + bounds.maxY) / 2;
            const dy = isTop ? -dimOffset : dimOffset;
            const ty = seg.y1 + dy;
            return (
              <G key={`dim_${seg.id}`}>
                {/* Extension lines */}
                <Line x1={seg.x1} y1={seg.y1} x2={seg.x1} y2={ty}
                  stroke={DIM_LINE_COLOR} strokeWidth={t * 0.15} />
                <Line x1={seg.x2} y1={seg.y2} x2={seg.x2} y2={ty}
                  stroke={DIM_LINE_COLOR} strokeWidth={t * 0.15} />
                {/* Dimension line */}
                <Line x1={seg.x1} y1={ty} x2={seg.x2} y2={ty}
                  stroke={DIM_COLOR} strokeWidth={t * 0.2} />
                {/* Arrow heads */}
                <ArrowHead x={seg.x1} y={ty} direction="right" size={arrowSize} />
                <ArrowHead x={seg.x2} y={ty} direction="left" size={arrowSize} />
                {/* Label */}
                <Rect
                  x={(seg.x1 + seg.x2) / 2 - fontSize * 1.5}
                  y={ty - fontSize * 0.7}
                  width={fontSize * 3}
                  height={fontSize * 1.4}
                  fill="#000000"
                  rx={fontSize * 0.2}
                />
                <SvgText
                  x={(seg.x1 + seg.x2) / 2}
                  y={ty + fontSize * 0.32}
                  fill={DIM_COLOR}
                  fontSize={fontSize}
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
              </G>
            );
          } else {
            // Position dimension left or right of wall
            const isLeft = seg.x1 <= (bounds.minX + bounds.maxX) / 2;
            const dx = isLeft ? -dimOffset : dimOffset;
            const tx = seg.x1 + dx;
            return (
              <G key={`dim_${seg.id}`}>
                <Line x1={seg.x1} y1={seg.y1} x2={tx} y2={seg.y1}
                  stroke={DIM_LINE_COLOR} strokeWidth={t * 0.15} />
                <Line x1={seg.x2} y1={seg.y2} x2={tx} y2={seg.y2}
                  stroke={DIM_LINE_COLOR} strokeWidth={t * 0.15} />
                <Line x1={tx} y1={seg.y1} x2={tx} y2={seg.y2}
                  stroke={DIM_COLOR} strokeWidth={t * 0.2} />
                <ArrowHead x={tx} y={seg.y1} direction="down" size={arrowSize} />
                <ArrowHead x={tx} y={seg.y2} direction="up" size={arrowSize} />
                <Rect
                  x={tx - fontSize * 1.5}
                  y={(seg.y1 + seg.y2) / 2 - fontSize * 0.7}
                  width={fontSize * 3}
                  height={fontSize * 1.4}
                  fill="#000000"
                  rx={fontSize * 0.2}
                />
                <SvgText
                  x={tx}
                  y={(seg.y1 + seg.y2) / 2 + fontSize * 0.32}
                  fill={DIM_COLOR}
                  fontSize={fontSize}
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
              </G>
            );
          }
        })}

        {/* Door dimension labels */}
        {doors.map((door) => {
          const cx = door.center.x;
          const cy = door.center.z;
          return (
            <SvgText
              key={`dlabel_${door.id}`}
              x={cx}
              y={cy - dimOffset * 0.6}
              fill={DOOR_COLOR}
              fontSize={fontSize * 0.8}
              fontWeight="600"
              textAnchor="middle"
            >
              {`${(door.width * 3.28084).toFixed(1)}ft`}
            </SvgText>
          );
        })}

        {/* Window dimension labels */}
        {windows.map((win) => {
          const cx = win.center.x;
          const cy = win.center.z;
          return (
            <SvgText
              key={`wlabel_${win.id}`}
              x={cx}
              y={cy - dimOffset * 0.6}
              fill={WINDOW_COLOR}
              fontSize={fontSize * 0.8}
              fontWeight="600"
              textAnchor="middle"
            >
              {`${(win.width * 3.28084).toFixed(1)}ft`}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

// Arrow head component for dimension lines
function ArrowHead({ x, y, direction, size }: { x: number; y: number; direction: string; size: number }) {
  const s = size;
  let points = '';
  switch (direction) {
    case 'right':
      points = `${x},${y} ${x + s},${y - s * 0.5} ${x + s},${y + s * 0.5}`;
      break;
    case 'left':
      points = `${x},${y} ${x - s},${y - s * 0.5} ${x - s},${y + s * 0.5}`;
      break;
    case 'down':
      points = `${x},${y} ${x - s * 0.5},${y + s} ${x + s * 0.5},${y + s}`;
      break;
    case 'up':
      points = `${x},${y} ${x - s * 0.5},${y - s} ${x + s * 0.5},${y - s}`;
      break;
  }
  return <Polygon points={points} fill={DIM_COLOR} />;
}

// Grid background
function GridPattern({ bounds, scale }: { bounds: any; scale: number }) {
  const step = Math.ceil(scale) > 5 ? 1 : 0.5;
  const lines: React.ReactNode[] = [];
  const { minX, maxX, minY, maxY } = bounds;
  const pad = scale * 0.4;

  for (let x = Math.floor(minX - pad); x <= Math.ceil(maxX + pad); x += step) {
    lines.push(
      <Line key={`gx_${x}`}
        x1={x} y1={minY - pad} x2={x} y2={maxY + pad}
        stroke={GRID_COLOR} strokeWidth={scale * 0.003} />
    );
  }
  for (let y = Math.floor(minY - pad); y <= Math.ceil(maxY + pad); y += step) {
    lines.push(
      <Line key={`gy_${y}`}
        x1={minX - pad} y1={y} x2={maxX + pad} y2={y}
        stroke={GRID_COLOR} strokeWidth={scale * 0.003} />
    );
  }
  return <G>{lines}</G>;
}

// Find nearest wall segment to a door/window
function findNearestWall(item: { center: { x: number; z: number } }, segments: WallSegment[]): WallSegment | null {
  let best: WallSegment | null = null;
  let bestDist = Infinity;
  for (const seg of segments) {
    const midX = (seg.x1 + seg.x2) / 2;
    const midY = (seg.y1 + seg.y2) / 2;
    const dist = Math.hypot(item.center.x - midX, item.center.z - midY);
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }
  return best;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
  },
});
