export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('homeowner permit documents', () => {
  it('opens signed permit documents through a handled action', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/permits.tsx'),
      'utf8',
    );

    expect(source).toContain('handleOpenDocument(previewUrl)');
    expect(source).toContain('Unable to open document');
    expect(source).not.toContain('void Linking.openURL(previewUrl)');
  });

  it('keeps permit load and upload errors app-safe', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/permits.tsx'),
      'utf8',
    );

    expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load permits.'))");
    expect(source).toContain("setPermits([]);\n        setPreviewUrls({});\n        return;");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load permits.'))");
    expect(source).toContain("setPermits([]);\n      setPreviewUrls({});");
    expect(source).toContain("Alert.alert('Upload failed', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(source).toContain('uploadPickerAsset');
    expect(source).toContain('Replace photo / document');
    expect(source).toContain('Add permit / inspection');
    expect(source).not.toContain('setErrorMessage(`Could not load permits: ${error.message}`)');
    expect(source).not.toContain("Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.')");
  });
});
