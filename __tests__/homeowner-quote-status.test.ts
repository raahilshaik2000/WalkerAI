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

  it('does not present contractor pricing as a fixed AI price', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/quote.tsx'),
      'utf8',
    );

    expect(source).toContain("quote ? 'Selected Contractor Quote' : 'WalkerAI Estimate'");
    expect(source).toContain('const headlinePrice = quote?.total_amount');
    expect(source).toContain('Project estimate: ${projectEstimate}');
    expect(source).toContain("{quote.company_name ?? 'Contractor'} quote");
    expect(source).not.toContain('Walker AI Fixed Price');
    expect(source).not.toContain('Set by AI · confirmed by your contractor');
  });

  it('labels payment-started pending quotes as a continuation instead of a fresh payment', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/quote.tsx'),
      'utf8',
    );

    expect(source).toContain('stripe_payment_intent_id: string | null;');
    expect(source).toContain('submitted_at, stripe_payment_intent_id, companies(name)');
    expect(source).toContain("if (quote.status === 'pending' && quote.stripe_payment_intent_id) return 'Payment started';");
    expect(source).toContain('const paymentStarted = quote?.status === \'pending\' && !!quote.stripe_payment_intent_id;');
    expect(source).toContain('paymentStarted ? `Continue Payment — ${formatCad(quote.total_amount)}` : `Pay ${formatCad(quote.total_amount)} to Start`');
  });
});
