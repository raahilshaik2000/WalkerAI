export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('homeowner utility screens', () => {
  it('uses app-safe copy for profile, address, and project search failures', () => {
    const editProfile = fs.readFileSync(path.join(__dirname, '../src/app/(homeowner)/edit-profile.tsx'), 'utf8');
    const savedAddresses = fs.readFileSync(path.join(__dirname, '../src/app/(homeowner)/saved-addresses.tsx'), 'utf8');
    const search = fs.readFileSync(path.join(__dirname, '../src/app/(homeowner)/search.tsx'), 'utf8');

    expect(editProfile).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(editProfile).toContain("Alert.alert('Save failed', formatAppSafeErrorMessage(err, 'Could not save profile changes.'))");
    expect(editProfile).toContain("Alert.alert('Save failed', formatAppSafeErrorMessage(err, 'Could not save profile address.'))");
    expect(editProfile).toContain("Alert.alert('Remove failed', formatAppSafeErrorMessage(err, 'Could not remove profile photo.'))");
    expect(editProfile).toContain("Alert.alert('Upload failed', formatAppSafeErrorMessage(err, 'Could not upload photo.'))");
    expect(editProfile).not.toContain("Alert.alert('Save failed', err instanceof Error ? err.message : 'Could not save profile changes.')");
    expect(editProfile).not.toContain("Alert.alert('Save failed', err instanceof Error ? err.message : 'Could not save profile address.')");
    expect(editProfile).not.toContain("Alert.alert('Remove failed', err instanceof Error ? err.message : 'Could not remove profile photo.')");
    expect(editProfile).not.toContain("Alert.alert('Upload failed', err?.message ?? 'Could not upload photo.')");

    expect(savedAddresses).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(savedAddresses).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load addresses.'))");
    expect(savedAddresses).not.toContain('setErrorMessage(error.message)');

    expect(search).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(search).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load projects.'))");
    expect(search).not.toContain('setErrorMessage(error.message)');
  });
});
