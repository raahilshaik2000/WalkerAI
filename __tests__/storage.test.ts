import { getUploadMetadata } from '../src/lib/supabase/storage';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('storage upload metadata', () => {
  it('keeps the picker MIME type and matching extension when available', () => {
    const metadata = getUploadMetadata({
      uri: 'file:///tmp/photo.HEIF',
      fileName: 'photo.HEIF',
      type: 'image/heif',
    });

    expect(metadata).toEqual({
      uri: 'file:///tmp/photo.HEIF',
      extension: 'heif',
      contentType: 'image/heif',
    });
  });

  it('infers content type from filename when the picker omits MIME type', () => {
    const metadata = getUploadMetadata({
      uri: 'file:///tmp/license.png',
      fileName: 'license.png',
    });

    expect(metadata.extension).toBe('png');
    expect(metadata.contentType).toBe('image/png');
  });

  it('falls back to jpeg for extensionless camera assets', () => {
    const metadata = getUploadMetadata({ uri: 'file:///tmp/camera-output' });

    expect(metadata.extension).toBe('jpg');
    expect(metadata.contentType).toBe('image/jpeg');
  });

  it('normalizes image/jpg to image/jpeg for Supabase bucket validation', () => {
    const metadata = getUploadMetadata({
      uri: 'file:///tmp/photo.jpg',
      type: 'image/jpg',
    });

    expect(metadata.extension).toBe('jpg');
    expect(metadata.contentType).toBe('image/jpeg');
  });

  it('requires a local file URI', () => {
    expect(() => getUploadMetadata({ fileName: 'missing.jpg' })).toThrow('file URI');
  });

  it('uses non-upsert base64 uploads with retry guards for public project photo buckets', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/lib/supabase/storage.ts'), 'utf8');

    expect(source).toContain('interface UploadBase64Options {');
    expect(source).toContain('upsert?: boolean;');
    expect(source).toContain('const retries = Math.max(1, options.retries ?? 3);');
    expect(source).toContain('upsert: options.upsert ?? false');
    expect(source).toContain('uniquePathOnRetry?: boolean');
    expect(source).toContain('function attemptStoragePath');
    expect(source).toContain('function isRetriableStorageError(error: unknown): boolean');
    expect(source).toContain('function isAlreadyUploadedError(error: unknown): boolean');
    expect(source).toContain('export async function uploadPickerAsset');
  });
});
