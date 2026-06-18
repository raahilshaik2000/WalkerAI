#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const envPath = path.join(repoRoot, '.env');
const credentialsPath = process.env.WALKERAI_QA_CREDENTIALS || '/tmp/walkerai-qa-credentials.txt';
const qaAccounts = {
  homeowner: {
    email: 'qa-homeowner@walkerai.app',
    role: 'homeowner',
  },
  company: {
    email: 'qa-company@walkerai.app',
    role: 'company',
  },
  supplier: {
    email: 'qa-supplier@walkerai.app',
    role: 'supplier',
  },
  general_contractor: {
    email: 'qa-gc@walkerai.app',
    role: 'general_contractor',
  },
};

function readEnvValue(name) {
  if (!fs.existsSync(envPath)) return null;
  const source = fs.readFileSync(envPath, 'utf8');
  const match = source.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match?.[1]?.trim() || null;
}

function password() {
  return `Wa1!${crypto.randomBytes(18).toString('base64url')}`;
}

async function invokeSeedQa({ supabaseUrl, anonKey, credentials }) {
  const response = await fetch(`${supabaseUrl}/functions/v1/seed-qa`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      homeowner_email: credentials.homeowner.email,
      homeowner_password: credentials.homeowner.password,
      company_email: credentials.company.email,
      company_password: credentials.company.password,
      supplier_email: credentials.supplier.email,
      supplier_password: credentials.supplier.password,
      gc_email: credentials.general_contractor.email,
      gc_password: credentials.general_contractor.password,
    }),
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

function writeCredentials(credentials) {
  const lines = Object.entries(credentials).map(([role, account]) => (
    `${role}\t${account.email}\t${account.password}\n`
  ));
  fs.writeFileSync(credentialsPath, lines.join(''), { mode: 0o600 });
}

async function main() {
  const supabaseUrl = readEnvValue('SUPABASE_URL');
  const anonKey = readEnvValue('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  }

  const credentials = Object.fromEntries(
    Object.entries(qaAccounts).map(([key, account]) => [
      key,
      { ...account, password: password() },
    ]),
  );

  const result = await invokeSeedQa({ supabaseUrl, anonKey, credentials });
  if (!result.ok) {
    const helperMissing = result.status === 404 || /function.*not found|requested function was not found/i.test(result.body);
    const hint = helperMissing
      ? 'Deploy supabase/functions/seed-qa first, then rerun npm run qa:reset.'
      : 'Check the seed-qa function logs and Supabase auth permissions.';
    console.error(JSON.stringify({
      ok: false,
      status: result.status,
      error: helperMissing ? 'seed-qa function is not deployed' : 'seed-qa invocation failed',
      hint,
    }, null, 2));
    process.exit(1);
  }

  writeCredentials(credentials);
  console.log(JSON.stringify({
    ok: true,
    credentials_path: credentialsPath,
    accounts: Object.fromEntries(
      Object.entries(credentials).map(([role, account]) => [role, { email: account.email }]),
    ),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
