export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('project review closeout screens', () => {
  it('surfaces homeowner review target load errors instead of showing an empty contractor state', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/review.tsx'),
      'utf8',
    );

    expect(source).toContain('const [targetError, setTargetError]');
    expect(source).toContain('const loadError = quotesRes.error ?? slotsRes.error ?? legacyRes.error');
    expect(source).toContain('setTargetError(loadError.message)');
    expect(source).toContain('Could not load contractors');
    expect(source).toContain("disabled={!!targetError || !selectedTarget || projectStatus !== 'completed'}");
  });
});
