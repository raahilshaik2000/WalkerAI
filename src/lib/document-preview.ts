export type DocumentKind = 'image' | 'pdf' | 'file';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

export function documentKindFromPath(value: string | null | undefined): DocumentKind | null {
  const raw = value?.trim();
  if (!raw) return null;

  const withoutQuery = raw.split(/[?#]/)[0].replace(/\/+$/, '');
  const lastSegment = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
  let filename = lastSegment;
  try {
    filename = decodeURIComponent(lastSegment);
  } catch {
    filename = lastSegment;
  }

  const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
  if (!extension) return 'file';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (extension === 'pdf') return 'pdf';
  return 'file';
}

export function isImageDocumentPath(value: string | null | undefined) {
  return documentKindFromPath(value) === 'image';
}
