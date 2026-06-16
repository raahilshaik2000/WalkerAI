const mockSignUp = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockUpsert = jest.fn();
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
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

  it('sanitizes self-service auth metadata roles before creating public user rows', () => {
    const migration = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260616004137_sanitize_auth_signup_role.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.handle_new_auth_user()');
    expect(migration).toContain("requested_role IN ('homeowner', 'company', 'supplier', 'general_contractor')");
    expect(migration).toContain("ELSE 'homeowner'");
    expect(migration).toContain('safe_role');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated');
    expect(migration).not.toContain("COALESCE(NEW.raw_user_meta_data->>'role', 'homeowner')");
    expect(migration).not.toContain("'admin'");
  });
});
