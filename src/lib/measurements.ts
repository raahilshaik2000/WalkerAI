function normalizeMetricDecimal(value: string): string {
  return value.trim().replace(/[٫٬,·•]/g, '.');
}

export function parseNonNegativeMetricQuantity(value: string): number | null {
  const normalized = normalizeMetricDecimal(value);
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function parseMetricDimension(value: string): number | null {
  const parsed = parseNonNegativeMetricQuantity(value);
  if (parsed == null || parsed <= 0) return null;
  return parsed;
}

export function isBlank(value: string | null | undefined): boolean {
  return String(value ?? '').trim().length === 0;
}

export function isValidOptionalMetricDimension(value: string | null | undefined): boolean {
  return isBlank(value) || parseMetricDimension(String(value)) != null;
}

export function isValidOptionalCount(value: string | null | undefined, max = 20): boolean {
  const normalized = String(value ?? '').trim();
  if (!normalized) return true;
  if (!/^\d+$/.test(normalized)) return false;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= max;
}

export function parseOptionalCount(value: string | null | undefined, max = 20): number | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 0;
  if (!isValidOptionalCount(normalized, max)) return null;
  return Number(normalized);
}
