import type { RoomScanData } from '@/stores/project-wizard.store';

export function shouldGenerateImagePreview(_projectId: string | null, _roomScanData: RoomScanData | null): boolean {
  return false;
}

export function shouldLoadExistingImagePreviews(projectId: string | null, roomScanData: RoomScanData | null): boolean {
  return !!projectId && !roomScanData;
}

export function visualPreviewUnavailableMessage(message: string | null | undefined): string {
  const fallback = 'Visual preview is unavailable right now';
  const text = message?.trim();
  if (!text) return fallback;

  if (/(api|key|provider|configured|reimaginehome|render failed|did not return)/i.test(text)) {
    return fallback;
  }

  return text;
}
