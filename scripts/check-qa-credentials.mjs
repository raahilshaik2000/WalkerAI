#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const envPath = path.join(repoRoot, '.env');
const credentialsPath = process.env.WALKERAI_QA_CREDENTIALS || '/tmp/walkerai-qa-credentials.txt';
const expectedRoles = ['homeowner', 'company', 'supplier', 'general_contractor'];

function readEnvValue(name) {
  if (!fs.existsSync(envPath)) return null;
  const source = fs.readFileSync(envPath, 'utf8');
  const match = source.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match?.[1]?.trim() || null;
}

function parseCredentials(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [role, email, password] = line.split(/\t/);
      return { role, email, password };
    });
}

async function authCheck({ supabaseUrl, anonKey, email, password }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (response.ok) return { ok: true, status: response.status, error: null };

  const body = await response.json().catch(() => ({}));
  return {
    ok: false,
    status: response.status,
    error: body.error_description || body.msg || body.error || 'Login failed',
  };
}

async function edgeFunctionExists({ supabaseUrl, anonKey, slug }) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${slug}`, {
    method: 'OPTIONS',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
    },
  });
  return response.status !== 404;
}

function summarizeCredentials(rows) {
  const byRole = new Map(rows.map((row) => [row.role, row]));
  return expectedRoles.map((role) => {
    const row = byRole.get(role);
    return {
      role,
      email: row?.email || null,
      present: Boolean(row?.email && row?.password),
    };
  });
}

async function main() {
  const supabaseUrl = readEnvValue('SUPABASE_URL');
  const anonKey = readEnvValue('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  }
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(`QA credentials file not found: ${credentialsPath}`);
  }

  const credentials = parseCredentials(fs.readFileSync(credentialsPath, 'utf8'));
  const summaries = summarizeCredentials(credentials);
  const missing = summaries.filter((row) => !row.present);
  if (missing.length > 0) {
    console.log(JSON.stringify({ ok: false, credentials: summaries }, null, 2));
    process.exit(1);
  }

  const checks = [];
  for (const row of credentials.filter((entry) => expectedRoles.includes(entry.role))) {
    const result = await authCheck({
      supabaseUrl,
      anonKey,
      email: row.email,
      password: row.password,
    });
    checks.push({
      role: row.role,
      email: row.email,
      ok: result.ok,
      status: result.status,
      error: result.error,
    });
  }

  const resetHelpers = process.argv.includes('--check-reset-helpers')
    ? {
        seed_qa: await edgeFunctionExists({ supabaseUrl, anonKey, slug: 'seed-qa' }),
        create_test_user: await edgeFunctionExists({ supabaseUrl, anonKey, slug: 'create-test-user' }),
      }
    : undefined;

  const ok = checks.length === expectedRoles.length && checks.every((row) => row.ok);
  console.log(JSON.stringify({ ok, credentials: checks, reset_helpers: resetHelpers }, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
