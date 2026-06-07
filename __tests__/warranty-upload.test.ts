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

    expect(companySource).toContain("mediaType: 'photo'");
    expect(companySource).toContain('Add warranty photo');
    expect(companySource).toContain('Upload a warranty card or product coverage photo first.');
    expect(companySource).not.toContain('Add warranty document');
    expect(companySource).not.toContain('product documents for the homeowner');
    expect(homeownerSource).not.toContain('Warranty documents uploaded by your contractor appear here');
    expect(homeownerSource).not.toContain('or closeout documents when the project is complete');
  });
});
