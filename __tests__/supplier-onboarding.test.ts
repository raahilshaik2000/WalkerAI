import { buildSupplierLicenseUpdatePayload } from '../src/lib/supplier-onboarding';

describe('supplier onboarding helpers', () => {
  it('only writes a supplier license document path when a new upload exists', () => {
    expect(buildSupplierLicenseUpdatePayload(' LIC-123 ', null)).toEqual({
      license_number: 'LIC-123',
    });

    expect(buildSupplierLicenseUpdatePayload(' LIC-123 ', 'supplier-licenses/user/license.jpg')).toEqual({
      license_number: 'LIC-123',
      license_doc_url: 'supplier-licenses/user/license.jpg',
    });
  });
});

