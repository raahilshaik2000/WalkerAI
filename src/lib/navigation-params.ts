export function getRequiredStringParam(params: unknown, key: string): string | null {
  if (!params || typeof params !== 'object') {
    return null;
  }

  const value = (params as Record<string, unknown>)[key];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}
