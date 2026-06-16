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
    const baseMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616003336_submit_company_quote_rpc.sql'),
      'utf8'
    );
    const revisionMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616011036_preserve_gc_negotiations_on_quote_revision.sql'),
      'utf8'
    );
    const migration = `${baseMigration}\n${revisionMigration}`;

    expect(screenSource).toContain("supabase.rpc('submit_company_quote'");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.submit_company_quote');
    expect(migration).toContain('q.stripe_payment_intent_id IS NOT NULL');
    expect(migration).toContain('The homeowner has already started payment for this quote');
    expect(migration).toContain('DELETE FROM public.quotes q');
    expect(migration).toContain('q.stripe_payment_intent_id IS NULL');
    expect(screenSource).not.toContain('Wait for the homeowner to review it before submitting another.');
  });

  it('shows funded quotes read-only instead of an empty rebuild form', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/quote-builder.tsx'),
      'utf8'
    );

    expect(source).toContain(".or('status.eq.approved,stripe_payment_intent_id.not.is.null')");
    expect(source).toContain('Approved Quote');
    expect(source).toContain('This quote is already funded. Price changes after funding should be submitted as change orders.');
    expect(source).toContain('setApprovedLineItems');
    expect(source).toContain('setApprovedMilestones');
    expect(source).toContain('Back to Job');
  });

  it('shows payment-started pending quotes read-only before the server rejects revisions', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/quote-builder.tsx'),
      'utf8'
    );
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616003336_submit_company_quote_rpc.sql'),
      'utf8'
    );

    expect(source).toContain('stripe_payment_intent_id: string | null;');
    expect(source).toContain("const paymentStarted = approvedQuote.status === 'pending' && !!approvedQuote.stripe_payment_intent_id;");
    expect(source).toContain("paymentStarted ? 'Payment Started' : 'Approved Quote'");
    expect(source).toContain("paymentStarted ? 'Quote payment in progress' : 'Funded quote'");
    expect(source).toContain('The homeowner has already started payment for this quote. Ask them to reject it before submitting a revision.');
    expect(migration).toContain('The homeowner has already started payment for this quote. Ask them to reject it before submitting a revision.');
  });

  it('only labels the company quote action as approved when an approved quote exists', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/index.tsx'),
      'utf8'
    );

    expect(source).toContain('const [hasApprovedQuote, setHasApprovedQuote] = useState(false);');
    expect(source).toContain(".from('quotes')");
    expect(source).toContain(".eq('status', 'approved')");
    expect(source).toContain('setHasApprovedQuote(!!approvedQuoteResult.data);');
    expect(source).toContain("meta: hasApprovedQuote ? 'View approved' : 'Build quote'");
    expect(source).not.toContain("meta: job.status === 'active' ? 'View approved' : 'Build quote'");
  });

  it('does not promise an unsupported 48 hour quote deadline when accepting a job', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/index.tsx'),
      'utf8'
    );

    expect(source).toContain('By accepting, you agree to submit a detailed quote before the homeowner can approve pricing.');
    expect(source).not.toContain('By accepting, you agree to submit a detailed quote within 48 hours.');
  });

  it('preserves GC negotiation history when revised quotes replace pending quotes', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616011036_preserve_gc_negotiations_on_quote_revision.sql'),
      'utf8'
    );
    const gcTrades = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/trades.tsx'),
      'utf8'
    );

    expect(migration).toContain('v_replaced_quote_ids UUID[]');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_trade_negotiation_updates');
    expect(migration).toContain('IF NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN');
    expect(migration).toContain('GC trade negotiation quote links can only move to a replacement pending quote for the same trade');
    expect(migration).toContain("q.status = 'pending'");
    expect(migration).toContain('SELECT COALESCE(array_agg(q.id), ARRAY[]::UUID[])');
    expect(migration).toContain("SET status = 'rejected'");
    expect(migration).toContain('UPDATE public.gc_trade_quote_negotiations negotiation');
    expect(migration).toContain('SET quote_id = v_quote_id');
    expect(migration).toContain('WHERE negotiation.quote_id = ANY(v_replaced_quote_ids)');
    expect(migration).toContain('DELETE FROM public.quotes q');
    expect(migration.indexOf('UPDATE public.gc_trade_quote_negotiations negotiation')).toBeLessThan(
      migration.indexOf('DELETE FROM public.quotes q')
    );
    expect(gcTrades).toContain('const negotiationsByQuote = useMemo');
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
