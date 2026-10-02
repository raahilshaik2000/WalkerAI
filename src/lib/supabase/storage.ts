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

interface UploadBase64Options {
  retries?: number;
  retryDelayMs?: number;
  upsert?: boolean;
  /** When true, each retry writes to path-rN.ext to avoid stuck partial objects. */
  uniquePathOnRetry?: boolean;
}

export interface StorageUploadAsset {
  uri?: string | null;
  base64?: string | null;
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
  const extensionFromAsset = extensionFromName(asset.fileName) ?? extensionFromName(asset.uri);
  const contentType =
    sanitizeContentType(asset.type)
    ?? (extensionFromAsset ? MIME_BY_EXTENSION[extensionFromAsset] : null)
    ?? fallbackContentType;
  const extension = EXTENSION_BY_MIME[contentType] ?? extensionFromAsset ?? 'jpg';

  const uri = (asset.base64 ? `data:${contentType};base64,${asset.base64}` : null) || asset.uri;
  if (!uri) {
    throw new Error('Selected file is missing a file URI.');
  }

  return {
    uri,
    extension,
    contentType,
  };
}

// React Native's fetch() returns empty blobs for file:// URIs.
// Use XMLHttpRequest with responseType='arraybuffer' or direct base64 decode for data: URIs.
function readLocalFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (uri.startsWith('data:')) {
    const clean = uri.replace(/^data:[^;]+;base64,/, '');
    const binary = atob(clean);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return Promise.resolve(buffer);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', uri, true);
    xhr.timeout = 8000;
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if ((xhr.status === 200 || xhr.status === 0) && xhr.response) {
        const buffer = xhr.response as ArrayBuffer;
        if (buffer && buffer.byteLength > 0) {
          resolve(buffer);
          return;
        }
      }
      reject(new Error(`Could not read non-empty file payload from URI: ${uri}`));
    };
    xhr.ontimeout = () => reject(new Error('Timeout reading local file'));
    xhr.onerror = () => reject(new Error(`Network error reading file: ${uri}`));
    xhr.send();
  });
}

async function uploadBinaryViaXHR(
  bucket: StorageBucket,
  path: string,
  arrayBuffer: ArrayBuffer,
  contentType: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  const supabaseUrl = Config.SUPABASE_URL!;
  const anonKey = Config.SUPABASE_ANON_KEY!;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? 'Sign in is required to upload files.');
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${data.session.access_token}`);
    if (anonKey) {
      xhr.setRequestHeader('apikey', anonKey);
    }
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'true');
    // Permit/doc uploads were aborting at 25s while Supabase storage returned 544 DB timeouts.
    xhr.timeout = 60000;

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
      }
    };

    xhr.ontimeout = () => reject(new Error('Upload timed out. Please check your connection.'));
    xhr.onerror = () => reject(new Error('Network error during file upload'));
    xhr.send(arrayBuffer);
  });
}

function attemptStoragePath(path: string, attempt: number): string {
  if (attempt <= 1) return path;
  return path.replace(/(\.[^./]+)$/, `-r${attempt}$1`);
}

export async function uploadFile(
  bucket: StorageBucket,
  path: string,
  fileUri: string,
  contentType: string = 'image/jpeg',
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  const arrayBuffer = await readLocalFileAsArrayBuffer(fileUri);

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('Selected file contains no binary data.');
  }

  const retries = 4;
  const retryDelayMs = 1500;
  let lastError: unknown = null;
  let uploadedPath = path;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const attemptPath = attemptStoragePath(path, attempt);
    try {
      await uploadBinaryViaXHR(bucket, attemptPath, arrayBuffer, contentType, onProgress);
      uploadedPath = attemptPath;
      lastError = null;
      break;
    } catch (err: any) {
      lastError = err;
      const text = `${err?.message ?? ''}`.toLowerCase();
      const retriable = text.includes('544')
        || text.includes('timeout')
        || text.includes('timed out')
        || text.includes('network')
        || text.includes('databasetimeout')
        || text.includes('503')
        || text.includes('504');
      if (!retriable || attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  if (lastError) {
    throw lastError;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(uploadedPath);
  return { publicUrl: data.publicUrl, storagePath: uploadedPath };
}

/**
 * Prefer base64 from the image picker (reliable on iOS ph:// / camera assets).
 * Fall back to reading the local file URI when base64 is unavailable.
 * Retries use a new object path so a hung/partial upsert cannot block the next attempt.
 */
export async function uploadPickerAsset(
  bucket: StorageBucket,
  path: string,
  asset: StorageUploadAsset,
  fallbackContentType: string = 'image/jpeg',
  onProgress?: (progress: number) => void,
): Promise<UploadResult> {
  const meta = getUploadMetadata(asset, fallbackContentType);
  const base64 = typeof asset.base64 === 'string' && asset.base64.length > 0 ? asset.base64 : null;
  if (base64) {
    return uploadBase64(bucket, path, base64, meta.contentType, {
      upsert: false,
      retries: 4,
      retryDelayMs: 1500,
      uniquePathOnRetry: true,
    });
  }
  return uploadFile(bucket, path, meta.uri, meta.contentType, onProgress);
}

export async function uploadBase64(
  bucket: StorageBucket,
  path: string,
  base64: string,
  contentType: string = 'image/jpeg',
  options: UploadBase64Options = {},
): Promise<UploadResult> {
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const retries = Math.max(1, options.retries ?? 3);
  const retryDelayMs = options.retryDelayMs ?? 800;
  const uniquePathOnRetry = options.uniquePathOnRetry ?? false;
  let lastError: unknown = null;
  let uploadedPath = path;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const attemptPath = uniquePathOnRetry ? attemptStoragePath(path, attempt) : path;
    const { error } = await supabase.storage.from(bucket).upload(attemptPath, bytes, {
      contentType,
      upsert: options.upsert ?? false,
    });

    if (!error || isAlreadyUploadedError(error)) {
      uploadedPath = attemptPath;
      lastError = null;
      break;
    }

    lastError = error;
    if (!isRetriableStorageError(error) || attempt === retries) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
  }

  if (lastError && !isRetriableStorageError(lastError) && !isAlreadyUploadedError(lastError)) {
    throw lastError;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(uploadedPath);
  return { publicUrl: data.publicUrl, storagePath: uploadedPath };
}

function storageErrorText(error: unknown): string {
  const err = error as { message?: string; error?: string; statusCode?: string | number; code?: string } | null;
  return `${err?.message ?? ''} ${err?.error ?? ''} ${err?.statusCode ?? ''} ${err?.code ?? ''}`.toLowerCase();
}

function isRetriableStorageError(error: unknown): boolean {
  const text = storageErrorText(error);
  return text.includes('timed out')
    || text.includes('timeout')
    || text.includes('databasetimeout')
    || text.includes('544')
    || text.includes('network')
    || text.includes('fetch')
    || text.includes('temporarily')
    || text.includes('503')
    || text.includes('504');
}

function isAlreadyUploadedError(error: unknown): boolean {
  const text = storageErrorText(error);
  return text.includes('already exists')
    || text.includes('resourcealreadyexists')
    || text.includes('duplicate')
    || text.includes('409');
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
