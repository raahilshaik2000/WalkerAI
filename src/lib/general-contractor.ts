import type { GeneralContractor } from '@/types/database.types';

export function nextGeneralContractorOnboardingRoute(
  gc: Pick<GeneralContractor, 'license_number' | 'insurance_doc_url'> | null,
): string | null {
  if (!gc) return 'GeneralContractorBusinessOnboarding';
  if (!gc.license_number) return 'GeneralContractorLicenseOnboarding';
  if (!gc.insurance_doc_url) return 'GeneralContractorInsuranceOnboarding';
  return null;
}

export function isGeneralContractorSetupComplete(
  gc: Pick<GeneralContractor, 'license_number' | 'insurance_doc_url'> | null,
) {
  return nextGeneralContractorOnboardingRoute(gc) === null;
}
