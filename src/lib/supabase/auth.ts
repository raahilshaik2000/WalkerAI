import { supabase } from './client';
import type { PublicSignupRole } from '@/constants/enums';

const PUBLIC_SIGNUP_ROLES: readonly PublicSignupRole[] = ['homeowner', 'company', 'supplier', 'general_contractor'];

function assertPublicSignupRole(role: string): asserts role is PublicSignupRole {
  if (!PUBLIC_SIGNUP_ROLES.includes(role as PublicSignupRole)) {
    throw new Error('Unsupported self-service account role.');
  }
}

export async function signUp(email: string, password: string, role: PublicSignupRole) {
  assertPublicSignupRole(role);
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { role },
    },
  });
  if (error) throw error;

  // Attempt to insert into public.users. The auth trigger (011_auth_user_trigger.sql)
  // handles this automatically, but we also try here in case email confirmation is
  // off and the session is immediately active. Errors are ignored — the trigger is
  // the authoritative path.
  if (data.user && data.session) {
    await supabase.from('users').upsert(
      { id: data.user.id, email: normalizedEmail, role },
      { onConflict: 'id' },
    );
  }

  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}
