import type { GeneralContractor } from '@/types/database.types';

type GeneralContractorSetupFields = Partial<Pick<
  GeneralContractor,
  'business_name' | 'city' | 'province' | 'lat' | 'lng' | 'license_number' | 'license_doc_url' | 'insurance_doc_url'
>>;

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function nextGeneralContractorOnboardingRoute(
  gc: GeneralContractorSetupFields | null,
): string | null {
  if (!gc) return 'GeneralContractorBusinessOnboarding';
  if (!hasText(gc.business_name) || !hasText(gc.city) || !hasText(gc.province) || gc.lat == null || gc.lng == null) {
    return 'GeneralContractorBusinessOnboarding';
  }
  if (!gc.license_number || !gc.license_doc_url) return 'GeneralContractorLicenseOnboarding';
  if (!gc.insurance_doc_url) return 'GeneralContractorInsuranceOnboarding';
  return null;
}

export function isGeneralContractorSetupComplete(
  gc: GeneralContractorSetupFields | null,
) {
  return nextGeneralContractorOnboardingRoute(gc) === null;
}
