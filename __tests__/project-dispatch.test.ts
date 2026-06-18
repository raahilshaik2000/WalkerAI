export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

const mockRefreshSession = jest.fn();
const mockInvoke = jest.fn();

const mockSupabaseClient = {
  auth: {
    refreshSession: mockRefreshSession,
  },
  functions: {
    invoke: mockInvoke,
  },
};

let dispatchHelpers: typeof import('../src/lib/project-dispatch');

describe('project dispatch helper', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRefreshSession.mockReset();
    mockInvoke.mockReset();
    jest.doMock('../src/lib/supabase/client', () => ({
      supabase: mockSupabaseClient,
    }));
    jest.doMock('../src/lib/supabase/functions', () => ({
      formatSupabaseFunctionError: async (error: { message?: string }) => error.message ?? 'Function error',
    }));
    dispatchHelpers = require('../src/lib/project-dispatch');
  });

  it('generates slots and retries dispatch when no slots exist yet', async () => {
    mockRefreshSession.mockResolvedValue({ data: {}, error: null });
    mockInvoke
      .mockResolvedValueOnce({ data: { success: false, message: 'No slots need dispatch' }, error: null })
      .mockResolvedValueOnce({ data: { success: true, slots: [{ id: 'slot-1' }] }, error: null })
      .mockResolvedValueOnce({ data: { success: true, dispatched: 2 }, error: null });

    await expect(dispatchHelpers.restartProjectDispatch('project-1', 1)).resolves.toEqual({
      success: true,
      dispatched: 2,
    });

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'dispatch-slots', {
      body: { project_id: 'project-1', round: 1 },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'generate-trade-slots', {
      body: { project_id: 'project-1' },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'dispatch-slots', {
      body: { project_id: 'project-1', round: 1 },
    });
  });

  it('does not regenerate slots for ordinary dispatch failures', async () => {
    mockRefreshSession.mockResolvedValue({ data: {}, error: null });
    mockInvoke.mockResolvedValueOnce({ data: { success: false, message: 'No matching contractors found' }, error: null });

    await expect(dispatchHelpers.restartProjectDispatch('project-1', 1)).resolves.toEqual({
      success: false,
      message: 'No matching contractors found',
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('can regenerate slots before a homeowner-initiated restart', async () => {
    mockRefreshSession.mockResolvedValue({ data: {}, error: null });
    mockInvoke
      .mockResolvedValueOnce({ data: { success: true, slots: [{ id: 'slot-1' }] }, error: null })
      .mockResolvedValueOnce({ data: { success: true, dispatched: 3 }, error: null });

    await expect(dispatchHelpers.restartProjectDispatch('project-1', 4, { regenerateSlotsFirst: true })).resolves.toEqual({
      success: true,
      dispatched: 3,
    });

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'generate-trade-slots', {
      body: { project_id: 'project-1' },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'dispatch-slots', {
      body: { project_id: 'project-1', round: 4 },
    });
  });

  it('uses regeneration for visible homeowner restart buttons', () => {
    const canonicalDetailSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/index.tsx'),
      'utf8',
    );
    const legacyDetailSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project-detail-view.tsx'),
      'utf8',
    );

    expect(canonicalDetailSource).toContain("restartProjectDispatch(project.id, 4, { regenerateSlotsFirst: true })");
    expect(legacyDetailSource).toContain("restartProjectDispatch(project.id, 4, { regenerateSlotsFirst: true })");
    expect(canonicalDetailSource).toContain("formatAppSafeErrorMessage(data?.message, 'No verified contractors matched this project yet.')");
    expect(canonicalDetailSource).toContain("Alert.alert('Could not restart search', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(canonicalDetailSource).not.toContain("data?.message ?? 'No verified contractors matched this project yet.'");
    expect(canonicalDetailSource).not.toContain("Alert.alert('Could not restart search', err instanceof Error ? err.message : 'Please try again.')");
    expect(legacyDetailSource).toContain("formatAppSafeErrorMessage(data?.message, 'No verified contractors matched this project yet.')");
    expect(legacyDetailSource).toContain("Alert.alert('Could not restart search', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(legacyDetailSource).not.toContain("data?.message ?? 'No verified contractors matched this project yet.'");
    expect(legacyDetailSource).not.toContain("Alert.alert('Could not restart search', err instanceof Error ? err.message : 'Please try again.')");
  });
});
