#!/usr/bin/env node
// Queries Apple's App Store Connect API for the latest TestFlight builds
// and prints their processing state. Useful when an upload "succeeded" in
// Xcode but the build doesn't yet appear in TestFlight — this tells you
// whether Apple is still processing, has rejected the binary, or
// something is genuinely stuck.
//
// Usage:
//   node scripts/check-testflight.mjs
//   node scripts/check-testflight.mjs --bundle-id com.walkerai.app
//
// Required env vars (set in ~/.zshrc or before running):
//   APPSTORE_KEY_ID    — 10-char Key ID from App Store Connect
//   APPSTORE_ISSUER_ID — UUID from the API Keys page
//   APPSTORE_KEY_PATH  — absolute path to the AuthKey_XXX.p8 file

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const BUNDLE_ID_ARG = process.argv.find((a) => a.startsWith('--bundle-id='))?.split('=')[1]
  ?? (process.argv.includes('--bundle-id')
    ? process.argv[process.argv.indexOf('--bundle-id') + 1]
    : undefined);
const BUNDLE_ID = BUNDLE_ID_ARG ?? 'com.walkerai.app';

const KEY_ID = process.env.APPSTORE_KEY_ID;
const ISSUER_ID = process.env.APPSTORE_ISSUER_ID;
const KEY_PATH = process.env.APPSTORE_KEY_PATH;

if (!KEY_ID || !ISSUER_ID || !KEY_PATH) {
  console.error('Missing required env vars. Set APPSTORE_KEY_ID, APPSTORE_ISSUER_ID, APPSTORE_KEY_PATH.');
  console.error('See the script header for details.');
  process.exit(1);
}

const privateKey = readFileSync(KEY_PATH, 'utf8');

// ── JWT signing (ES256) ──────────────────────────────────────────────────
function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// App Store Connect JWTs can live up to 20 min; we go with 15 to be safe.
function signJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const payload = {
    iss: ISSUER_ID,
    iat: now,
    exp: now + 15 * 60,
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sign = createSign('SHA256');
  sign.update(signingInput);
  // ASN.1 DER signatures need to be converted to fixed-length raw r||s for JWT/JWS.
  const derSignature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  const signature = derSignature.toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signingInput}.${signature}`;
}

// ── API helpers ──────────────────────────────────────────────────────────
const API = 'https://api.appstoreconnect.apple.com/v1';

async function api(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apple API ${res.status} ${path}: ${text.substring(0, 400)}`);
  }
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────────
const token = signJWT();

const apps = await api(`/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`, token);
const app = apps.data[0];
if (!app) {
  console.error(`No app found for bundle ID ${BUNDLE_ID}`);
  process.exit(1);
}

const builds = await api(
  `/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=10`
  + '&fields[builds]=version,uploadedDate,processingState,expired,minOsVersion',
  token,
);

const PROCESSING_LABEL = {
  PROCESSING: '⏳ Processing — Apple is still working on this build',
  FAILED:     '❌ Failed — see App Store Connect for the rejection reason',
  INVALID:    '⚠️  Invalid binary — Apple rejected this upload',
  VALID:      '✅ Valid — ready to test in TestFlight',
};

console.log(`\nApp: ${app.attributes.name} (${BUNDLE_ID})`);
console.log(`Latest 10 builds (most recent first):\n`);

const rows = builds.data.map((b) => ({
  version: b.attributes.version,
  uploaded: b.attributes.uploadedDate
    ? new Date(b.attributes.uploadedDate).toLocaleString()
    : '—',
  state: b.attributes.processingState,
  expired: b.attributes.expired ? '(expired)' : '',
}));

const maxV = Math.max(...rows.map((r) => r.version.length), 8);
const maxU = Math.max(...rows.map((r) => r.uploaded.length), 18);

console.log(`  ${'Build'.padEnd(maxV)}  ${'Uploaded'.padEnd(maxU)}  Status`);
console.log(`  ${'-'.repeat(maxV)}  ${'-'.repeat(maxU)}  ${'-'.repeat(40)}`);
for (const r of rows) {
  const label = PROCESSING_LABEL[r.state] ?? r.state;
  console.log(`  ${r.version.padEnd(maxV)}  ${r.uploaded.padEnd(maxU)}  ${label} ${r.expired}`);
}
console.log();
