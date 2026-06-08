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

// Tolerance for clustering parallel walls onto the same axis line. RoomPlan
// scans can drift several centimetres per face, especially in low light, so
// 22cm is a reasonable balance between snapping noisy walls together and
// preserving genuinely-close-but-distinct walls.
const SNAP_TOLERANCE_M = 0.22;
const MIN_WALL_LENGTH_M = 0.35;
// When deciding whether a wall is horizontal-leaning vs vertical-leaning,
// a wall within ~10 degrees of an axis is treated as that axis.
const AXIS_ANGLE_BIAS = Math.tan((10 * Math.PI) / 180);

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

function segmentFromWall(wall: RawScanSurface, walls: RawScanSurface[]): NormalizedSegment | null {
  if (!Number.isFinite(wall.width) || wall.width < MIN_WALL_LENGTH_M) return null;

  const angle = inferAngle(wall, walls);
  const half = wall.width / 2;
  const dx = Math.cos(angle) * half;
  const dy = Math.sin(angle) * half;

  // A wall is "horizontal" in the floor plan if its length direction is
  // closer to the world X axis than the Z axis. Bias slightly toward axis
  // alignment (10 degrees of tolerance) so a wall that drifted a few
  // degrees off-axis still snaps to horizontal/vertical instead of being
  // treated as diagonal.
  const tan = Math.tan(angle);
  const isHorizontal = Math.abs(tan) <= 1
    ? true
    : Math.abs(1 / tan) > AXIS_ANGLE_BIAS
      ? false
      : Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));

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

// Cluster a list of scalar coordinates: any two values within tolerance get
// represented by their average. Returns a map from original value to its
// cluster representative. Used to snap parallel walls onto shared axis lines.
function buildClusterMap(values: number[], tolerance: number): Map<number, number> {
  const map = new Map<number, number>();
  if (values.length === 0) return map;

  const sorted = [...values].sort((a, b) => a - b);
  let bucket: number[] = [sorted[0]];

  const flushBucket = () => {
    const rep = bucket.reduce((sum, v) => sum + v, 0) / bucket.length;
    for (const v of bucket) map.set(v, rep);
    bucket = [];
  };

  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i];
    if (v - bucket[bucket.length - 1] <= tolerance) {
      bucket.push(v);
    } else {
      flushBucket();
      bucket.push(v);
    }
  }
  flushBucket();
  return map;
}

function snapToNearest(value: number, candidates: number[], tolerance: number): number {
  let best = value;
  let bestDist = tolerance;
  for (const c of candidates) {
    const d = Math.abs(c - value);
    if (d <= bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// Force every segment onto its own axis line AND snap its endpoints to the
// canonical axis-line positions of the perpendicular walls. This is what
// makes a horizontal wall actually touch the two vertical walls it meets
// instead of stopping just short of them.
function snapSegmentsToGrid(segments: NormalizedSegment[]): NormalizedSegment[] {
  const horizontals = segments.filter((s) => s.isHorizontal);
  const verticals = segments.filter((s) => !s.isHorizontal);

  // Cluster horizontal walls by their y, vertical walls by their x. The
  // representative of each cluster becomes the axis line for that group.
  const horizontalYs = horizontals.map((s) => s.y1);
  const verticalXs = verticals.map((s) => s.x1);
  const horizontalYClusters = buildClusterMap(horizontalYs, SNAP_TOLERANCE_M);
  const verticalXClusters = buildClusterMap(verticalXs, SNAP_TOLERANCE_M);

  const canonicalYs = Array.from(new Set(horizontalYClusters.values()));
  const canonicalXs = Array.from(new Set(verticalXClusters.values()));

  return segments.map((seg) => {
    if (seg.isHorizontal) {
      const y = horizontalYClusters.get(seg.y1) ?? seg.y1;
      const x1 = snapToNearest(seg.x1, canonicalXs, SNAP_TOLERANCE_M * 1.5);
      const x2 = snapToNearest(seg.x2, canonicalXs, SNAP_TOLERANCE_M * 1.5);
      return { ...seg, y1: y, y2: y, x1, x2 };
    }
    const x = verticalXClusters.get(seg.x1) ?? seg.x1;
    const y1 = snapToNearest(seg.y1, canonicalYs, SNAP_TOLERANCE_M * 1.5);
    const y2 = snapToNearest(seg.y2, canonicalYs, SNAP_TOLERANCE_M * 1.5);
    return { ...seg, x1: x, x2: x, y1, y2 };
  });
}

// After snapping, if RoomPlan returned two near-duplicate walls for the
// same physical wall (common when a long wall is detected as two pieces)
// merge them into a single longer segment.
function mergeCollinear(segments: NormalizedSegment[]): NormalizedSegment[] {
  const merged: NormalizedSegment[] = [];

  for (const seg of segments) {
    const sameLine = merged.find((existing) => {
      if (existing.isHorizontal !== seg.isHorizontal) return false;
      if (existing.isHorizontal) {
        if (Math.abs(existing.y1 - seg.y1) > SNAP_TOLERANCE_M) return false;
        const existingMin = Math.min(existing.x1, existing.x2);
        const existingMax = Math.max(existing.x1, existing.x2);
        const segMin = Math.min(seg.x1, seg.x2);
        const segMax = Math.max(seg.x1, seg.x2);
        const gap = Math.max(0, segMin - existingMax, existingMin - segMax);
        return gap <= SNAP_TOLERANCE_M * 1.5;
      }
      if (Math.abs(existing.x1 - seg.x1) > SNAP_TOLERANCE_M) return false;
      const existingMin = Math.min(existing.y1, existing.y2);
      const existingMax = Math.max(existing.y1, existing.y2);
      const segMin = Math.min(seg.y1, seg.y2);
      const segMax = Math.max(seg.y1, seg.y2);
      const gap = Math.max(0, segMin - existingMax, existingMin - segMax);
      return gap <= SNAP_TOLERANCE_M * 1.5;
    });

    if (!sameLine) {
      merged.push({ ...seg });
      continue;
    }

    if (sameLine.isHorizontal) {
      const newX1 = Math.min(sameLine.x1, sameLine.x2, seg.x1, seg.x2);
      const newX2 = Math.max(sameLine.x1, sameLine.x2, seg.x1, seg.x2);
      sameLine.x1 = newX1;
      sameLine.x2 = newX2;
      sameLine.length = Math.abs(newX2 - newX1);
    } else {
      const newY1 = Math.min(sameLine.y1, sameLine.y2, seg.y1, seg.y2);
      const newY2 = Math.max(sameLine.y1, sameLine.y2, seg.y1, seg.y2);
      sameLine.y1 = newY1;
      sameLine.y2 = newY2;
      sameLine.length = Math.abs(newY2 - newY1);
    }
    sameLine.confidence = Math.max(sameLine.confidence, seg.confidence);
  }

  return merged;
}

// Build the room outline polygon from the snapped segment endpoints. Each
// wall contributes its two endpoints; we then dedupe nearby endpoints (the
// shared corners between adjacent walls) and order them around the room
// centroid so the polygon draws as a clean outline.
function buildCornersFromEndpoints(segments: NormalizedSegment[]): Array<{ x: number; y: number }> {
  const endpoints: Array<{ x: number; y: number }> = [];
  for (const seg of segments) {
    endpoints.push({ x: seg.x1, y: seg.y1 });
    endpoints.push({ x: seg.x2, y: seg.y2 });
  }

  const unique: Array<{ x: number; y: number }> = [];
  for (const p of endpoints) {
    const existing = unique.find((q) => Math.hypot(p.x - q.x, p.y - q.y) <= SNAP_TOLERANCE_M);
    if (!existing) unique.push(p);
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

  const snapped = snapSegmentsToGrid(initial);
  const segments = mergeCollinear(snapped).filter((s) => {
    const len = s.isHorizontal ? Math.abs(s.x2 - s.x1) : Math.abs(s.y2 - s.y1);
    return len >= MIN_WALL_LENGTH_M;
  });
  const corners = buildCornersFromEndpoints(segments);
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
