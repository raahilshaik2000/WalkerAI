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

  it('submits payable quote packages through the atomic quote RPC', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/quote-builder.tsx'),
      'utf8'
    );

    expect(source).toContain("supabase.rpc('submit_company_quote'");
    expect(source).toContain('p_milestones: milestoneRows');
    expect(source).toContain('p_line_items: lineItemRows');
    expect(source).not.toContain("await supabase.from('quote_line_items').insert(lineItemRows)");
    expect(source).not.toContain("await supabase.from('quotes').delete().eq('id', createdQuoteId)");
    expect(source).not.toContain('coreQuoteSaved');
    expect(source).not.toContain('rollbackMessage');
  });

  it('lets companies replace unfunded pending quotes for GC-requested revisions', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const screenSource = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/quote-builder.tsx'),
      'utf8'
    );
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616003336_submit_company_quote_rpc.sql'),
      'utf8'
    );

    expect(screenSource).toContain("supabase.rpc('submit_company_quote'");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.submit_company_quote');
    expect(migration).toContain('q.stripe_payment_intent_id IS NOT NULL');
    expect(migration).toContain('The homeowner has already started payment for this quote');
    expect(migration).toContain('DELETE FROM public.quotes q');
    expect(migration).toContain('q.stripe_payment_intent_id IS NULL');
    expect(screenSource).not.toContain('Wait for the homeowner to review it before submitting another.');
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

  it('prefills accepted GC counteroffers into the quote total and milestone split', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/quote-builder.tsx'),
      'utf8'
    );

    expect(source).toContain('const acceptedCounterofferCents = positiveCentsParam(route.params?.accepted_counteroffer_cents);');
    expect(source).toContain('Accepted GC counteroffer');
    expect(source).toContain('defaultLineItems(acceptedCounterofferCents)');
    expect(source).toContain('defaultMilestones(acceptedCounterofferCents)');
    expect(source).toContain('defaultMilestoneSplitCents(counterofferCents, base.length)');
    expect(source).toContain('GC negotiation: ${value.trim()}');
  });
});
