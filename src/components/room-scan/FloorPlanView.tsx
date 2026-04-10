import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Line,
  Text as SvgText,
  Rect,
  G,
  Path,
  Polygon,
  Defs,
  Marker,
} from 'react-native-svg';
import { Colors } from '@/constants/theme';

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
  size: number;
}

interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  isHorizontal: boolean;
  id: string;
}

const WALL_THICKNESS = 0.18;
const WALL_COLOR = '#FFFFFF';
const WALL_FILL = '#1A1A1A';
const DIM_COLOR = '#FF6B00';
const DOOR_COLOR = '#34D399';
const WINDOW_COLOR = '#60A5FA';
const GRID_COLOR = '#1A1A1A';
const DIM_LINE_COLOR = '#444444';
const FLOOR_FILL = '#0D0D0D';

export function FloorPlanView({ walls, doors, windows, size }: FloorPlanViewProps) {
  const plan = useMemo(() => {
    if (walls.length === 0) return null;

    // Sort walls into horizontal and vertical based on neighbor analysis
    const segments: WallSegment[] = walls.map((wall) => {
      const cx = wall.center.x;
      const cz = wall.center.z;
      const halfW = wall.width / 2;

      // Count neighbors sharing same Z (horizontal) vs same X (vertical)
      const hNeighbors = walls.filter(w => w.id !== wall.id && Math.abs(w.center.z - cz) < 0.5).length;
      const vNeighbors = walls.filter(w => w.id !== wall.id && Math.abs(w.center.x - cx) < 0.5).length;
      const isHorizontal = hNeighbors >= vNeighbors;

      return {
        id: wall.id,
        x1: isHorizontal ? cx - halfW : cx,
        y1: isHorizontal ? cz : cz - halfW,
        x2: isHorizontal ? cx + halfW : cx,
        y2: isHorizontal ? cz : cz + halfW,
        length: wall.width,
        isHorizontal,
      };
    });

    // Build connected room polygon by sorting wall endpoints
    const corners = buildRoomPolygon(segments);

    // Compute bounds
    const allX = corners.map(c => c.x);
    const allY = corners.map(c => c.y);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const roomW = maxX - minX;
    const roomH = maxY - minY;

    // Add generous padding for dimension lines
    const pad = Math.max(roomW, roomH) * 0.35;
    const vbX = minX - pad;
    const vbY = minY - pad;
    const vbW = roomW + pad * 2;
    const vbH = roomH + pad * 2;

    return {
      segments,
      corners,
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
      bounds: { minX, maxX, minY, maxY, roomW, roomH },
      scale: Math.max(roomW, roomH),
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
        {segments.map((seg, i) => {
          const label = `${seg.length.toFixed(1)}m`;
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
              {`${door.width.toFixed(1)}m`}
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
              {`${win.width.toFixed(1)}m`}
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

// Build a connected polygon from wall segments by sorting endpoints
function buildRoomPolygon(segments: WallSegment[]): { x: number; y: number }[] {
  if (segments.length < 3) return [];

  // Collect all endpoints
  const endpoints: { x: number; y: number }[] = [];
  segments.forEach(seg => {
    endpoints.push({ x: seg.x1, y: seg.y1 });
    endpoints.push({ x: seg.x2, y: seg.y2 });
  });

  // Merge nearby endpoints (within tolerance)
  const merged: { x: number; y: number }[] = [];
  const used = new Set<number>();
  const tolerance = 0.3;

  for (let i = 0; i < endpoints.length; i++) {
    if (used.has(i)) continue;
    let sx = endpoints[i].x;
    let sy = endpoints[i].y;
    let count = 1;
    for (let j = i + 1; j < endpoints.length; j++) {
      if (used.has(j)) continue;
      const dx = endpoints[j].x - sx / count;
      const dy = endpoints[j].y - sy / count;
      if (Math.abs(endpoints[j].x - endpoints[i].x) < tolerance &&
          Math.abs(endpoints[j].y - endpoints[i].y) < tolerance) {
        sx += endpoints[j].x;
        sy += endpoints[j].y;
        count++;
        used.add(j);
      }
    }
    used.add(i);
    merged.push({ x: sx / count, y: sy / count });
  }

  // Sort points in clockwise order around centroid
  const cx = merged.reduce((s, p) => s + p.x, 0) / merged.length;
  const cy = merged.reduce((s, p) => s + p.y, 0) / merged.length;
  merged.sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  return merged;
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
