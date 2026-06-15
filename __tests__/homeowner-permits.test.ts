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
});
