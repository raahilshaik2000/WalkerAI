import type { RoomScanData } from '@/stores/project-wizard.store';

/**
 * Photoreal AI redesign via cloud (Fal) when a project exists.
 * Room scan is not required — generation uses project photos.
 */
export function shouldGenerateImagePreview(
  projectId: string | null,
  _roomScanData?: RoomScanData | null,
): boolean {
  return !!projectId;
}

/** Load only already-saved image previews when a project exists. */
export function shouldLoadExistingImagePreviews(
  projectId: string | null,
  _roomScanData?: RoomScanData | null,
): boolean {
  return !!projectId;
}

export function visualPreviewUnavailableMessage(message: string | null | undefined): string {
  const fallback = 'Visual preview is unavailable right now';
  const text = message?.trim();
  if (!text) return fallback;

  if (/(api|key|provider|configured|reimaginehome|render failed|did not return|timed out|fal)/i.test(text)) {
    return fallback;
  }

  return text;
}

export function generateRenderUserMessage(result: {
  fallback?: boolean;
  reason?: string | null;
  error?: string | null;
  renders?: unknown[];
} | null | undefined): string | null {
  if (!result) return null;
  if (Array.isArray(result.renders) && result.renders.length > 0) return null;
  if (result.fallback) {
    return visualPreviewUnavailableMessage(result.reason || result.error);
  }
  return null;
}

export const DESIGN_STYLE_OPTIONS = [
  { id: 'modern', label: 'Modern' },
  { id: 'contemporary', label: 'Contemporary' },
  { id: 'spa', label: 'Spa' },
  { id: 'traditional', label: 'Traditional' },
  { id: 'transitional', label: 'Transitional' },
  { id: 'farmhouse', label: 'Farmhouse' },
  { id: 'industrial', label: 'Industrial' },
] as const;

