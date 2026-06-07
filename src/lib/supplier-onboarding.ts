export function buildSupplierLicenseUpdatePayload(licenseNumber: string, licenseDocPath: string | null) {
  return {
    license_number: licenseNumber.trim(),
    ...(licenseDocPath ? { license_doc_url: licenseDocPath } : {}),
  };
}

