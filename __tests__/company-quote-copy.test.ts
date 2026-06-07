export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('company quote copy', () => {
  it('does not promise a homeowner response window after quote submission', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/quote-builder.tsx'),
      'utf8'
    );

    expect(source).toContain('You\\\'ll get an update when they review your quote.');
    expect(source).not.toContain('You\\\'ll hear back within 48 hours.');
  });

  it('does not silently submit payable quotes without line-item rows', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/quote-builder.tsx'),
      'utf8'
    );

    expect(source).toContain("await supabase.from('quote_line_items').insert(lineItemRows)");
    expect(source).toContain('throw new Error(`Quote line items were not saved: ${itemsError.message}`);');
    expect(source).toContain("await supabase.from('quotes').delete().eq('id', createdQuoteId)");
    expect(source).not.toContain('quote saved without line item rows');
    expect(source).not.toContain('isMissingRelationError(itemsError)');
  });
});
