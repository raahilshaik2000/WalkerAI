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

function uploadWithProgress(
  bucket: StorageBucket,
  path: string,
  blob: Blob,
  contentType: string,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const supabaseUrl = Config.SUPABASE_URL!;
    const supabaseKey = Config.SUPABASE_ANON_KEY!;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${supabaseKey}`);
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
