export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('homeowner quote status copy', () => {
  it('shows submitted quotes as ready for homeowner review on project cards', () => {
    const carouselSource = fs.readFileSync(
      path.join(__dirname, '../src/components/dashboard/ProjectsCarousel.tsx'),
      'utf8',
    );
    const projectsSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/projects.tsx'),
      'utf8',
    );

    expect(carouselSource).toContain("quoting:     { label: 'Price ready'");
    expect(carouselSource).toContain("if (status === 'quoting') {\n    return 'Price ready to review';\n  }");
    expect(projectsSource).toContain("quoting:     { label: 'Price ready'");
    expect(projectsSource).toContain("quoting:     'Price ready to review'");
  });

  it('shows master-total price and Pay to WalkerAI CTA on the quote screen', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/quote.tsx'),
      'utf8',
    );
    const homeownerData = fs.readFileSync(
      path.join(__dirname, '../src/lib/homeowner-data.ts'),
      'utf8',
    );

    expect(homeownerData).toContain('master_total_cents: number | null;');
    expect(homeownerData).toContain('export async function fetchHomeownerProjectQuote(projectId: string)');
    expect(source).toContain('const quoteQuery = useHomeownerProjectQuote(projectId ?? undefined);');
    expect(source).toContain('const isFunded = project?.payment_status === \'funded\';');
    expect(source).toContain("Pay ${formatCad(masterTotal)} to WalkerAI");
    expect(source).toContain('const canPayMaster = !isFunded && allTradesJoined && masterTotal > 0;');
    expect(source).not.toContain('stripe_payment_intent_id: string | null;');
    expect(source).not.toContain("quote ? 'Selected Contractor Quote' : 'WalkerAI Estimate'");
  });

  it('does not present contractor pricing as a fixed AI price', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/quote.tsx'),
      'utf8',
    );

    expect(source).toContain('ai_cost_min');
    expect(source).toContain('ai_cost_max');
    expect(source).not.toContain('Walker AI Fixed Price');
    expect(source).not.toContain('Set by AI · confirmed by your contractor');
  });

  it('shows funded escrow banner when project is paid', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/quote.tsx'),
      'utf8',
    );

    expect(source).toContain("Paid — held in escrow");
    expect(source).toContain("Payment submitted");
    expect(source).toContain('<Text style={styles.paidBannerText}>');
    expect(source).not.toContain("Payment received — fund remaining contractor quotes to start");
  });

  it('uses app-safe copy for quote funding screen load failures', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/quote.tsx'),
      'utf8',
    );
    const homeownerData = fs.readFileSync(
      path.join(__dirname, '../src/lib/homeowner-data.ts'),
      'utf8',
    );

    expect(source).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';");
    expect(source).toContain("formatAppSafeErrorMessage(quoteQuery.error, 'Could not load project breakdown.')");
    expect(homeownerData).toContain('if (projectError) throw projectError;');
    expect(homeownerData).toContain('if (slotsError) throw slotsError;');
    expect(source).toContain('await quoteQuery.refetch();');
    expect(source).not.toContain('setErrorMessage(projectError.message)');
  });

  it('shows quote review and funding card on project-detail-view when quote is submitted', () => {
    const detailSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project-detail-view.tsx'),
      'utf8',
    );

    expect(detailSource).toContain("['accepted', 'quoting', 'scheduling'].includes(project.status) && project.payment_status !== 'funded'");
    expect(detailSource).toContain("project.status === 'quoting' ? 'QUOTE SUBMITTED' : 'TRADE ASSIGNED'");
    expect(detailSource).toContain('Your contractor has submitted their quote. Review your project breakdown to fund escrow.');
    expect(detailSource).toContain("title: 'Quote submitted for review'");
    expect(detailSource).toContain('Funds are held securely in Stripe Escrow and released to each trade only after you approve their completed work.');
  });

  it('renders submitted contractor quote details and funding CTA on quote screen', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/quote.tsx'),
      'utf8',
    );
    const homeownerData = fs.readFileSync(
      path.join(__dirname, '../src/lib/homeowner-data.ts'),
      'utf8',
    );

    expect(homeownerData).toContain('export interface HomeownerSubmittedQuote');
    expect(homeownerData).toContain('quotes: HomeownerSubmittedQuote[];');
    expect(source).toContain("const quotes = quoteQuery.data?.quotes ?? [];");
    expect(source).toContain("const pendingQuote = quotes.find((q) => q.status === 'pending') ?? null;");
    expect(source).toContain("const canPayQuote = !isFunded && !!pendingQuote && pendingQuote.total_amount > 0;");
    expect(source).toContain("Fund Quote ${formatCad(pendingQuote.total_amount)} (Stripe Escrow)");
    expect(source).toContain('handlePayQuote(pendingQuote.id, pendingQuote.total_amount)');
    expect(source).toContain('Scope & Line Items');
    expect(source).toContain('Payment Milestones');
  });

  it('shows quote review and Stripe Escrow funding card on main project detail screen', () => {
    const mainDetailSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(mainDetailSource).toContain('hasPendingQuote');
    expect(mainDetailSource).toContain("project.status === 'quoting' || hasPendingQuote ? 'QUOTE SUBMITTED' : 'TRADE ASSIGNED'");
    expect(mainDetailSource).toContain('Your contractor has submitted their quote. Review your project breakdown to fund escrow.');
    expect(mainDetailSource).toContain('Funds are held securely in Stripe Escrow and released to each trade only after you approve their completed work.');
    expect(mainDetailSource).toContain("navigation.navigate('Quote', { id: project.id })");
    expect(mainDetailSource).toContain('Review Quote & Fund Escrow (Stripe Escrow)');
  });
});

