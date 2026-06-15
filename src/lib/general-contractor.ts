import type { GeneralContractor } from '@/types/database.types';

export function nextGeneralContractorOnboardingRoute(
  gc: Pick<GeneralContractor, 'license_number' | 'license_doc_url' | 'insurance_doc_url'> | null,
): string | null {
  if (!gc) return 'GeneralContractorBusinessOnboarding';
  if (!gc.license_number || !gc.license_doc_url) return 'GeneralContractorLicenseOnboarding';
  if (!gc.insurance_doc_url) return 'GeneralContractorInsuranceOnboarding';
  return null;
}

export function isGeneralContractorSetupComplete(
  gc: Pick<GeneralContractor, 'license_number' | 'license_doc_url' | 'insurance_doc_url'> | null,
) {
  return nextGeneralContractorOnboardingRoute(gc) === null;
}
