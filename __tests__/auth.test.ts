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

  it('allows general contractor as a public self-service signup role', async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'gc-user-1' },
        session: { access_token: 'token' },
      },
      error: null,
    });
    mockUpsert.mockResolvedValue({ error: null });

    await authHelpers.signUp('gc@example.com', 'password123', 'general_contractor');

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'gc@example.com',
      password: 'password123',
      options: { data: { role: 'general_contractor' } },
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      { id: 'gc-user-1', email: 'gc@example.com', role: 'general_contractor' },
      { onConflict: 'id' },
    );
  });

  it('rejects internal roles before self-service auth signup', async () => {
    await expect(authHelpers.signUp('admin@example.com', 'password123', 'admin' as any)).rejects.toThrow(
      'Unsupported self-service account role.',
    );

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
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

  it('keeps auth screen failures app-safe for every public role entry point', () => {
    const register = fs.readFileSync(path.join(__dirname, '../src/app/(auth)/register.tsx'), 'utf8');
    const login = fs.readFileSync(path.join(__dirname, '../src/app/(auth)/login.tsx'), 'utf8');

    expect(register).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(register).toContain("Alert.alert('Account details required', 'Please fill in all fields.')");
    expect(register).toContain("Alert.alert('Passwords do not match', 'Enter the same password in both password fields.')");
    expect(register).toContain("Alert.alert('Password too short', 'Password must be at least 8 characters.')");
    expect(register).toContain("Alert.alert('Registration failed', formatAppSafeErrorMessage(error, 'Could not create your account. Please try again.'))");
    expect(register).not.toContain("Alert.alert('Error', 'Please fill in all fields.')");
    expect(register).not.toContain("Alert.alert('Error', 'Passwords do not match.')");
    expect(register).not.toContain("Alert.alert('Error', 'Password must be at least 8 characters.')");
    expect(register).not.toContain('JSON.stringify(error)');
    expect(register).not.toContain('? error.message');

    expect(login).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(login).toContain("Alert.alert('Sign in details required', 'Please enter your email and password.')");
    expect(login).toContain("Alert.alert('Login failed', formatAppSafeErrorMessage(error, 'Could not sign in. Please try again.'))");
    expect(login).not.toContain("Alert.alert('Error', 'Please enter your email and password.')");
    expect(login).not.toContain('JSON.stringify(error)');
    expect(login).not.toContain('? error.message');
  });

  it('does not misclassify temporary profile load failures as missing account roles', () => {
    const rootNavigator = fs.readFileSync(path.join(__dirname, '../src/navigation/RootNavigator.tsx'), 'utf8');

    expect(rootNavigator).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(rootNavigator).toContain('const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);');
    expect(rootNavigator).toContain("setAuthErrorMessage(formatAppSafeErrorMessage(userResult.error, 'Could not load your account. Please try again.'))");
    expect(rootNavigator).toContain('Account temporarily unavailable');
    expect(rootNavigator).toContain('onPress={() => applySession(session)}');
    expect(rootNavigator).toContain('Try Again');
    expect(rootNavigator).toContain('Account setup incomplete');
    expect(rootNavigator).toContain('const handleFallbackSignOut = useCallback(async () => {');
    expect(rootNavigator).toContain('await supabase.auth.signOut();');
    expect(rootNavigator).toContain('setSession(null);');
    expect(rootNavigator).toContain('setRole(null);');
    expect(rootNavigator).toContain('resetProfile();');
    expect(rootNavigator).toContain('setAuthErrorMessage(null);');
    expect(rootNavigator).toContain('onPress={handleFallbackSignOut}');
    expect(rootNavigator).not.toContain('onPress={() => supabase.auth.signOut()}');
    expect(rootNavigator).toContain('if (!data) {');
    expect(rootNavigator).toContain('} else {\n      updateProfile({');
  });
});
