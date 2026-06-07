export const CANADIAN_PROVINCE_CODES = [
  'AB',
  'BC',
  'MB',
  'NB',
  'NL',
  'NS',
  'NT',
  'NU',
  'ON',
  'PE',
  'QC',
  'SK',
  'YT',
] as const;

export type CanadianProvinceCode = typeof CANADIAN_PROVINCE_CODES[number];

const PROVINCE_NAME_TO_CODE: Record<string, CanadianProvinceCode> = {
  alberta: 'AB',
  britishcolumbia: 'BC',
  manitoba: 'MB',
  newbrunswick: 'NB',
  newfoundlandandlabrador: 'NL',
  labrador: 'NL',
  novascotia: 'NS',
  northwestterritories: 'NT',
  nunavut: 'NU',
  ontario: 'ON',
  princeedwardisland: 'PE',
  pei: 'PE',
  quebec: 'QC',
  saskatchewan: 'SK',
  yukon: 'YT',
  yukonterritory: 'YT',
};

function compactProvinceValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

export function normalizeCanadianProvince(value: string | null | undefined): CanadianProvinceCode | '' {
  const raw = value?.trim();
  if (!raw) return '';

  const upper = raw.toUpperCase();
  const code = upper.startsWith('CA-') ? upper.slice(3) : upper;
  if (CANADIAN_PROVINCE_CODES.includes(code as CanadianProvinceCode)) {
    return code as CanadianProvinceCode;
  }

  return PROVINCE_NAME_TO_CODE[compactProvinceValue(raw)] ?? '';
}
