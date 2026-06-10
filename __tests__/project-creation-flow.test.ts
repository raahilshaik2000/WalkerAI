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
});
