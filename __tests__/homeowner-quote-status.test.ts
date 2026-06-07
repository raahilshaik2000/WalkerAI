export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('homeowner quote status copy', () => {
  it('does not claim the whole project is active when only one multi-trade quote is paid', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/quote.tsx'),
      'utf8',
    );

    expect(source).toContain("const paidBannerText = project?.status === 'active'");
    expect(source).toContain('Payment received — fund remaining contractor quotes to start');
    expect(source).toContain('Payment received — project activation is processing');
    expect(source).toContain('<Text style={styles.paidBannerText}>{paidBannerText}</Text>');
    expect(source).not.toContain('<Text style={styles.paidBannerText}>Payment received — project is active</Text>');
  });
});
