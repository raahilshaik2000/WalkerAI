import { supabase } from './client';
import type { UserRole } from '@/constants/enums';

export async function signUp(email: string, password: string, role: UserRole) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role },
    },
  });
  if (error) throw error;

  // Insert into our users table (trigger handles this in production,
  // but we do it explicitly here for reliability)
  if (data.user) {
    const { error: insertError } = await supabase.from('users').upsert(
      { id: data.user.id, email, role },
      { onConflict: 'id' },
    );
    if (insertError) throw new Error(`Database error saving new user: ${insertError.message} (code: ${insertError.code})`);
  }

  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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
