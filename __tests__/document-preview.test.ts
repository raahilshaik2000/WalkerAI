import { documentKindFromPath, isImageDocumentPath } from '../src/lib/document-preview';

describe('document preview helpers', () => {
  it('detects image documents from paths and signed URLs', () => {
    expect(documentKindFromPath('project-1/permit.jpg')).toBe('image');
    expect(documentKindFromPath('https://example.com/object/sign/warranties/card.PNG?token=abc')).toBe('image');
    expect(documentKindFromPath('project-1/photo.heic#preview')).toBe('image');
    expect(isImageDocumentPath('project-1/photo.webp')).toBe(true);
  });

  it('detects PDF documents before query strings', () => {
    expect(documentKindFromPath('project-1/permit.pdf?token=abc')).toBe('pdf');
    expect(documentKindFromPath('https://example.com/object/sign/permits/permit%20scan.PDF?token=abc')).toBe('pdf');
  });

  it('falls back safely for unknown files and empty values', () => {
    expect(documentKindFromPath('project-1/archive.docx')).toBe('file');
    expect(documentKindFromPath('project-1/upload')).toBe('file');
    expect(documentKindFromPath(null)).toBeNull();
    expect(documentKindFromPath('   ')).toBeNull();
  });
});
