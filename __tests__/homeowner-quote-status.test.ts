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

    expect(carouselSource).toContain("quoting:     { label: 'Quote ready'");
    expect(carouselSource).toContain("if (status === 'quoting') {\n    return 'Quote ready to review';\n  }");
    expect(projectsSource).toContain("quoting:     { label: 'Quote ready'");
    expect(projectsSource).toContain("quoting:     'Quote ready to review'");
  });

  it('shows master-total price and Pay to WalkerAI CTA on the quote screen', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/quote.tsx'),
      'utf8',
    );

    expect(source).toContain('master_total_cents: number | null;');
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
    expect(source).toContain("Payment received");
    expect(source).toContain('<Text style={styles.paidBannerText}>');
    expect(source).not.toContain("Payment received — fund remaining contractor quotes to start");
  });

  it('uses app-safe copy for quote funding screen load failures', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/quote.tsx'),
      'utf8',
    );

    expect(source).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(projectError, 'Could not load quote.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load quote.'))");
    expect(source).toContain("} finally {\n      setLoading(false);");
    expect(source).not.toContain('setErrorMessage(projectError.message)');
  });
});
