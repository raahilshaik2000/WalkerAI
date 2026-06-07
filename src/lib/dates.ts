export function isValidIsoDate(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;

  const [year, month, day] = trimmed.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function normalizeOptionalIsoDate(value: string, label = 'date'): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isValidIsoDate(trimmed)) {
    throw new Error(`Enter ${label} as a valid YYYY-MM-DD date, or leave it blank.`);
  }
  return trimmed;
}
