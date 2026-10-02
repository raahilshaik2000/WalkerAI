import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config';

const rawUrl = (Config.SUPABASE_URL ?? '').trim();
const rawAnonKey = (Config.SUPABASE_ANON_KEY ?? '').trim();

/** Returns a user-facing message when client env is missing or invalid. */
export function getSupabaseConfigError(): string | null {
  if (!rawUrl || !rawAnonKey) {
    return 'This build is missing SUPABASE_URL or SUPABASE_ANON_KEY. Copy .env.example to .env, add your Supabase project values, then rebuild the app.';
  }
  if (!/^https?:\/\//i.test(rawUrl)) {
    return 'SUPABASE_URL must be a valid https URL. Check your .env and rebuild the app.';
  }
  if (rawAnonKey === 'your-supabase-anon-key' || rawUrl.includes('your-project')) {
    return 'Supabase env values still look like placeholders. Update .env with your real project URL and anon key, then rebuild.';
  }
  return null;
}

export const isSupabaseConfigured = getSupabaseConfigError() === null;

// Always construct a client so imports stay stable. App.tsx blocks navigation
// when isSupabaseConfigured is false, so these placeholders are never used for real calls.
const supabaseUrl = isSupabaseConfigured ? rawUrl : 'https://invalid.supabase.local';
const supabaseAnonKey = isSupabaseConfigured
  ? rawAnonKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
