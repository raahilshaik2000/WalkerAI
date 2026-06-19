# WalkerAI GC Goal Updates - 2026-06-18

This document summarizes the work completed during the active goal to make General Contractor a true fourth account type alongside Homeowner, Company, and Supplier.

## Goal

General Contractor should be a separate app account type, not a company trade fallback. The app should route, onboard, authorize, and display GC workflows through their own profile, project-management workspace, and backend authorization rules.

## Current Repo State When This Doc Was Created

- Branch: `main`
- Remote: `https://github.com/raahilshaik2000/WalkerAI`
- Latest implementation commit when this doc was updated: `26842c8 Use safe auth entry error copy`
- Live backend updates: `generate-material-orders`, `create-gc-concierge-payment-intent`, `gc-concierge-payout`, `refresh-connect-status`, `create-connect-account`, and `stripe-return` were deployed to Supabase project `wgbloslndalmocckrejw`.
- Live backend migrations were later applied through `20260618132500_add_supplier_project_message_participants.sql` on Supabase project `wgbloslndalmocckrejw`.
- Remote migration history was verified with `supabase migration list --linked`; local and remote migration versions match through `20260618132500`.
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
- `26842c8 Use safe auth entry error copy`

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

Latest approval transparency update:

- Homeowners can add an optional response note when approving or rejecting GC project recommendations.
- GC project detail and GC approvals inbox surfaces now display homeowner response notes for finalized recommendation requests.
- This keeps approval decisions auditable inside WalkerAI instead of reducing them to only approved/rejected status.

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
- Audited APNs/native push tap payloads and confirmed `send-push` forwards canonical `project_id`, `slot_id`, `order_id`, and `deep_link` keys directly through iOS `userInfo`.
- Cleaned up a stale push client comment that referenced nonexistent `related_*` payload keys and added a regression guard for the actual payload contract.

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
- Deployed to Supabase project `wgbloslndalmocckrejw`.

Related local commit:

- `a0a0ad3 Allow GC managers to generate material orders`

## Project Communication Updates

The shared project message thread now reflects the stated participant model: homeowner, GC, trades, and suppliers.

Completed work:

- Accepted material-order suppliers can read and write the project message thread once they own an eligible order.
- Supplier order detail includes a `Project Messages` entry point for accepted supplier-owned orders.
- GC project messages support photo attachments with optional captions.
- GC message attachment sending uses the same readiness and assignment lock as text messages.
- Completed GC assignments keep the message thread read-only.

Changed files:

- `supabase/migrations/20260618132500_add_supplier_project_message_participants.sql`
- `src/navigation/SupplierNavigator.tsx`
- `src/app/(supplier)/orders/[id]/index.tsx`
- `src/app/(general-contractor)/project/[id]/messages.tsx`
- `__tests__/general-contractor.test.ts`

Related pushed commits:

- `886ed65 Let suppliers join project message threads`
- `ea591ed Let GCs send project message photos`

## Completed Project History

Completed GC-managed projects now expose read-only project history more completely.

Completed work:

- Completed project detail links to schedule, permits, payments, materials, trades, discoveries, assistant summaries, messages, and the completion binder.
- Completed schedule, material, payment, trade, and discovery screens now explain that records are available read-only instead of saying homeowner confirmation is still required.
- Completed schedule rows are not selectable for new recommendations.
- Mutation controls remain gated to active GC management.

Changed files:

- `src/app/(general-contractor)/project/[id]/index.tsx`
- `src/app/(general-contractor)/project/[id]/schedule.tsx`
- `src/app/(general-contractor)/project/[id]/materials.tsx`
- `src/app/(general-contractor)/project/[id]/payments.tsx`
- `src/app/(general-contractor)/project/[id]/trades.tsx`
- `src/app/(general-contractor)/project/[id]/discovery.tsx`
- `__tests__/general-contractor.test.ts`

Related pushed commits:

- `ef74952 Expose completed GC project history`
- `68278ee Clarify completed GC project screens`
- `64bf5bb Keep completed GC history read only`
- `0d7be85 Keep completed GC assistant history read only`

## Shared Notification and Error Copy Hardening

Shared notification and infrastructure-error handling was cleaned up for all roles, including GC.

Completed work:

- Notification load/read failures now use `formatAppSafeErrorMessage` instead of showing raw Supabase error messages.
- Transient network/database timeout messages fall back to polished screen-specific copy.
- The specific client-facing failure shape "connection to the database timed out" is now covered by formatter regression tests.
- Login and registration failures now use the same app-safe formatter, so first-entry paths for homeowner, company, supplier, and GC accounts do not show raw backend JSON or database timeout text.

Changed files:

- `src/app/notifications.tsx`
- `src/app/(auth)/login.tsx`
- `src/app/(auth)/register.tsx`
- `src/lib/supabase/functions.ts`
- `__tests__/auth.test.ts`
- `__tests__/notifications-navigation.test.ts`
- `__tests__/supabase-functions.test.ts`

Related pushed commits:

- `e722614 Use safe notification error copy`
- `5a4ab42 Hide transient infrastructure error copy`
- `26842c8 Use safe auth entry error copy`

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

Recently run and passing:

- `npm test -- --runInBand --runTestsByPath __tests__/company-profile-services.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`
- `WALKERAI_QA_CREDENTIALS="$HOME/Downloads/walkerai-qa-credentials.txt" node scripts/check-qa-credentials.mjs`

Latest validation after the completed-project screen update:

- `npm test -- --runInBand __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after notification/error-copy hardening:

- `npm test -- --runInBand __tests__/supabase-functions.test.ts __tests__/notifications-navigation.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after auth-entry hardening:

- `npm test -- --runInBand __tests__/auth.test.ts __tests__/supabase-functions.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`
- `WALKERAI_QA_CREDENTIALS="$HOME/Downloads/walkerai-qa-credentials.txt" node scripts/check-qa-credentials.mjs`

Live account readiness was also checked through Supabase REST using each account's own login session.

## Runtime Simulator Pass - Latest Update

The app was rebuilt and installed on the iPhone 17 Pro simulator, then exercised with live Supabase QA accounts.

Verified runtime paths:

- GC account logs into `GC Desk` and shows active/completed managed projects.
- GC active project detail loads the management controls for schedule, permits, payments, materials, trades, discovery/change recommendations, assistant, messages, and completion binder.
- GC trade management loads the filled Painter slot, verified QA Trade Company credential state, pending trade quote, and negotiation panel.
- Company/trade account logs into `Trade Desk`, opens an assigned quoting job, and loads the quote editor with line items and balanced payment milestones.
- Homeowner account logs into the dashboard, sees the GC-created Painting project as quote-ready, opens project detail, and loads the quote/payment review screen with escrow language and milestone breakdown.
- Supplier account logs into Open Orders, Catalog, Earnings, and Profile surfaces.

Runtime fixes made from this pass:

- Supplier earnings summary cards now keep currency values on one line instead of wrapping amounts like `$3,150.00`.
- Supplier profile metrics now render in a two-column grid so rating, reviews, on-time percentage, and average days are readable on mobile.
- Homeowner approval/rejection of GC project recommendations now supports optional response notes, and those notes are visible in GC project detail and approvals inbox views.
- Homeowner approval/rejection of GC payment authorization requests now supports optional response notes, while escrow and milestone release remain separate. Those notes are visible in the homeowner concierge history, the GC payment screen, project detail, and the GC approvals inbox.
- Homeowner GC invite, concierge service request, management confirmation, and GC removal actions now clear their in-progress state and show app-safe copy even if the RPC or refresh path throws from a client/network failure.
- Trade responses to GC counteroffers/revision requests now support optional response notes, and accepted counteroffers keep those notes visible while the trade builds the updated homeowner-facing quote package.
- GC accept/reject responses for concierge service bookings now support optional response notes, and those notes are visible in the homeowner concierge request history.
- GC-created project setup now uses stable existing-homeowner-account guidance and formats the missing-homeowner RPC error into actionable app copy instead of exposing backend wording.
- GC trade dispatch no-match responses now pass backend-provided messages through the app-safe formatter before showing them in the GC trade screen.
- Homeowner project dispatch restart messages now use app-safe formatting in both project detail variants, so contractor-search recovery does not expose raw function wording.
- The homeowner dashboard project carousel now formats both project-load and optional GC-context failures through app-safe copy before displaying them.
- Company calendar milestones now attach optional GC project type context so GC-created projects such as flooring, painting, basement, and additions do not fall back to generic room-type icons; calendar load failures also use app-safe copy.
- Company quote/pricing submission failures now use app-safe copy instead of surfacing raw backend or database messages when a trade submits or revises pricing during GC negotiation workflows.
- Company quote/pricing now blocks editing if existing quote state cannot be loaded safely, including pending quote line items or milestone details, so trades do not replace pricing from an uncertain funded/pending state.
- Company job detail load failures now use app-safe copy, covering the trade acceptance and GC quote-negotiation entry point without exposing raw backend errors.
- Company job acceptance failures now keep race-condition guidance specific and use a clear `Could not accept job` title for other app-safe accept-job failures instead of a generic `Error` title.
- Company job detail now scopes GC trade negotiation prompts to the active quote slot, preventing project-level pricing views from showing slot-specific negotiation prompts from a different trade path.
- Company/trade responses to GC trade counteroffers and revision requests now clear their in-progress state even if the negotiation response RPC throws from a network/client failure.
- Company material verification now formats material, supplier-order, supplier-review, quantity-save, and supplier-review submission failures through app-safe copy for GC-managed material sourcing workflows.
- Supplier material order feed, detail, and active fulfillment screens now format supplier profile, order-load, eligibility, claim, processing, shipped, and delivered update failures through app-safe copy for GC-managed material order lifecycles.
- Supplier open material order feed now catches thrown load/eligibility failures, clears the loading state reliably, and uses a specific `Could not claim order` title for non-race claim failures.
- Supplier material order detail and active fulfillment screens now also catch thrown load failures and clear loading state reliably, so GC-managed material order views do not hang on transient client/network failures.
- Homeowner material receipt and supplier-payment release now use app-safe copy for material order load failures and payout release failures, while keeping delivery-proof gating intact.
- Homeowner material receipt now also catches thrown material-order load failures and clears loading state reliably before the homeowner reviews delivery proof or releases supplier payout.
- Homeowner quote funding now catches thrown project/quote/line-item load failures and clears loading state reliably before payment start, while preserving existing Stripe PaymentSheet behavior.
- Homeowner GC approval/rejection and GC payment authorization responses now clear their in-progress state even if the RPC throws from a network/client failure.
- Homeowner project photo analysis now formats outer project-creation and upload failures through app-safe copy, so transient database timeouts no longer show raw backend wording on the analysis failure screen.
- Supplier catalog stock toggles now roll back their optimistic UI update when the catalog update throws from a network/client failure, not only when Supabase returns an error object.
- GC management invite acceptance, approval-request cancellation, trade-negotiation cancellation, and concierge booking responses now clear their in-progress state even if the RPC/update/fetch path throws.
- GC payment-request cancellation now clears its in-progress state if the update or refresh throws, and GC permit status updates now show app-safe failure copy for thrown client/network errors.
- GC native picker failures for license documents, insurance documents, permit uploads, project message attachments, and external-trade documents now route through app-safe alerts instead of bypassing upload error handling.
- GC license and insurance onboarding now surfaces app-safe preload failures instead of silently showing blank existing document fields when the profile query fails.
- GC business onboarding now surfaces app-safe preload failures instead of silently leaving default business, service-area, markup, and concierge values when the profile query fails.
- GC business, license, and insurance onboarding save failures now use specific app-safe alert titles instead of the generic `Error` title.
- GC project text-message sends now restore the typed draft and clear the sending state if auth lookup or message insert throws, and GC photo attachments now catch auth/client failures in the attachment error path.
- GC project message-thread loading now catches thrown auth/client/query failures, shows app-safe load copy, and locks the composer with retry guidance instead of leaving the effect unhandled.
- Homeowner schedule confirmation now uses app-safe copy for schedule load and confirmation failures, while preserving quote/payment-aware project activation behavior.
- Homeowner permit/inspection records now use app-safe copy for permit load and upload failures while preserving signed document previews.
- Homeowner and company milestone/payment workflows now use app-safe copy for milestone load, dispute, update, upload, and release failures; shared Supabase error formatting also hides database policy/schema/internal wording behind polished fallback copy.
- Homeowner quote funding now uses app-safe copy for project, quote, and quote-line-item load failures before Stripe payment starts, while keeping the existing PaymentSheet and escrow funding flow intact.
- Homeowner message list, homeowner project chat, and company job chat now use app-safe copy for message participant, message load, and message-send failures, matching the already-safe GC project chat behavior.
- Company/trade earnings and profile screens now use app-safe copy for company profile, accepted-project, paid-milestone, and earnings load failures while keeping commission-derived payout math hidden from the app UI.
- Homeowner and company/trade change-order screens now use app-safe copy for change-order load, submit, sign, approve, and reject failures while preserving the explicit disclaimer that signed cost changes do not automatically alter funded escrow or milestone payments.
- Homeowner change-order approvals now catch thrown load, approve, and reject failures, clear loading/responding state reliably, and show both approval buttons as in-progress while a response is being submitted.
- Company/trade job feed plus business, license, and insurance onboarding now use app-safe copy for load/save/verification submission failures across the verified trade setup and accepted-job entry path.
- Supplier catalog, catalog item creation, earnings, and profile screens now use app-safe copy for supplier profile, catalog, stock toggle, payout setup, and earnings load/save failures across the material-sourcing account workflow.
- Supplier business, license, and category onboarding plus catalog-item editing/deletion now use app-safe copy for profile load, setup save, catalog item load, save, and delete failures.
- Homeowner/company warranty screens and the company-to-homeowner review screen now use app-safe copy for closeout warranty load/upload and review load/submit failures.
- GC completion approval submission now clears its loading state even if the approval insert throws from a network/client failure instead of returning a Supabase error object.
- Homeowner edit profile, saved addresses, and project search now use app-safe copy for profile save, address save, avatar remove/upload, address load, and project search load failures.
- Homeowner top-level schedule and legacy chat screens now use app-safe copy for schedule project/slot/milestone loads plus message load/send failures, aligning them with the newer project-specific schedule and message surfaces.
- Homeowner DIY guide save/convert, project sharing, settings, voice address search, address save, and final project dispatch now use app-safe copy instead of showing raw Supabase, native share-sheet, or backend messages.
- Homeowner project creation now uses app-safe copy for questionnaire voice failures, visual preview/render load failures, AI brief generation failures, material-detail save failures, and DIY guide generation failures.
- Homeowner project creation now also uses app-safe copy for selected-render persistence, project render selection persistence, selected-render loading inside brief generation, and confidence-score/material override save failures, with a save-in-progress state to prevent duplicate render continuation taps.
- Homeowner project overview and profile stats now use app-safe copy for project-list, milestone-progress, optional GC-context, and profile-stat load failures.
- Supabase drift verification found the GC concierge payment functions were present locally and invoked by the app but missing remotely. `create-gc-concierge-payment-intent` and `gc-concierge-payout` were deployed and re-listed as ACTIVE on project `wgbloslndalmocckrejw`.
- Remote-only Stripe Connect support functions `stripe-return` and `refresh-connect-status` were downloaded into `supabase/functions/` so the repo matches deployed backend surface area. `refresh-connect-status` now supports `general_contractor` and the GC profile refreshes Stripe payout readiness when the screen regains focus.
- Stripe Connect onboarding now uses the repo-owned public `stripe-return` Edge Function for both return and expired-link refresh paths instead of hardcoded undeclared `walkerai.app` routes. `create-connect-account` derives those URLs from `SUPABASE_URL`, and `stripe-return` was redeployed with JWT verification disabled so Stripe/Safari can open it.
- Company and supplier payout surfaces now also call `refresh-connect-status` before loading profile/earnings data, so Stripe Connect completion refreshes consistently across company, supplier, and GC account types.
- Stripe Connect status refresh is now centralized and best-effort. Company, supplier, and GC account screens still load their local profile data if the refresh function or network fails.

Runtime findings still not treated as complete:

- Homeowner quote and supplier earnings/profile tabs can take several seconds to resolve from Supabase. They did resolve during testing, but this should be watched for perceived-loading UX.
- Payment start, quote submission, negotiation submission, stock toggles, and sign-out were intentionally not submitted during this pass to avoid unnecessary live Supabase record changes.
- LiDAR was intentionally skipped per request; only non-LiDAR and 2D-related surfaces were considered in scope.

## What Still Needs Work Before Calling The Full Goal Complete

The goal is not fully complete yet. Remaining work includes:

1. Finish destructive/non-read-only workflow verification in a controlled QA project:
   - homeowner payment start
   - trade quote submission
   - trade counteroffer submission
   - supplier order state changes
   - homeowner approval/rejection of GC recommendations
2. Verify GC project creation, homeowner approval, trade coordination, material sourcing, payments, messages, schedule, permits, and completion paths in-app beyond the read-only surfaces already checked.
3. Decide product details for GC-created projects when the homeowner does not yet have an account. Current app behavior intentionally requires an existing homeowner account and now explains that requirement with polished copy.
4. Re-test TestFlight/archive after these changes if the app is being shipped.

Latest validation after milestone/payment error-copy hardening:

- `npm test -- --runInBand __tests__/homeowner-milestone-evidence.test.ts __tests__/company-milestone-upload.test.ts __tests__/supabase-functions.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after homeowner quote funding error-copy hardening:

- `npm test -- --runInBand __tests__/homeowner-quote-status.test.ts __tests__/payments.test.ts __tests__/supabase-functions.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after project message error-copy hardening:

- `npm test -- --runInBand __tests__/messages.test.ts __tests__/dashboard-data.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after company earnings/profile error-copy hardening:

- `npm test -- --runInBand __tests__/company-profile-services.test.ts __tests__/company-payouts.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after change-order error-copy hardening:

- `npm test -- --runInBand __tests__/change-orders.test.ts __tests__/project-activation.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after company entry/onboarding error-copy hardening:

- `npm test -- --runInBand __tests__/company-entry-errors.test.ts __tests__/company-calendar.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after supplier runtime error-copy hardening:

- `npm test -- --runInBand __tests__/supplier-catalog.test.ts __tests__/supplier-onboarding.test.ts __tests__/material-orders.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after supplier onboarding/catalog-detail error-copy hardening:

- `npm test -- --runInBand __tests__/supplier-onboarding.test.ts __tests__/supplier-catalog.test.ts __tests__/material-orders.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after closeout warranty/review error-copy hardening:

- `npm test -- --runInBand __tests__/warranty-upload.test.ts __tests__/project-review.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after homeowner utility error-copy hardening:

- `npm test -- --runInBand __tests__/homeowner-utility-errors.test.ts __tests__/dashboard-data.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after homeowner schedule/chat error-copy hardening:

- `npm test -- --runInBand __tests__/homeowner-schedule.test.ts __tests__/messages.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after homeowner project utility error-copy hardening:

- `npm test -- --runInBand __tests__/diy-guide.test.ts __tests__/project-share.test.ts __tests__/project-creation-flow.test.ts __tests__/homeowner-utility-errors.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after project-creation error-copy hardening:

- `npm test -- --runInBand __tests__/project-creation-flow.test.ts __tests__/diy-guide.test.ts __tests__/visual-preview.test.ts __tests__/project-voice.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after homeowner overview/profile error-copy hardening:

- `npm test -- --runInBand __tests__/homeowner-utility-errors.test.ts __tests__/dashboard-data.test.ts __tests__/homeowner-quote-status.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after Supabase drift check and GC concierge function deployment:

- `supabase migration list --linked`
- `supabase functions deploy create-gc-concierge-payment-intent gc-concierge-payout --project-ref wgbloslndalmocckrejw --use-api`
- `supabase functions list --project-ref wgbloslndalmocckrejw`
- `npm test -- --runInBand __tests__/general-contractor.test.ts __tests__/supabase-functions.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after Stripe Connect function source sync and GC payout refresh wiring:

- `supabase functions download stripe-return --project-ref wgbloslndalmocckrejw --use-api`
- `supabase functions download refresh-connect-status --project-ref wgbloslndalmocckrejw --use-api`
- `npm test -- --runInBand __tests__/general-contractor.test.ts __tests__/supabase-functions.test.ts`
- `npx tsc --noEmit`
- `supabase functions deploy refresh-connect-status --project-ref wgbloslndalmocckrejw --use-api`
- `supabase functions list --project-ref wgbloslndalmocckrejw`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after Stripe Connect return URL hardening:

- `npm test -- --runInBand __tests__/supabase-functions.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `supabase functions deploy create-connect-account --project-ref wgbloslndalmocckrejw --use-api`
- `supabase functions deploy stripe-return --project-ref wgbloslndalmocckrejw --use-api --no-verify-jwt`
- `supabase functions list --project-ref wgbloslndalmocckrejw`
- `git diff --check`

Latest validation after company/supplier payout readiness refresh wiring:

- `npm test -- --runInBand __tests__/company-profile-services.test.ts __tests__/supplier-catalog.test.ts __tests__/general-contractor.test.ts __tests__/supabase-functions.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after best-effort Stripe Connect refresh hardening:

- `npm test -- --runInBand __tests__/payouts.test.ts __tests__/company-profile-services.test.ts __tests__/supplier-catalog.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after company/trade negotiation response hardening:

- `npm test -- --runInBand __tests__/company-quote-copy.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after supplier stock toggle rollback hardening:

- `npm test -- --runInBand __tests__/supplier-catalog.test.ts __tests__/material-orders.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after GC action response-state hardening:

- `npm test -- --runInBand __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after GC payment and permit action hardening:

- `npm test -- --runInBand __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after GC native picker failure hardening:

- `npm test -- --runInBand __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after GC document preload error hardening:

- `npm test -- --runInBand __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after GC business preload error hardening:

- `npm test -- --runInBand __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after GC onboarding error-title polish:

- `npm test -- --runInBand __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after GC message send hardening:

- `npm test -- --runInBand __tests__/messages.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`

Latest validation after GC attachment auth hardening:

- `npm test -- --runInBand __tests__/messages.test.ts __tests__/general-contractor.test.ts`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `git diff --check`
