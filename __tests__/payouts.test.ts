import { hasStripeReadinessFields, isStripePayoutLocallyReady } from '../src/lib/payouts';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('payout readiness compatibility', () => {
  it('treats legacy records with only a Stripe account id as locally passable', () => {
    const legacyCompany = { stripe_account_id: 'acct_legacy' };

    expect(hasStripeReadinessFields(legacyCompany)).toBe(false);
    expect(isStripePayoutLocallyReady(legacyCompany)).toBe(true);
  });

  it('requires every readiness flag when the schema exposes readiness fields', () => {
    expect(isStripePayoutLocallyReady({
      stripe_account_id: 'acct_partial',
      stripe_details_submitted: true,
      stripe_payouts_enabled: true,
      stripe_transfers_active: false,
    })).toBe(false);

    expect(isStripePayoutLocallyReady({
      stripe_account_id: 'acct_ready',
      stripe_details_submitted: true,
      stripe_payouts_enabled: true,
      stripe_transfers_active: true,
    })).toBe(true);
  });

  it('does not allow missing profiles or legacy records without Stripe accounts', () => {
    expect(isStripePayoutLocallyReady(null)).toBe(false);
    expect(isStripePayoutLocallyReady({ stripe_account_id: null })).toBe(false);
  });

  it('keeps Stripe Connect status refresh best-effort and role-aware', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/lib/stripe-connect.ts'), 'utf8');

    expect(source).toContain("export type StripeConnectRole = 'company' | 'supplier' | 'general_contractor';");
    expect(source).toContain("supabase.functions.invoke('refresh-connect-status', options)");
    expect(source).toContain("const options = role === 'company' ? undefined : { body: { role } };");
    expect(source).toContain('return !error;');
    expect(source).toMatch(/catch \{[\s\S]*?return false;[\s\S]*?\}/);
  });
});
