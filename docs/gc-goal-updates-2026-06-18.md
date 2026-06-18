# WalkerAI GC Goal Updates - 2026-06-18

This document summarizes the work completed during the active goal to make General Contractor a true fourth account type alongside Homeowner, Company, and Supplier.

## Goal

General Contractor should be a separate app account type, not a company trade fallback. The app should route, onboard, authorize, and display GC workflows through their own profile, project-management workspace, and backend authorization rules.

## Current Repo State When This Doc Was Created

- Branch: `main`
- Remote: `https://github.com/raahilshaik2000/WalkerAI`
- Latest implementation commit when this doc was finalized: `a0a0ad3 Allow GC managers to generate material orders`
- Four live QA accounts were reset/verified on Supabase and credentials were written to:
  - `/Users/raahilshaik/Downloads/walkerai-qa-credentials.txt`
- Passwords are intentionally not included in this repo document.

## Account Model Work Completed

### GC Role Recognition

The app now treats `general_contractor` as a first-class public role:

- `src/constants/enums.ts`
  - `UserRole` includes `general_contractor`.
  - `PublicSignupRole` allows all non-admin roles, including GC.
- `src/lib/supabase/auth.ts`
  - Public signup roles include `homeowner`, `company`, `supplier`, and `general_contractor`.
- `src/app/(auth)/register.tsx`
  - Registration UI includes General Contractor as its own account selection.
- `src/navigation/RootNavigator.tsx`
  - Root role resolution explicitly accepts `general_contractor`.
  - GC accounts mount `GeneralContractorNavigator`.
  - Unknown or missing roles fail closed to an account setup incomplete screen instead of falling through to Company.

Related pushed commits:

- `f9d6c76 Tighten app role routing boundary`
- `aa26582 Fail closed notification root routing`

## General Contractor Navigation and Screens

### Dedicated GC Navigator

`src/navigation/GeneralContractorNavigator.tsx` contains the separate GC route tree:

- GC dashboard
- GC approvals
- GC profile
- GC onboarding
- GC project creation
- GC project details
- GC project assistant
- GC materials
- GC trades
- GC schedule
- GC permits
- GC messages
- GC payments
- GC discovery/change recommendations
- GC completion binder workflow

This is separate from:

- `HomeownerNavigator`
- `CompanyNavigator`
- `SupplierNavigator`

## GC Onboarding and Readiness

GC profile readiness was hardened so a GC must have a complete verified profile before controlling managed-project workflows.

Required GC readiness fields now consistently include:

- verified profile
- business name
- city
- province
- lat/lng
- license number
- license document URL
- insurance document URL

Important helper:

- `src/lib/general-contractor.ts`
  - `GENERAL_CONTRACTOR_READINESS_SELECT`
  - `isGeneralContractorReadyForProjectControls`

Related pushed commits:

- `ba8f5c8 Require complete GC setup for workflow requests`
- `22b8dbc Align GC project detail readiness guard`
- `3d74a20 Align GC approvals readiness gate`
- `2345f69 Require complete GC readiness for trade counters`

## Backend Role Boundaries

### Homeowner Money Authority

Payment release and money-authority flows were hardened so GC accounts cannot release homeowner-controlled funds.

Homeowner-only checks now protect:

- quote payment intent creation
- supplier payout release
- milestone release authority
- GC payment response/release actions

Related pushed commits:

- `e30d6c8 Guard homeowner milestone release authority`
- `0663a03 Require homeowner role for GC money actions`
- `f596249 Require homeowner role for payment actions`

### Stripe Connect Role Separation

`supabase/functions/create-connect-account/index.ts` supports role-aware Stripe Connect setup for:

- company
- supplier
- general_contractor

The function verifies that the authenticated user's app role matches the requested payout account role, then writes to the matching profile table.

GC payout readiness is tied to `general_contractors`, not `companies`.

## GC Project Creation and Management

### GC-Created Projects

The repo includes a GC project creation screen and backend RPC-backed project creation flow:

- `src/app/(general-contractor)/project/create.tsx`
- `supabase/migrations/20260618023230_require_complete_gc_profile_for_project_creation.sql`

The backend requires the caller to be an actual `general_contractor` user with a complete GC profile.

Current limitation:

- GC-created projects still require a homeowner account/contact flow supported by the existing schema. A fully polished invite-token flow for homeowners who do not yet have an account remains a product/security decision.

## Homeowner Approval Engine

The GC workflow routes major recommendations through homeowner approval instead of letting the GC directly mutate homeowner-owned decisions.

Approval-backed GC actions include:

- scope changes
- material substitutions
- trade substitutions
- schedule changes
- payment requests
- discovery changes
- completion approval deferral

Important files:

- `src/app/(homeowner)/project/[id]/concierge.tsx`
- `src/app/(general-contractor)/approvals.tsx`
- `src/app/(general-contractor)/project/[id]/discovery.tsx`
- `src/app/(general-contractor)/project/[id]/materials.tsx`
- `src/app/(general-contractor)/project/[id]/payments.tsx`
- `src/app/(general-contractor)/project/[id]/completion.tsx`

## Company/Trade Boundary Cleanup

The app previously had a legacy `general_contractor` trade value on companies. That is now treated as legacy data only, not the GC account type.

Completed cleanup:

- Company onboarding does not offer `general_contractor` as a trade type.
- Company profile no longer displays legacy `general_contractor` as a company service.
- Company profile no longer invents `Plumber` when company trade data is missing.
- It now displays `Services not selected` if no current company services are available.

Changed files:

- `src/app/(company)/profile.tsx`
- `__tests__/company-profile-services.test.ts`
- `__tests__/general-contractor.test.ts`

Related pushed commit:

- `8de821a Hide legacy GC service on company profile`

## Financial Disclosure Cleanup

The app UI was cleaned up so contractors/suppliers do not see WalkerAI internal markup, commission, or platform fee math in role-facing app screens.

Company UI updates:

- Removed company-facing display of commission-derived net payout math.
- Company screens now focus on paid value, released milestones, and normal payout status.

Supplier UI updates:

- Removed supplier-facing display of platform fee and net payout calculations.
- Supplier screens now show order value/payment language rather than WalkerAI fee math.

Related pushed commits:

- `c7547cf Hide company commission math from app UI`
- `aa9b057 Hide supplier platform fee math from app UI`

Important tests:

- `__tests__/company-payouts.test.ts`
- `__tests__/financial-disclosure-copy.test.ts`
- `__tests__/material-orders.test.ts`

## Notifications and Deep Links

Notification routing was hardened for role-specific navigation.

Completed work:

- Unknown or mismatched push routes fail closed.
- GC notifications route to GC project surfaces.
- Homeowner/company/supplier notification routes stay role-appropriate.
- Notification payloads can fall back to parsing WalkerAI deep links if structured IDs are missing.

Changed files:

- `src/lib/notifications/navigation.ts`
- `src/lib/notifications/meta.ts`
- `src/lib/push/index.ts`
- `src/navigation/RootNavigator.tsx`
- `__tests__/notifications-navigation.test.ts`

Related pushed commits:

- `cd446d1 Tighten notification role routing`
- `aa26582 Fail closed notification root routing`
- `61844df Harden GC notification deep-link routing`

## Error Copy and App-Safe Messaging

Several GC-facing and homeowner-facing workflow errors were normalized so raw backend implementation details do not leak to users.

Related pushed commits:

- `8967465 Normalize GC backend error displays`
- `7620b58 Harden GC approval error copy`
- `cc2a285 Normalize direct GC project errors`
- `8c5135d Normalize homeowner GC workflow errors`
- `4bc1423 Normalize homeowner GC load errors`
- `94f706c Normalize company GC negotiation errors`

## Material Ordering Authorization

GC authorization was added to the material order generation repair path.

Purpose:

- Allow active verified GC managers to repair/generate material orders for projects they manage.
- Preserve existing access for homeowners and assigned trade companies.
- Deny unrelated users.

Files currently changed:

- `supabase/functions/generate-material-orders/index.ts`
- `__tests__/supabase-functions.test.ts`

Why this matters:

- The GC spec says GCs manage material sourcing.
- The existing edge function authorized homeowners and assigned companies, but not active GC managers.
- Other project generation functions already use active verified GC authorization, so material-order generation should align.

Implementation details:

- A regression test was added.
- The function was patched.
- The function now checks the authenticated app user's role before resolving a GC profile.
- The GC profile must be complete and verified.
- The GC must have an active `general_contractor_projects` assignment for the project.
- The existing homeowner and assigned company paths were preserved.
- Verified with the targeted Supabase function suite, full TypeScript check, full Jest suite, and whitespace diff check.

Related local commit:

- `a0a0ad3 Allow GC managers to generate material orders`

## QA Account Work Completed

Four live Supabase QA accounts were reset/verified:

- Homeowner: `qa-homeowner@walkerai.app`
- Company: `qa-company@walkerai.app`
- Supplier: `qa-supplier@walkerai.app`
- General Contractor: `qa-gc@walkerai.app`

Verified:

- All four accounts can log in.
- Company profile is verified and payout-ready.
- Supplier profile is verified and payout-ready.
- GC profile is verified, concierge-enabled, and payout-ready.

Credentials file:

- `/Users/raahilshaik/Downloads/walkerai-qa-credentials.txt`

Security cleanup:

- Temporarily deployed `create-test-user` to reset accounts.
- Deleted `create-test-user` from Supabase after account creation.

## Tests Run During This Goal Segment

Recently run and passing before the docs request:

- `npm test -- --runInBand --runTestsByPath __tests__/company-profile-services.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`
- `WALKERAI_QA_CREDENTIALS="$HOME/Downloads/walkerai-qa-credentials.txt" node scripts/check-qa-credentials.mjs`

Live account readiness was also checked through Supabase REST using each account's own login session.

## What Still Needs Work Before Calling The Full Goal Complete

The goal is not fully complete yet. Remaining work includes:

1. Push the latest local commits cleanly to GitHub `main`.
2. Perform a real runtime walkthrough across all four account types:
   - homeowner
   - company/trade
   - supplier
   - general contractor
3. Verify GC project creation, homeowner approval, trade coordination, material sourcing, payments, messages, schedule, permits, and completion paths in-app.
4. Deploy the updated `generate-material-orders` edge function to Supabase if production should use the new GC authorization immediately.
5. Confirm any deployed Supabase function/migration drift before relying on production behavior.
6. Decide product details for GC-created projects when the homeowner does not yet have an account.
7. Re-test TestFlight/archive after these changes if the app is being shipped.
