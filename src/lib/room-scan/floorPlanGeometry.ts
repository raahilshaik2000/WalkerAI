export interface FloorPlanPoint {
  x: number;
  y: number;
}

export interface FloorPlanSegmentLike {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ScanOpeningLike {
  center: {
    x: number;
    z: number;
  };
}

export function distancePointToSegment(point: FloorPlanPoint, segment: FloorPlanSegmentLike): number {
  const vx = segment.x2 - segment.x1;
  const vy = segment.y2 - segment.y1;
  const wx = point.x - segment.x1;
  const wy = point.y - segment.y1;
  const lengthSquared = vx * vx + vy * vy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - segment.x1, point.y - segment.y1);
  }

  const projection = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSquared));
  const closestX = segment.x1 + projection * vx;
  const closestY = segment.y1 + projection * vy;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

export function findNearestWallSegment<T extends FloorPlanSegmentLike>(
  item: ScanOpeningLike,
  segments: T[],
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  const point = { x: item.center.x, y: item.center.z };

  for (const seg of segments) {
    const dist = distancePointToSegment(point, seg);
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }

  return best;
}
