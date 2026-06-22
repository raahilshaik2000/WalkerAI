import Config from 'react-native-config';

/**
 * Stripe publishable key.
 *
 * NOTE: a Stripe *publishable* key is NOT a secret — it is designed to ship
 * inside the client app and is visible to anyone who downloads the binary.
 * (The *secret* key lives only in Supabase Edge Function secrets.)
 *
 * We keep a committed fallback here on purpose. `react-native-config` reads
 * the key from a gitignored `.env` at build time; if that file drifts or is
 * missing on a build/archive machine, the app would otherwise ship with a
 * wrong/empty key and every payment would fail with "Invalid API Key
 * provided: pk_test_…". The committed value guarantees a known-good key is
 * always compiled in. `.env` (via Config) still wins when present, so a
 * future `pk_live_…` override needs no code change.
 */
const STRIPE_PUBLISHABLE_KEY_FALLBACK =
  'pk_test_51TIZ85RBbhenZ69DaiWJnLj3L1OBqwQ89lkTJ18NKV0HxdARD6kyWKvTvC2OOGfLrLwVUjv3HCSM3ngN7xRCrDqI002iEGMgnF';

const envKey = Config.STRIPE_PUBLISHABLE_KEY?.trim();

export const STRIPE_PUBLISHABLE_KEY =
  envKey && envKey.startsWith('pk_') ? envKey : STRIPE_PUBLISHABLE_KEY_FALLBACK;
