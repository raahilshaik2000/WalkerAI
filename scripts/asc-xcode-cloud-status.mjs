#!/usr/bin/env node
// Inspect what's currently configured in Xcode Cloud + SCM for the
// App Store Connect account. Used to figure out whether we can rewire
// workflows from the old app entry to the new one programmatically,
// or whether the user needs to click through the web UI.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEY_ID = process.env.APPSTORE_KEY_ID;
const ISSUER_ID = process.env.APPSTORE_ISSUER_ID;
const KEY_PATH = process.env.APPSTORE_KEY_PATH;

if (!KEY_ID || !ISSUER_ID || !KEY_PATH) {
  console.error('Missing env vars. Set APPSTORE_KEY_ID, APPSTORE_ISSUER_ID, APPSTORE_KEY_PATH.');
  process.exit(1);
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sign = createSign('SHA256');
  sign.update(signingInput);
  const der = sign.sign({ key: readFileSync(KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${der.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}

async function api(path, token) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    return { error: { status: res.status, body: text.substring(0, 500) } };
  }
  try { return JSON.parse(text); } catch { return { rawText: text }; }
}

const token = signJWT();

console.log('\n=== APPS in this App Store Connect account ===');
const apps = await api('/v1/apps?fields[apps]=name,bundleId,sku', token);
if (apps.error) {
  console.log(`error: ${apps.error.status} ${apps.error.body}`);
} else {
  for (const app of apps.data ?? []) {
    console.log(`  ${app.id}  ${app.attributes.name.padEnd(20)}  ${app.attributes.bundleId}`);
  }
}

console.log('\n=== SCM PROVIDERS (GitHub etc. connected to ASC) ===');
const scm = await api('/v1/scmProviders', token);
if (scm.error) {
  console.log(`  ${scm.error.status === 403 ? 'NOT AVAILABLE — API key lacks Xcode Cloud / Developer access' : `error ${scm.error.status}: ${scm.error.body}`}`);
} else {
  for (const p of scm.data ?? []) {
    console.log(`  ${p.id}  ${p.attributes?.scmProviderType ?? '?'}  ${p.attributes?.url ?? ''}`);
  }
}

console.log('\n=== SCM REPOSITORIES (specific repos linked) ===');
const repos = await api('/v1/scmRepositories?limit=20', token);
if (repos.error) {
  console.log(`  ${repos.error.status === 403 ? 'NOT AVAILABLE' : `error ${repos.error.status}: ${repos.error.body}`}`);
} else {
  for (const r of repos.data ?? []) {
    console.log(`  ${r.id}  ${r.attributes?.repositoryName ?? '?'}  default-branch: ${r.attributes?.defaultBranch ?? '?'}`);
  }
}

console.log('\n=== CI PRODUCTS (Xcode Cloud "products" — usually 1 per app) ===');
const products = await api('/v1/ciProducts?include=app&fields[ciProducts]=name,productType,createdDate&fields[apps]=name,bundleId', token);
if (products.error) {
  console.log(`  ${products.error.status === 403 ? 'NOT AVAILABLE' : `error ${products.error.status}: ${products.error.body}`}`);
} else {
  for (const p of products.data ?? []) {
    const appRef = p.relationships?.app?.data;
    const linkedApp = products.included?.find((i) => i.type === 'apps' && i.id === appRef?.id);
    console.log(`  ${p.id}  ${p.attributes?.name?.padEnd(20)}  → ${linkedApp?.attributes?.name ?? '?'} (${linkedApp?.attributes?.bundleId ?? '?'})`);
  }
}

console.log();
