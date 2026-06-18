export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('company profile services display', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/(company)/profile.tsx'), 'utf8');

  it('does not present the separate GC role as a company service', () => {
    expect(source).not.toContain('Legacy general contractor');
    expect(source).toContain("filter((trade) => trade !== 'general_contractor')");
  });

  it('does not invent a plumber service when company trade data is missing', () => {
    expect(source).not.toContain("company.trade_types?.length ? company.trade_types : ['plumber']");
    expect(source).toContain('Services not selected');
  });
});
