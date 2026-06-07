const mockSignUp = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockUpsert = jest.fn();
const mockSupabaseClient = {
  auth: {
    signUp: mockSignUp,
    signInWithPassword: mockSignInWithPassword,
  },
  from: jest.fn(() => ({
    upsert: mockUpsert,
  })),
};

let authHelpers: typeof import('../src/lib/supabase/auth');

describe('Supabase auth helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSignUp.mockReset();
    mockSignInWithPassword.mockReset();
    mockUpsert.mockReset();
    jest.doMock('../src/lib/supabase/client', () => ({
      supabase: mockSupabaseClient,
    }));
    authHelpers = require('../src/lib/supabase/auth');
  });

  it('normalizes registration email before auth and public user upsert', async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-1' },
        session: { access_token: 'token' },
      },
      error: null,
    });
    mockUpsert.mockResolvedValue({ error: null });

    await authHelpers.signUp('  TEST@Example.COM ', 'password123', 'homeowner');

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
      options: { data: { role: 'homeowner' } },
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      { id: 'user-1', email: 'test@example.com', role: 'homeowner' },
      { onConflict: 'id' },
    );
  });

  it('normalizes login email before signing in', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { session: null }, error: null });

    await authHelpers.signIn('  TEST@Example.COM ', 'password123');

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });
});
