declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

export {};

describe('change-order workflow copy', () => {
  it('does not imply signed cost deltas automatically change funded escrow', () => {
    const companyChangeOrders = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/change-orders.tsx'),
      'utf8',
    );
    const homeownerChangeOrders = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/change-orders.tsx'),
      'utf8',
    );

    expect(homeownerChangeOrders).not.toContain('This will adjust the project cost by');
    expect(homeownerChangeOrders).toContain('does not automatically update funded escrow or milestone payments');
    expect(homeownerChangeOrders).toContain('does not automatically change funded escrow or milestone payments');
    expect(homeownerChangeOrders).toContain('Documented cost change');
    expect(companyChangeOrders).toContain('funded escrow and milestone payments are not updated automatically');
    expect(companyChangeOrders).toContain('Documented only; escrow is not adjusted automatically.');
  });
});
