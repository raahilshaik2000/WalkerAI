import type { AIAnalysis } from '@/types/database.types';

export type FallbackAIAnalysis = AIAnalysis & { analysis_fallback: true };
export type VisionMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface PhotoAnalysisPayload {
  data: string;
  media_type: VisionMediaType;
}

export function buildProjectAnalysisFallback(roomType: string, reason: string): FallbackAIAnalysis {
  const normalizedRoomType = roomType === 'bathroom' ? 'bathroom' : 'kitchen';
  const isBathroom = normalizedRoomType === 'bathroom';

  return {
    room_type: normalizedRoomType,
    existing_materials: isBathroom
      ? {
        cabinets: { type: 'unknown vanity/cabinetry', condition: 'fair' as const, estimated_age_years: 0 },
        countertops: { material: 'unknown vanity top', condition: 'unknown' },
        flooring: { material: 'unknown bathroom flooring', condition: 'unknown' },
        fixtures: ['bathroom fixtures to verify on site'],
        appliances: [],
      }
      : {
        cabinets: { type: 'unknown kitchen cabinetry', condition: 'fair' as const, estimated_age_years: 0 },
        countertops: { material: 'unknown countertop material', condition: 'unknown' },
        flooring: { material: 'unknown kitchen flooring', condition: 'unknown' },
        fixtures: ['kitchen fixtures to verify on site'],
        appliances: ['appliances to verify on site'],
      },
    layout: {
      estimated_sqft: 0,
      has_island: false,
      plumbing_wall_visible: false,
      window_count: 0,
    },
    structural_concerns: [],
    ai_observations: `Automated photo analysis was unavailable (${reason}). The project can continue using homeowner answers, measurements, and contractor verification.`,
    analysis_fallback: true,
  };
}

export function isMissingAnalysisFunctionError(message: string) {
  return /function not found|not found|missing.*function|cannot find.*function/i.test(message);
}

export function visionMediaTypeFor(contentType?: string | null): VisionMediaType {
  const normalized = contentType?.trim().toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (
    normalized === 'image/jpeg'
    || normalized === 'image/png'
    || normalized === 'image/webp'
    || normalized === 'image/gif'
  ) {
    return normalized;
  }
  return 'image/jpeg';
}

export function buildPhotoAnalysisPayload(
  photos: Array<{ base64?: string | null; contentType?: string | null }>,
): PhotoAnalysisPayload[] {
  return photos
    .filter((photo): photo is { base64: string; contentType?: string | null } => !!photo.base64)
    .map((photo) => ({
      data: photo.base64.replace(/^data:[^;]+;base64,/, ''),
      media_type: visionMediaTypeFor(photo.contentType),
    }));
}
