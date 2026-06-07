import { SUPPLIER_CATEGORIES, type SupplierCategory } from '@/constants/enums';
export { parsePositiveCadToCents } from '@/lib/currency';

const SUPPLIER_CATEGORY_VALUES = SUPPLIER_CATEGORIES as readonly string[];

export function selectedSupplierCategories(value: unknown): SupplierCategory[] {
  if (!Array.isArray(value)) return [];
  return value.filter((category): category is SupplierCategory =>
    typeof category === 'string' &&
    SUPPLIER_CATEGORY_VALUES.includes(category)
  );
}

export function nextCatalogSetupRoute(supplier: { license_number: string | null; categories: unknown } | null): string | null {
  if (!supplier) return 'SupplierBusinessOnboarding';
  if (!supplier.license_number) return 'SupplierLicenseOnboarding';
  if (selectedSupplierCategories(supplier.categories).length === 0) return 'SupplierCategoriesOnboarding';
  return null;
}

export function parseNonNegativeDays(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return Number.isSafeInteger(days) ? days : null;
}
