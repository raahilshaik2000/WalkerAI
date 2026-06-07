import { getUploadMetadata } from '../src/lib/supabase/storage';

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
});
