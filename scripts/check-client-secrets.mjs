#!/usr/bin/env node
/**
 * Fails the build if the React Native .env contains a server-only secret.
 *
 * react-native-config compiles EVERY value in .env into the app binary, where
 * anyone can recover it with `strings`. Only publishable / public values are
 * safe here (Supabase URL + anon key, Stripe publishable key). Real secrets
 * (Anthropic, OpenAI, REimagine, Supabase service role, Stripe secret key)
 * must live as Supabase Edge Function secrets and be read with Deno.env.get.
 *
 * Runs automatically before `start`, `ios`, and `android` (npm pre* hooks).
 * For Xcode Archive builds, add a Run Script build phase that calls:
 *   node "$SRCROOT/../scripts/check-client-secrets.mjs"
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env');

if (!fs.existsSync(envPath)) {
  // No .env is fine (CI may inject config another way). Nothing to leak.
  process.exit(0);
}

// Server-only variable NAMES that must never appear in the client .env.
const BANNED_NAMES = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'REIMAGINE_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
];

// Secret VALUE patterns (catch a secret hiding under a harmless-looking name).
// Note: publishable keys (pk_..., sb_publishable_...) are intentionally allowed.
const BANNED_VALUE_PATTERNS = [
  { re: /sk-ant-api[0-9]/, label: 'Anthropic secret key (sk-ant-...)' },
  { re: /sk-(proj-)?[A-Za-z0-9]{20}/, label: 'OpenAI secret key (sk-...)' },
  { re: /sk_(live|test)_[A-Za-z0-9]{20}/, label: 'Stripe SECRET key (sk_live/sk_test_...)' },
  { re: /\bservice_role\b/, label: 'Supabase service_role key' },
];

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/;

function decodeJwtPayload(value) {
  const [, payload] = value.split('.');
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
const violations = [];

lines.forEach((raw, i) => {
  const line = raw.trim();
  if (!line || line.startsWith('#')) return; // ignore blanks + comments
  const eq = line.indexOf('=');
  if (eq === -1) return;
  const name = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim();
  if (!value) return; // empty assignment leaks nothing

  if (BANNED_NAMES.includes(name)) {
    violations.push(`  line ${i + 1}: "${name}" is a server-only secret and must not be in the client .env`);
  }
  for (const { re, label } of BANNED_VALUE_PATTERNS) {
    if (re.test(value)) {
      violations.push(`  line ${i + 1}: value of "${name}" looks like a ${label}`);
    }
  }

  if (JWT_PATTERN.test(value)) {
    const payload = decodeJwtPayload(value);
    if (name === 'SUPABASE_ANON_KEY' && payload?.role === 'anon') {
      return;
    }
    violations.push(`  line ${i + 1}: value of "${name}" looks like a JWT (possible service_role / legacy secret)`);
  }
});

if (violations.length > 0) {
  console.error('\n[31m✖ Secret detected in client .env (it would be compiled into the app binary):[0m');
  console.error(violations.join('\n'));
  console.error('\nMove these to Supabase Edge Function secrets (Deno.env.get) and remove them from .env.');
  console.error('Only publishable/public keys belong in .env. See .env.example.\n');
  process.exit(1);
}

console.log('✓ .env clean: no server-only secrets will be compiled into the client binary.');
process.exit(0);
