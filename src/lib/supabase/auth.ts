import type { User } from '@supabase/supabase-js';
import { supabase } from './client';
import type { PublicSignupRole, UserRole } from '@/constants/enums';

const PUBLIC_SIGNUP_ROLES: readonly PublicSignupRole[] = ['homeowner', 'company', 'supplier', 'general_contractor'];

function assertPublicSignupRole(role: string): asserts role is PublicSignupRole {
  if (!PUBLIC_SIGNUP_ROLES.includes(role as PublicSignupRole)) {
    throw new Error('Unsupported self-service account role.');
  }
}

function isPublicSignupRole(role: unknown): role is PublicSignupRole {
  return typeof role === 'string' && PUBLIC_SIGNUP_ROLES.includes(role as PublicSignupRole);
}

async function upsertPublicUserRow(id: string, email: string, role: PublicSignupRole) {
  const { error } = await supabase.from('users').upsert(
    { id, email: email.trim().toLowerCase(), role },
    { onConflict: 'id' },
  );
  return error;
}

/**
 * If Auth succeeded but public.users is missing (trigger delay / race),
 * create the profile from signup metadata and return the row.
 */
export async function ensurePublicUserProfile(user: User): Promise<{ role: UserRole } | null> {
  const roleCandidate = user.user_metadata?.role;
  if (!isPublicSignupRole(roleCandidate)) return null;

  const email = (user.email ?? '').trim().toLowerCase();
  if (!email) return null;

  let error = await upsertPublicUserRow(user.id, email, roleCandidate);
  if (error) {
    // One retry for transient RLS/trigger races right after signup.
    await new Promise((resolve) => setTimeout(resolve, 400));
    error = await upsertPublicUserRow(user.id, email, roleCandidate);
  }
  if (error) return null;

  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return data?.role ? { role: data.role as UserRole } : { role: roleCandidate };
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
  // off and the session is immediately active.
  if (data.user && data.session) {
    let upsertError = await upsertPublicUserRow(data.user.id, normalizedEmail, role);
    if (upsertError) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      upsertError = await upsertPublicUserRow(data.user.id, normalizedEmail, role);
    }
    if (upsertError) {
      console.warn('[auth] public.users upsert after signup failed:', upsertError.message);
    }
  }

  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;

  if (data.user?.id) {
    const { data: profile } = await supabase
      .from('users')
      .select('account_status')
      .eq('id', data.user.id)
      .maybeSingle();
    const status = profile?.account_status;
    if (status && status !== 'active') {
      await supabase.auth.signOut();
      throw new Error(
        status === 'suspended'
          ? 'This account has been suspended by Walker AI admin. Contact support.'
          : 'This account has been deactivated. Contact support.',
      );
    }
  }

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
