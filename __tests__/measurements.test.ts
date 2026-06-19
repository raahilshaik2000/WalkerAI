import {
  isValidOptionalCount,
  isValidOptionalMetricDimension,
  parseNonNegativeMetricQuantity,
  parseMetricDimension,
  parseOptionalCount,
} from '../src/lib/measurements';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('measurement parsing', () => {
  it('accepts positive metric dimensions with common decimal separators', () => {
    expect(parseMetricDimension('4.2')).toBe(4.2);
    expect(parseMetricDimension('  3,5  ')).toBe(3.5);
    expect(parseMetricDimension('2·7')).toBe(2.7);
  });

  it('rejects malformed, negative, and empty dimensions', () => {
    expect(parseMetricDimension('12abc')).toBeNull();
    expect(parseMetricDimension('1.2.3')).toBeNull();
    expect(parseMetricDimension('-4')).toBeNull();
    expect(parseMetricDimension('0')).toBeNull();
    expect(parseMetricDimension('')).toBeNull();
  });

  it('accepts non-negative material quantities with common decimal separators', () => {
    expect(parseNonNegativeMetricQuantity('0')).toBe(0);
    expect(parseNonNegativeMetricQuantity('12')).toBe(12);
    expect(parseNonNegativeMetricQuantity('3,25')).toBe(3.25);
    expect(parseNonNegativeMetricQuantity('4·5')).toBe(4.5);
  });

  it('rejects malformed, negative, and empty material quantities', () => {
    expect(parseNonNegativeMetricQuantity('12abc')).toBeNull();
    expect(parseNonNegativeMetricQuantity('1.2.3')).toBeNull();
    expect(parseNonNegativeMetricQuantity('-4')).toBeNull();
    expect(parseNonNegativeMetricQuantity('')).toBeNull();
  });

  it('validates optional dimension inputs without accepting malformed text', () => {
    expect(isValidOptionalMetricDimension('')).toBe(true);
    expect(isValidOptionalMetricDimension('4.5')).toBe(true);
    expect(isValidOptionalMetricDimension('4ft')).toBe(false);
    expect(isValidOptionalMetricDimension('0')).toBe(false);
  });

  it('validates optional count inputs as safe non-negative integers', () => {
    expect(isValidOptionalCount('')).toBe(true);
    expect(isValidOptionalCount('0')).toBe(true);
    expect(isValidOptionalCount('12')).toBe(true);
    expect(isValidOptionalCount('2.5')).toBe(false);
    expect(isValidOptionalCount('21')).toBe(false);
  });

  it('parses optional counts strictly for generated room layouts', () => {
    expect(parseOptionalCount('')).toBe(0);
    expect(parseOptionalCount('0')).toBe(0);
    expect(parseOptionalCount('12')).toBe(12);
    expect(parseOptionalCount(' 3 ')).toBe(3);
    expect(parseOptionalCount('1.5')).toBeNull();
    expect(parseOptionalCount('2abc')).toBeNull();
    expect(parseOptionalCount('21')).toBeNull();
  });

  it('uses shared decimal parsing for project brief measurement presence checks', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/brief.tsx'),
      'utf8',
    );

    expect(source).toContain("import { parseMetricDimension } from '@/lib/measurements'");
    expect(source).toContain("return parseMetricDimension(String(value ?? '')) != null;");
    expect(source).not.toContain('Number(String(value ??');
  });

  it('uses strict parsing on the generated manual room layout screen', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/manual-measurement.tsx'),
      'utf8',
    );

    expect(source).toContain("import { isBlank, parseMetricDimension, parseOptionalCount } from '@/lib/measurements'");
    expect(source).toContain('const parsedDoors = parseOptionalCount(doorCount);');
    expect(source).toContain('const parsedWindows = parseOptionalCount(windowCount);');
    expect(source).toContain("if (!isBlank(height) && parsedHeight == null)");
    expect(source).not.toContain('Number.parseInt');
  });

  it('guards skip measurements from duplicate analysis navigation', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/measurements.tsx'),
      'utf8',
    );

    expect(source).toContain('const [submitting, setSubmitting] = useState(false);');
    expect(source).toContain('if (submitting) return;');
    expect(source).toContain('setSubmitting(true);');
    expect(source).toContain("navigation.navigate('Analyzing', { measurementsSkipped: true })");
    expect(source).toContain("navigation.navigate('Analyzing', { measurementsSkipped: false })");
    expect(source).toContain('disabled={submitting}');
    expect(source).toContain('style={[styles.skipBtn, submitting && styles.skipBtnDisabled]}');
  });
});
