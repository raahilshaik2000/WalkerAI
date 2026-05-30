export interface ScanPoint {
  x: number;
  y?: number;
  z: number;
}

export interface RawScanSurface {
  id: string;
  width: number;
  height: number;
  angle?: number;
  center: ScanPoint;
}

export interface NormalizedSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  angle: number;
  isHorizontal: boolean;
  confidence: number;
}

export interface NormalizedFloorPlan {
  segments: NormalizedSegment[];
  corners: Array<{ x: number; y: number }>;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    roomW: number;
    roomH: number;
  };
  quality: 'good' | 'fallback' | 'empty';
}

const SNAP_TOLERANCE_M = 0.18;
const MIN_WALL_LENGTH_M = 0.35;

function normalizeAngle(angle: number) {
  let a = angle % Math.PI;
  if (a < 0) a += Math.PI;
  return a;
}

function inferAngle(wall: RawScanSurface, walls: RawScanSurface[]) {
  if (typeof wall.angle === 'number' && Number.isFinite(wall.angle)) {
    return normalizeAngle(wall.angle);
  }

  const sameZ = walls.filter((w) => w.id !== wall.id && Math.abs(w.center.z - wall.center.z) < 0.5).length;
  const sameX = walls.filter((w) => w.id !== wall.id && Math.abs(w.center.x - wall.center.x) < 0.5).length;
  return sameZ >= sameX ? 0 : Math.PI / 2;
}

function snapValue(value: number, values: number[]) {
  const nearest = values.find((v) => Math.abs(v - value) <= SNAP_TOLERANCE_M);
  return nearest ?? value;
}

function segmentFromWall(wall: RawScanSurface, walls: RawScanSurface[]): NormalizedSegment | null {
  if (!Number.isFinite(wall.width) || wall.width < MIN_WALL_LENGTH_M) return null;

  const angle = inferAngle(wall, walls);
  const half = wall.width / 2;
  const dx = Math.cos(angle) * half;
  const dy = Math.sin(angle) * half;
  const isHorizontal = Math.abs(Math.sin(angle)) < Math.abs(Math.cos(angle));

  return {
    id: wall.id,
    x1: wall.center.x - dx,
    y1: wall.center.z - dy,
    x2: wall.center.x + dx,
    y2: wall.center.z + dy,
    length: wall.width,
    angle,
    isHorizontal,
    confidence: typeof wall.angle === 'number' ? 1 : 0.65,
  };
}

function mergeCloseSegments(segments: NormalizedSegment[]) {
  const merged: NormalizedSegment[] = [];

  for (const seg of segments) {
    const existing = merged.find((candidate) => {
      if (candidate.isHorizontal !== seg.isHorizontal) return false;
      const axisDist = seg.isHorizontal
        ? Math.abs(candidate.y1 - seg.y1)
        : Math.abs(candidate.x1 - seg.x1);
      const centerDist = Math.hypot(
        (candidate.x1 + candidate.x2 - seg.x1 - seg.x2) / 2,
        (candidate.y1 + candidate.y2 - seg.y1 - seg.y2) / 2,
      );
      return axisDist <= SNAP_TOLERANCE_M && centerDist <= Math.max(candidate.length, seg.length) * 0.35;
    });

    if (!existing) {
      merged.push({ ...seg });
      continue;
    }

    if (seg.length > existing.length) {
      Object.assign(existing, seg, {
        confidence: Math.max(existing.confidence, seg.confidence),
      });
    }
  }

  return merged;
}

function snapSegments(segments: NormalizedSegment[]) {
  const verticalXs = segments.filter((s) => !s.isHorizontal).map((s) => s.x1).sort((a, b) => a - b);
  const horizontalYs = segments.filter((s) => s.isHorizontal).map((s) => s.y1).sort((a, b) => a - b);

  return segments.map((seg) => {
    if (seg.isHorizontal) {
      const y = snapValue(seg.y1, horizontalYs);
      return { ...seg, y1: y, y2: y };
    }
    const x = snapValue(seg.x1, verticalXs);
    return { ...seg, x1: x, x2: x };
  });
}

function buildCorners(segments: NormalizedSegment[]) {
  const points: Array<{ x: number; y: number }> = [];
  const horizontals = segments.filter((s) => s.isHorizontal);
  const verticals = segments.filter((s) => !s.isHorizontal);

  for (const h of horizontals) {
    const hx1 = Math.min(h.x1, h.x2) - SNAP_TOLERANCE_M;
    const hx2 = Math.max(h.x1, h.x2) + SNAP_TOLERANCE_M;
    for (const v of verticals) {
      const vy1 = Math.min(v.y1, v.y2) - SNAP_TOLERANCE_M;
      const vy2 = Math.max(v.y1, v.y2) + SNAP_TOLERANCE_M;
      if (v.x1 >= hx1 && v.x1 <= hx2 && h.y1 >= vy1 && h.y1 <= vy2) {
        points.push({ x: v.x1, y: h.y1 });
      }
    }
  }

  const unique: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    if (!unique.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < SNAP_TOLERANCE_M)) {
      unique.push(point);
    }
  }

  if (unique.length < 3) return [];

  const cx = unique.reduce((sum, p) => sum + p.x, 0) / unique.length;
  const cy = unique.reduce((sum, p) => sum + p.y, 0) / unique.length;
  return unique.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

function boundsFromSegments(segments: NormalizedSegment[]) {
  const xs = segments.flatMap((s) => [s.x1, s.x2]);
  const ys = segments.flatMap((s) => [s.y1, s.y2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, roomW: maxX - minX, roomH: maxY - minY };
}

export function normalizeFloorPlan(walls: RawScanSurface[]): NormalizedFloorPlan {
  const initial = walls
    .map((wall) => segmentFromWall(wall, walls))
    .filter((segment): segment is NormalizedSegment => Boolean(segment));

  if (initial.length === 0) {
    return {
      segments: [],
      corners: [],
      bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1, roomW: 2, roomH: 2 },
      quality: 'empty',
    };
  }

  const segments = snapSegments(mergeCloseSegments(initial));
  const corners = buildCorners(segments);
  const bounds = boundsFromSegments(segments);

  const fallbackCorners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];

  return {
    segments,
    corners: corners.length >= 3 ? corners : fallbackCorners,
    bounds,
    quality: corners.length >= 3 ? 'good' : 'fallback',
  };
}
