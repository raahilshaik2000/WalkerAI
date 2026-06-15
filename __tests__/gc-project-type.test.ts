import { formatGcProjectType, gcProjectTypeIcon } from '@/lib/gc-project-type';

describe('GC project type helpers', () => {
  it('formats room-backed and GC-specific project types', () => {
    expect(formatGcProjectType('kitchen', null)).toBe('Kitchen Renovation');
    expect(formatGcProjectType(null, 'bathroom')).toBe('Bathroom Renovation');
    expect(formatGcProjectType('flooring', null)).toBe('Flooring');
    expect(formatGcProjectType('basement', null)).toBe('Basement');
    expect(formatGcProjectType(null, null)).toBe('Renovation Project');
  });

  it('selects icons for GC-specific project types', () => {
    expect(gcProjectTypeIcon('painting', null)).toBe('format-paint');
    expect(gcProjectTypeIcon('addition', null)).toBe('home-plus-outline');
    expect(gcProjectTypeIcon(null, 'kitchen')).toBe('countertop-outline');
    expect(gcProjectTypeIcon(null, null)).toBe('home-edit-outline');
  });
});
