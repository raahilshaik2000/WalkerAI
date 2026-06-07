import Config from 'react-native-config';
import { supabase } from './client';

export type StorageBucket =
  | 'project-photos'
  | 'renders'
  | 'permits'
  | 'warranties'
  | 'change-order-docs'
  | 'company-docs'
  | 'progress-photos'
  | 'avatars';

interface UploadResult {
  publicUrl: string;
  storagePath: string;
}

export interface StorageUploadAsset {
  uri?: string | null;
  fileName?: string | null;
  type?: string | null;
}

export interface StorageUploadMetadata {
  uri: string;
  extension: string;
  contentType: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

function extensionFromName(value?: string | null): string | null {
  const match = value?.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);
  return match?.[1]?.toLowerCase() ?? null;
}

function sanitizeContentType(type?: string | null): string | null {
  const trimmed = type?.trim().toLowerCase();
  if (!trimmed || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(trimmed)) return null;
  if (trimmed === 'image/jpg') return 'image/jpeg';
  return trimmed;
}

export function getUploadMetadata(
  asset: StorageUploadAsset,
  fallbackContentType: string = 'image/jpeg',
): StorageUploadMetadata {
  if (!asset.uri) {
    throw new Error('Selected file is missing a file URI.');
  }

  const extensionFromAsset = extensionFromName(asset.fileName) ?? extensionFromName(asset.uri);
  const contentType =
    sanitizeContentType(asset.type)
    ?? (extensionFromAsset ? MIME_BY_EXTENSION[extensionFromAsset] : null)
    ?? fallbackContentType;
  const extension = EXTENSION_BY_MIME[contentType] ?? extensionFromAsset ?? 'jpg';

  return {
    uri: asset.uri,
    extension,
    contentType,
  };
}

// React Native's fetch() returns empty blobs for file:// URIs.
// Use XMLHttpRequest with responseType='blob' instead — it correctly reads local files.
function readLocalFileAsBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', uri, true);
    xhr.responseType = 'blob';
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 0) {
        resolve(xhr.response as Blob);
      } else {
        reject(new Error(`Failed to read file (${xhr.status}): ${uri}`));
      }
    };
    xhr.onerror = () => reject(new Error(`Network error reading file: ${uri}`));
    xhr.send();
  });
}

export async function uploadFile(
  bucket: StorageBucket,
  path: string,
  fileUri: string,
  contentType: string = 'image/jpeg',
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  const blob = await readLocalFileAsBlob(fileUri);

  if (onProgress) {
    await uploadWithProgress(bucket, path, blob, contentType, onProgress);
  } else {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType,
      upsert: true,
    });
    if (error) throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: data.publicUrl, storagePath: path };
}

async function uploadWithProgress(
  bucket: StorageBucket,
  path: string,
  blob: Blob,
  contentType: string,
  onProgress: (progress: number) => void
): Promise<void> {
  const supabaseUrl = Config.SUPABASE_URL!;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? 'Sign in is required to upload files.');
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${data.session.access_token}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(blob);
  });
}

export async function uploadBase64(
  bucket: StorageBucket,
  path: string,
  base64: string,
  contentType: string = 'image/jpeg',
): Promise<UploadResult> {
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: data.publicUrl, storagePath: path };
}

export function getPublicUrl(bucket: StorageBucket, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function getSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresIn: number = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteFile(bucket: StorageBucket, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
