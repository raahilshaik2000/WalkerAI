export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('project creation flow guards', () => {
  it('collects address before generating the province-aware brief', () => {
    const rendersSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/renders.tsx'),
      'utf8',
    );
    const addressSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/address.tsx'),
      'utf8',
    );
    const briefSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/brief.tsx'),
      'utf8',
    );

    expect(rendersSource).toContain("navigation.navigate('Address')");
    expect(addressSource).toContain("navigation.navigate('Brief')");
    expect(briefSource).toContain("navigation.navigate('Confirm')");
    expect(briefSource).toContain("throw new Error('Project province is missing.");
    expect(briefSource).not.toContain("normalizeCanadianProvince(province) || 'ON'");
  });

  it('keeps voice address input behind geocoded address selection', () => {
    const addressSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/address.tsx'),
      'utf8',
    );
    const autocompleteSource = fs.readFileSync(
      path.join(__dirname, '../src/components/ui/AddressAutocomplete.tsx'),
      'utf8',
    );

    expect(addressSource).toContain('handleVoiceAddressSearch');
    expect(addressSource).toContain('listenForProjectAnswer(9)');
    expect(addressSource).toContain('voiceQuery={voiceQuery}');
    expect(addressSource).toContain('Please select a suggested address from the list');
    expect(addressSource).not.toContain('setAddress(transcript');
    expect(addressSource).not.toContain('address: transcript');
    expect(autocompleteSource).toContain('voiceQueryKey');
    expect(autocompleteSource).toContain('nominatim.openstreetmap.org/search');
    expect(autocompleteSource).not.toContain('FlatList');
    expect(autocompleteSource).toContain('results.map((item, index)');
  });

  it('disables voice controls when the native voice module is unavailable', () => {
    const questionnaireSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );
    const addressSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/address.tsx'),
      'utf8',
    );

    expect(questionnaireSource).toContain('const voiceAvailable = isProjectVoiceAvailable();');
    expect(questionnaireSource).toContain('disabled={voiceBusy || !voiceAvailable || !!pendingVoiceMatch}');
    expect(questionnaireSource).toContain('Voice unavailable on this device');
    expect(questionnaireSource).toContain('Tap an answer manually to continue.');

    expect(addressSource).toContain('const voiceAvailable = isProjectVoiceAvailable();');
    expect(addressSource).toContain('disabled={voiceBusy || loading || !voiceAvailable}');
    expect(addressSource).toContain('Voice unavailable on this device');
    expect(addressSource).toContain('Type your address and select a suggested match.');
  });

  it('uses app-safe copy for voice address, address save, and dispatch failures', () => {
    const addressSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/address.tsx'),
      'utf8',
    );
    const confirmSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/confirm.tsx'),
      'utf8',
    );

    expect(addressSource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(addressSource).toContain("Alert.alert('Voice address failed', formatAppSafeErrorMessage(err, 'Please try again or type your address manually.'))");
    expect(addressSource).toContain("Alert.alert('Error', formatAppSafeErrorMessage(err, 'Could not save the project address. Please try again.'))");
    expect(addressSource).not.toContain("Alert.alert('Voice address failed', err instanceof Error ? err.message : 'Please try again or type your address manually.')");
    expect(addressSource).not.toContain("Alert.alert('Error', msg)");
    expect(addressSource).not.toContain('err?.details || err?.hint');

    expect(confirmSource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(confirmSource).toContain("Alert.alert('Dispatch failed', formatAppSafeErrorMessage(err, 'Could not send this project to contractors. Please try again.'))");
    expect(confirmSource).not.toContain("Alert.alert('Dispatch failed', err instanceof Error ? err.message : 'Please try again.')");
  });

  it('uses app-safe copy for project creation voice, render, and brief failures', () => {
    const questionnaireSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );
    const rendersSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/renders.tsx'),
      'utf8',
    );
    const briefSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/brief.tsx'),
      'utf8',
    );

    expect(questionnaireSource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(questionnaireSource).toContain("setVoiceError(formatAppSafeErrorMessage(err, 'Voice answer failed. Try again or answer manually.'))");
    expect(questionnaireSource).not.toContain("setVoiceError(err instanceof Error ? err.message : 'Voice answer failed. Try again or answer manually.')");

    expect(rendersSource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(rendersSource).toContain("setRenderError(visualPreviewUnavailableMessage(formatAppSafeErrorMessage(err, 'Render generation failed.')))");
    expect(rendersSource).not.toContain("visualPreviewUnavailableMessage(err instanceof Error ? err.message : 'Render generation failed.')");

    expect(briefSource).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';");
    expect(briefSource).toContain("setError(formatAppSafeErrorMessage(err, 'Failed to generate brief.'))");
    expect(briefSource).toContain("setError(formatAppSafeErrorMessage(err, 'Failed to save material details.'))");
    expect(briefSource).not.toContain("setError(err instanceof Error ? err.message : 'Failed to generate brief.')");
    expect(briefSource).not.toContain("setError(err instanceof Error ? err.message : 'Failed to save material details.')");
  });
});
