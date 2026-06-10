# WalkerAI — Future Session Context

This file is auto-loaded by Claude Code at the start of every session in this
repo. Anything captured here persists across sessions and helps the next
Claude pick up where the last one left off.

## ⚠️ Pending: APNs Key for Push Notifications

**Status as of 2026-06-10:** Push notification code is fully wired (Notifee
on the RN side + custom native bridge + raw APNs HTTP/2 + JWT-signed
send-push edge function), but **push delivery is blocked on the user
configuring an APNs Authentication Key**.

The native code compiles and the app runs fine without this — pushes just
won't deliver until secrets are set. The send-push function detects missing
secrets and writes `push_error='APNS_NOT_CONFIGURED'` on the notification
row rather than crashing.

### What the user still needs to do

1. **Apple Developer Portal → Keys → +** → check "Apple Push Notifications
   service (APNs)" → Continue → Register
   - Download the `.p8` file (called `AuthKey_XXXXXXXXXX.p8`)
   - Note the 10-character **Key ID** shown on the page
2. **Apple Developer Portal → Identifiers** → register `com.walkerai.app`
   if not already there → enable **Push Notifications** capability
3. **Set Supabase secrets** (run from this repo so the linked project is
   picked up correctly):

```bash
cd ~/Code/WalkerAI
supabase secrets set APNS_KEY="$(cat ~/Downloads/AuthKey_XXXXXXXXXX.p8)"
supabase secrets set APNS_KEY_ID="XXXXXXXXXX"     # the 10-char Key ID
supabase secrets set APNS_TEAM_ID="W4V4NXYYW5"
supabase secrets set APNS_BUNDLE_ID="com.walkerai.app"
# Optional, defaults to true. Set =false only for sandbox testing
# with Xcode debug builds on physical device.
# supabase secrets set APNS_USE_PRODUCTION=false
```

4. **Xcode → Signing & Capabilities** → confirm team `W4V4NXYYW5` is
   selected and "Push Notifications" capability is listed (the
   `WalkerAI.entitlements` file is already in place with
   `aps-environment=development`; Apple's signing process promotes to
   `production` for TestFlight/App Store builds automatically).
5. **Re-archive in Xcode** → upload to TestFlight → install on iPhone →
   accept the push permission prompt when the app asks after sign-in.
6. **Verify** by checking Supabase logs after triggering a notification:

```bash
supabase functions logs send-push --project-ref wgbloslndalmocckrejw --since 5m
```

Should see `delivered: <n>` with no `APNS_NOT_CONFIGURED` errors.

### Related code

- iOS native: `ios/WalkerAI/AppDelegate.swift` (APNs registration),
  `ios/WalkerAI/Push/WalkerPushModule.{swift,m}` (RN bridge),
  `ios/WalkerAI/WalkerAI.entitlements` (aps-environment)
- RN: `src/lib/push/index.ts` (init/deactivate, deep-link routing),
  hooked from `src/navigation/RootNavigator.tsx` on auth state change
- Backend: `supabase/functions/send-push/index.ts` (raw APNs HTTP/2,
  JWT signed via `jose`, deactivates dead tokens automatically)

## Project Layout (current as of 2026-06-10)

- **Repo lives at `~/Code/WalkerAI`** — was moved out of `~/Desktop/` on
  2026-06-09 because iCloud Drive sync kept corrupting `Pods/` and
  generating `Foo 2.framework` duplicates. Do NOT move it back.
- **Bundle ID:** `com.walkerai.app` (was placeholder `com.mycompany.walkeraiappnew`)
- **Apple Team ID:** `W4V4NXYYW5`
- **Supabase project:** `wgbloslndalmocckrejw` (Walker AI App)
  - URL: `https://wgbloslndalmocckrejw.supabase.co`
  - Dashboard: https://supabase.com/dashboard/project/wgbloslndalmocckrejw
  - All 18 edge functions deployed current as of 2026-06-09
  - Migration history fully reconciled (47-migration June audit batch
    applied; 18 mystery remote migrations from May 28-30 captured as
    placeholder files at `supabase/migrations/*_unknown_remote.sql`)

## QA Accounts on Live

Created 2026-06-10 via a one-off `seed-qa` edge function (since deleted).
The function source is preserved at `supabase/functions/seed-qa/index.ts`
for re-running if credentials need rotation.

| Role | Email | Password Notes |
|---|---|---|
| Homeowner | `qa-homeowner@walkerai.app` | Saved to `/tmp/walkerai-qa-credentials.txt` (ephemeral) |
| Company | `qa-company@walkerai.app` | Pre-seeded as general_contractor in Toronto, 50km radius, Stripe Connect placeholder |
| Supplier | `qa-supplier@walkerai.app` | 4 categories in Toronto, 100km radius, Stripe Connect placeholder |

If `/tmp/walkerai-qa-credentials.txt` is gone, re-deploy `seed-qa` and
re-invoke with new passwords. The function is idempotent (upserts on
email, updates password if user exists).

## E2E Test Plan

Full 8-phase plan at `thoughts/shared/plans/e2e-test-plan-2026-06-10.md`.
Covers homeowner project creation → company dispatch + quote → payment →
supplier fulfillment → milestone progression → completion + reviews + edge
cases. ~80 min to execute end-to-end.

## What Got Done in Recent Sessions (high-level)

- **E2E audit pass:** 280+ small fixes (workflow coherence, RLS guards,
  schema compat, edge function hardening). See
  `thoughts/shared/handoffs/walkerai-e2e-audit/current.md` for the full
  ledger.
- **3D customizer V1 + V2:** Native SceneKit interactive room customizer
  with tap-to-swap materials. V2 added multi-layer procedural textures
  (granite, marble veining, wood grain, tile, terrazzo, brushed metal).
- **Voice V1 + polish:** iOS-native Speech.framework integration with
  confirmation step before applying recognized answers.
- **Backend deploy:** All 17 stale edge functions brought current + 47
  schema migrations pushed (Stream A + Stream B of the deploy plan at
  `thoughts/shared/plans/deploy-backend-2026-06-08.md`).
- **Bundle ID + iCloud cleanup:** Listed under "Project Layout" above.

## Validation Commands

Standard pre-commit check:

```bash
npx tsc --noEmit --pretty false
npm run lint -- --quiet
npm test -- --runInBand
git diff --check
```

iOS simulator smoke:

```bash
npx react-native run-ios --simulator "iPhone 17"
```
