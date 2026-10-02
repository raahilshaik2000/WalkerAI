export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('warranty upload screens', () => {
  it('does not promise document upload while the company picker is photo-only', () => {
    const companySource = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/warranties.tsx'),
      'utf8',
    );
    const homeownerSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/warranties.tsx'),
      'utf8',
    );

    expect(companySource).toContain("import { pickPhotosWithSource } from '@/lib/media-picker';");
    expect(companySource).toContain('const assets = await pickPhotosWithSource({');
    expect(companySource).toContain('selectionLimit: 1');
    expect(companySource).toContain('Add warranty photo');
    expect(companySource).toContain('Upload a warranty card or product coverage photo first.');
    expect(companySource).toContain('handleOpenDocument(previewUrl)');
    expect(companySource).not.toContain('void Linking.openURL(previewUrl)');
    expect(companySource).not.toContain('Add warranty document');
    expect(companySource).not.toContain('product documents for the homeowner');
    expect(homeownerSource).toContain('handleOpenDocument(previewUrl)');
    expect(homeownerSource).not.toContain('void Linking.openURL(previewUrl)');
    expect(homeownerSource).not.toContain('Warranty documents uploaded by your contractor appear here');
    expect(homeownerSource).not.toContain('or closeout documents when the project is complete');
  });

  it('uses app-safe copy for warranty load and upload failures', () => {
    const companySource = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/warranties.tsx'),
      'utf8',
    );
    const homeownerSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/warranties.tsx'),
      'utf8',
    );

    expect(companySource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(companySource).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load warranties.'))");
    expect(companySource).toContain('const clearWarrantyState = useCallback(() => {');
    expect(companySource).toContain("setErrorMessage('Project is missing. Reopen warranties from the job page.');\n      clearWarrantyState();");
    expect(companySource).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load warranties.'))");
    expect(companySource).toContain("clearWarrantyState();\n        setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load warranties.'))");
    expect(companySource).toContain("clearWarrantyState();\n      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load warranties.'))");
    expect(companySource).toContain("Alert.alert('Upload failed', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(companySource).not.toContain('setErrorMessage(error.message)');
    expect(companySource).not.toContain("Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.')");

    expect(homeownerSource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(homeownerSource).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load warranties.'))");
    expect(homeownerSource).toContain("setErrorMessage('Project is missing. Reopen warranties from the project page.');\n      setWarranties([]);\n      setPreviewUrls({});");
    expect(homeownerSource).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load warranties.'))");
    expect(homeownerSource).toContain("setWarranties([]);\n        setPreviewUrls({});\n        setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load warranties.'))");
    expect(homeownerSource).toContain("setWarranties([]);\n      setPreviewUrls({});\n      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load warranties.'))");
    expect(homeownerSource).not.toContain('setErrorMessage(error.message)');
  });
});
