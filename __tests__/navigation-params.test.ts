import { getRequiredStringParam } from '@/lib/navigation-params';

describe('getRequiredStringParam', () => {
  it('returns trimmed non-empty string params', () => {
    expect(getRequiredStringParam({ id: '  project-123 ' }, 'id')).toBe('project-123');
  });

  it('rejects missing, empty, or non-string params', () => {
    expect(getRequiredStringParam(undefined, 'id')).toBeNull();
    expect(getRequiredStringParam({}, 'id')).toBeNull();
    expect(getRequiredStringParam({ id: '' }, 'id')).toBeNull();
    expect(getRequiredStringParam({ id: '   ' }, 'id')).toBeNull();
    expect(getRequiredStringParam({ id: 123 }, 'id')).toBeNull();
  });
});
