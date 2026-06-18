declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

export {};

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry: any) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return /\.(tsx|ts)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('financial disclosure copy', () => {
  it('keeps WalkerAI markup, commission, and split details out of app UI source', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const appSources = [
      ...collectSourceFiles(path.join(repoRoot, 'src/app')),
      ...collectSourceFiles(path.join(repoRoot, 'src/components')),
      ...collectSourceFiles(path.join(repoRoot, 'src/lib/notifications')),
    ];

    const blockedCopy = [
      '% markup',
      '% concierge',
      'Commission',
      'Gross billed',
      'Gross milestone total',
      'Platform fees deducted',
      'Contractor payout is 80%; WalkerAI keeps 20%.',
      'WalkerAI records the 80/20 payout split.',
      'WalkerAI keeps',
      'Walker AI keeps',
      'revenue split',
      'payout split',
      'Management rate',
      'Concierge rate',
      'Invalid management rate',
      'Invalid concierge rate',
      'These terms are visible to the homeowner',
      'Net Earned',
      'Pending Net',
      'Net earned',
      'Net total',
      'Net paid',
      'Net Payments Received',
      'Your payout {formatCadCents(booking.contractor_payout_cents)}',
      'WalkerAI {formatCadCents(booking.walker_fee_cents)}',
      'contractor_payout_cents',
      'walker_fee_cents',
      'commission_rate',
      'companyEstimatedNetPayoutCents',
      'materialOrderNetPayoutCents',
      'platform_fee_pct',
      'Estimated Supplier Payout',
      'Supplier Payout',
    ];

    const violations = appSources.flatMap((filePath: string) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return blockedCopy
        .filter((copy) => source.includes(copy))
        .map((copy) => `${path.relative(repoRoot, filePath)}: ${copy}`);
    });

    expect(violations).toEqual([]);
  });
});
