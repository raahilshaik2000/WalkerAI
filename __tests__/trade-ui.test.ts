export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('trade UI components', () => {
  const repoRoot = path.resolve(__dirname, '..');

  it('keeps metric values on one line so currency totals do not wrap mid-number', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/components/company/TradeUI.tsx'),
      'utf8',
    );

    expect(source).toContain('numberOfLines={1}');
    expect(source).toContain('adjustsFontSizeToFit');
    expect(source).toContain('minimumFontScale={0.7}');
    expect(source).toContain('minWidth: 0');
  });
});
