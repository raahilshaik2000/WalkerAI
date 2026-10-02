import { pickPhotosWithSource } from '@/lib/media-picker';
import { getUploadMetadata, uploadBase64, uploadFile } from '@/lib/supabase/storage';

/**
 * Pick + upload a supplier product photo to a public bucket so homeowners can see it
 * in the design customizer.
 */
export async function pickAndUploadCatalogPhoto(supplierId: string): Promise<string | null> {
  const assets = await pickPhotosWithSource({
    selectionLimit: 1,
    quality: 0.85,
    maxWidth: 1400,
    maxHeight: 1400,
    includeBase64: true,
  });
  const asset = assets?.[0];
  if (!asset?.uri) return null;

  const upload = getUploadMetadata({
    uri: asset.uri,
    fileName: asset.fileName,
    type: asset.type,
    base64: asset.base64,
  });
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `catalog/${supplierId}/${unique}.${upload.extension}`;

  const result = asset.base64
    ? await uploadBase64('project-photos', path, asset.base64, upload.contentType, { upsert: true })
    : await uploadFile('project-photos', path, upload.uri, upload.contentType);

  return result.publicUrl;
}
