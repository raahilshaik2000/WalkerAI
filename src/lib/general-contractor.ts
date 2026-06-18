import type { GeneralContractor } from '@/types/database.types';

export type GeneralContractorDocumentKind = 'license' | 'insurance';

type GeneralContractorSetupField =
  'business_name' | 'city' | 'province' | 'lat' | 'lng' | 'license_number' | 'license_doc_url' | 'insurance_doc_url';

type GeneralContractorSetupFields = {
  [K in GeneralContractorSetupField]?: GeneralContractor[K] | null;
};

type GeneralContractorReadinessFields = GeneralContractorSetupFields & { verified?: boolean | null };

export const GENERAL_CONTRACTOR_READINESS_SELECT = 'id, verified, business_name, city, province, lat, lng, license_number, license_doc_url, insurance_doc_url';

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUrl(value: string) {
  return /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(value);
}

export function isValidGeneralContractorDocumentReference(
  value: string,
  userId: string,
  kind: GeneralContractorDocumentKind,
) {
  const trimmed = value.trim();
  if (!trimmed || !userId) return false;
  if (isHttpsUrl(trimmed)) return true;

  const parts = trimmed.split('/');
  return parts.length === 3
    && parts[0] === 'general-contractors'
    && parts[1] === userId
    && parts[2].startsWith(`${kind}-`);
}

export function nextGeneralContractorOnboardingRoute(
  gc: GeneralContractorSetupFields | null,
): string | null {
  if (!gc) return 'GeneralContractorBusinessOnboarding';
  if (!hasText(gc.business_name) || !hasText(gc.city) || !hasText(gc.province) || gc.lat == null || gc.lng == null) {
    return 'GeneralContractorBusinessOnboarding';
  }
  if (!hasText(gc.license_number) || !hasText(gc.license_doc_url)) return 'GeneralContractorLicenseOnboarding';
  if (!hasText(gc.insurance_doc_url)) return 'GeneralContractorInsuranceOnboarding';
  return null;
}

export function isGeneralContractorSetupComplete(
  gc: GeneralContractorSetupFields | null,
) {
  return nextGeneralContractorOnboardingRoute(gc) === null;
}

export function isGeneralContractorReadyForProjectControls(
  gc: GeneralContractorReadinessFields | null,
) {
  return gc?.verified === true && isGeneralContractorSetupComplete(gc);
}
