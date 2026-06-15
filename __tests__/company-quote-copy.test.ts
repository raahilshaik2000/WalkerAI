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

  it('lets companies replace unfunded pending quotes for GC-requested revisions', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/quote-builder.tsx'),
      'utf8'
    );

    expect(source).toContain('stripe_payment_intent_id');
    expect(source).toContain('The homeowner has already started payment for this quote');
    expect(source).toContain("await supabase\n          .from('quotes')\n          .delete()");
    expect(source).not.toContain('Wait for the homeowner to review it before submitting another.');
  });

  it('offers a cents-safe milestone split to prevent quote total mismatch errors', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/quote-builder.tsx'),
      'utf8'
    );

    expect(source).toContain('function defaultMilestoneSplitCents');
    expect(source).toContain('totalAmountCents - deposit - roughIn');
    expect(source).toContain(`const splitLabel = milestones.length === 3 ? 'Split total 30/40/30' : 'Split total evenly';`);
    expect(source).toContain('onPress={applyDefaultMilestoneSplit}');
    expect(source).toContain('Enter line item amounts before splitting milestones.');
    expect(source).toContain('const milestoneBalanceCents = quoteTotalCents - milestoneTotalCents;');
    expect(source).toContain('const milestoneTotalsMatch = quoteTotalCents > 0 && Math.abs(milestoneBalanceCents) <= 1;');
    expect(source).toContain('<Text style={styles.milestoneSummaryLabel}>Balance</Text>');
    expect(source).toContain('disabled={totalDollars <= 0 || !milestoneTotalsMatch}');
  });
});
