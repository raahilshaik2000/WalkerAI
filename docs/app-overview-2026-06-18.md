# WalkerAI Full App Overview - 2026-06-18

This document explains the current WalkerAI app from the repo state as of June 18, 2026.

## Product Summary

WalkerAI is a React Native renovation platform for homeowners, trade companies, material suppliers, and general contractors. The app is built around renovation project creation, AI-assisted scoping, trade dispatch, material ordering, escrow-style payments, homeowner approvals, and project closeout.

The four app account types are:

1. Homeowner
2. Company, meaning trade contractor
3. Supplier
4. General Contractor

General Contractor is a separate account type. It should not be treated as a company trade category.

## Tech Stack

- React Native `0.84.1`
- React `19.2.3`
- TypeScript
- React Navigation stack and tab navigators
- Supabase for auth, Postgres, RLS, storage, realtime, and edge functions
- Stripe React Native and Stripe Connect for payments/payouts
- Zustand for local app state
- Jest for tests
- iOS native integrations for RoomPlan/LiDAR, push notifications, speech/voice, and 3D room customization

Important package files:

- `package.json`
- `tsconfig.json`
- `jest.config.js`
- `ios/WalkerAI.xcworkspace`

## Environment

Live Supabase project:

- Project ref: `wgbloslndalmocckrejw`
- URL: `https://wgbloslndalmocckrejw.supabase.co`

The React Native app reads:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

from `.env` through `react-native-config`.

## Top-Level App Entry

Core entry/navigation files:

- `App.tsx`
- `src/app/index.tsx`
- `src/navigation/RootNavigator.tsx`
- `src/navigation/SupplierNavigator.tsx`
- `src/navigation/GeneralContractorNavigator.tsx`

`RootNavigator` is the central runtime router. It reads the authenticated user's role from Supabase `users.role` and mounts the correct root navigator.

Supported app roles:

- `homeowner`
- `company`
- `supplier`
- `general_contractor`

The app also has an `admin` type in the shared role enum, but admin is not a self-service app account route.

## Authentication

Main files:

- `src/app/(auth)/login.tsx`
- `src/app/(auth)/register.tsx`
- `src/lib/supabase/auth.ts`
- `src/stores/auth.store.ts`

Signup supports:

- homeowner
- company
- supplier
- general contractor

The app writes the requested role to auth metadata during signup and relies on the Supabase auth trigger/migrations to create or maintain the public `users` row.

Login and registration screens use app-safe error formatting, so transient network/database failures fall back to polished copy instead of exposing raw backend messages.

## Account Type: Homeowner

Homeowners own projects and final approvals.

Major screens:

- `src/app/(homeowner)/index.tsx`
- `src/app/(homeowner)/projects.tsx`
- `src/app/(homeowner)/project/[id]/index.tsx`
- `src/app/(homeowner)/project/create/*`
- `src/app/(homeowner)/project/[id]/quote.tsx`
- `src/app/(homeowner)/project/[id]/milestones.tsx`
- `src/app/(homeowner)/project/[id]/materials.tsx`
- `src/app/(homeowner)/project/[id]/schedule.tsx`
- `src/app/(homeowner)/project/[id]/concierge.tsx`
- `src/app/(homeowner)/project/[id]/permits.tsx`
- `src/app/(homeowner)/project/[id]/messages.tsx`
- `src/app/(homeowner)/project/[id]/change-orders.tsx`
- `src/app/(homeowner)/project/[id]/warranties.tsx`
- `src/app/(homeowner)/project/[id]/review.tsx`

Homeowner responsibilities:

- create a project
- upload room photos
- provide manual measurements or LiDAR scan results
- answer AI/custom questionnaire questions
- review AI brief and estimate
- choose design/material preferences
- approve quote/payment actions
- approve GC recommendations
- confirm supplier receipt before supplier payout
- approve milestone releases
- review completed contractors/GCs

## Homeowner Project Creation Flow

The project creation wizard lives under:

- `src/app/(homeowner)/project/create/room-type.tsx`
- `src/app/(homeowner)/project/create/photos.tsx`
- `src/app/(homeowner)/project/create/measurements.tsx`
- `src/app/(homeowner)/project/create/analyzing.tsx`
- `src/app/(homeowner)/project/create/questionnaire.tsx`
- `src/app/(homeowner)/project/create/renders.tsx`
- `src/app/(homeowner)/project/create/brief.tsx`
- `src/app/(homeowner)/project/create/material-detail.tsx`
- `src/app/(homeowner)/project/create/address.tsx`
- `src/app/(homeowner)/project/create/confirm.tsx`

The broad flow:

1. Select project room/type.
2. Upload photos.
3. Add measurements manually or through LiDAR/RoomPlan.
4. Analyze photos/room.
5. Generate or fall back to questionnaire.
6. Answer questions, optionally using the voice helper.
7. Customize visual/material selections.
8. Generate project brief and estimate.
9. Confirm address.
10. Create project.
11. Generate trade slots.
12. Dispatch trade slots.

## LiDAR and Measurement Flow

Important files:

- `src/app/(homeowner)/room-scan.tsx`
- `src/app/(homeowner)/room-results.tsx`
- `src/components/room-scan/FloorPlanView.tsx`
- `src/components/room-scan/RoomSummaryCard.tsx`
- `src/components/room-scan/USDZViewer.tsx`
- `src/lib/room-scan.ts`
- `src/lib/room-scan/normalizeFloorPlan.ts`

The app supports:

- iOS RoomPlan/LiDAR scan
- 2D floor plan result view
- room dimensions
- measurements persisted into the project wizard
- manual measurement fallback

RoomPlan data is treated as meters and converted to feet for wizard fields.

## Voice-Assisted Project Creation

Important file:

- `src/lib/project-voice.ts`

The project creation questionnaire supports a voice-assist layer. It is designed to help answer questions by speech, while still requiring the user to do visual/manual actions like photo upload.

Important guardrail:

- voice answers should confirm before being applied
- voice should not replace required upload or measurement actions

## AI and Design/Customizer Features

Important files:

- `src/components/project/RoomCustomizer3D.tsx`
- `src/components/project/RoomMaterialCustomizer.tsx`
- `src/lib/room-customizer.ts`
- `src/lib/visual-preview.ts`
- `src/app/(homeowner)/project/create/renders.tsx`

The app includes:

- AI photo analysis
- AI project brief generation
- AI questionnaire generation with fallback questions
- visual finish/customization components
- 3D room/kitchen/bathroom style customization surfaces

The app does not rely only on static AI images for customization. The current direction is toward a controlled 3D/customizer experience where users can select finishes and materials.

## Account Type: Company / Trade Contractor

Companies are trade contractors. They receive trade-specific job invitations and execute work.

Major screens:

- `src/app/(company)/index.tsx`
- `src/app/(company)/calendar.tsx`
- `src/app/(company)/earnings.tsx`
- `src/app/(company)/profile.tsx`
- `src/app/(company)/onboarding/business.tsx`
- `src/app/(company)/onboarding/license.tsx`
- `src/app/(company)/onboarding/insurance.tsx`
- `src/app/(company)/job/[id]/index.tsx`
- `src/app/(company)/job/[id]/quote-builder.tsx`
- `src/app/(company)/job/[id]/materials.tsx`
- `src/app/(company)/job/[id]/milestones.tsx`
- `src/app/(company)/job/[id]/messages.tsx`
- `src/app/(company)/job/[id]/change-orders.tsx`
- `src/app/(company)/job/[id]/warranties.tsx`
- `src/app/(company)/job/[id]/review.tsx`

Company responsibilities:

- complete business/license/insurance onboarding
- receive job/slot dispatches
- accept assigned trade slots
- submit quotes and line items
- verify material quantities
- upload progress/milestone proof
- communicate with homeowner/GC
- submit change orders
- complete assigned work

Company is not General Contractor. Any old `general_contractor` company trade value is legacy only.

Latest simulator verification:

- QA company logs into `Trade Desk`.
- Assigned quoting jobs load.
- The quote editor loads existing pending quote data, editable line items, and balanced milestone totals.
- Quote submission was not pressed during the latest pass to avoid changing live QA data.

## Account Type: Supplier

Suppliers fulfill material orders.

Major screens:

- `src/navigation/SupplierNavigator.tsx`
- `src/app/(supplier)/orders/index.tsx`
- `src/app/(supplier)/orders/active.tsx`
- `src/app/(supplier)/orders/[id]/index.tsx`
- `src/app/(supplier)/catalog/index.tsx`
- `src/app/(supplier)/catalog/add.tsx`
- `src/app/(supplier)/catalog/[id]/index.tsx`
- `src/app/(supplier)/earnings/index.tsx`
- `src/app/(supplier)/profile/index.tsx`
- `src/app/(supplier)/onboarding/business.tsx`
- `src/app/(supplier)/onboarding/license.tsx`
- `src/app/(supplier)/onboarding/categories.tsx`

Supplier responsibilities:

- create supplier profile
- upload license
- choose product categories
- maintain catalog
- claim eligible material orders
- process/ship/deliver orders
- upload delivery proof
- receive payout after homeowner confirms receipt

Supplier setup readiness includes:

- verified supplier row
- license number
- license document
- selected categories
- Stripe payout readiness for claiming paid order workflows

Latest simulator verification:

- QA supplier logs into Open Orders and sees the correct empty state when no open material orders exist.
- Catalog loads existing in-stock materials.
- Earnings loads paid-to-date, processing totals, and order history.
- Profile loads verified supplier status, license, Stripe payout readiness, service radius, and supply categories.
- Supplier earnings and profile metric cards were adjusted so mobile currency and metric values do not wrap or truncate.

Mutation-sensitive supplier actions were not pressed during the latest pass:

- add item
- stock toggles
- order status updates
- payout setup actions

## Account Type: General Contractor

General Contractor is the fourth role and has its own app surface.

Major screens:

- `src/navigation/GeneralContractorNavigator.tsx`
- `src/app/(general-contractor)/index.tsx`
- `src/app/(general-contractor)/approvals.tsx`
- `src/app/(general-contractor)/profile.tsx`
- `src/app/(general-contractor)/onboarding/business.tsx`
- `src/app/(general-contractor)/onboarding/license.tsx`
- `src/app/(general-contractor)/onboarding/insurance.tsx`
- `src/app/(general-contractor)/project/create.tsx`
- `src/app/(general-contractor)/project/[id]/index.tsx`
- `src/app/(general-contractor)/project/[id]/assistant.tsx`
- `src/app/(general-contractor)/project/[id]/materials.tsx`
- `src/app/(general-contractor)/project/[id]/trades.tsx`
- `src/app/(general-contractor)/project/[id]/schedule.tsx`
- `src/app/(general-contractor)/project/[id]/permits.tsx`
- `src/app/(general-contractor)/project/[id]/messages.tsx`
- `src/app/(general-contractor)/project/[id]/payments.tsx`
- `src/app/(general-contractor)/project/[id]/discovery.tsx`
- `src/app/(general-contractor)/project/[id]/completion.tsx`

GC responsibilities:

- create or manage renovation projects
- coordinate trades
- recommend scope/material/schedule changes
- manage permits and inspections
- communicate with homeowner/trades/suppliers through the shared project message thread
- send project message photo attachments with optional captions while management is active
- request homeowner approval for major decisions
- request GC payment/deposit/progress/final payment approval
- coordinate project closeout and completion binder
- review completed project records read-only after closeout
- review completed project assistant summaries as historical context without stale active-risk or pending-action prompts

GC cannot:

- release escrow funds without homeowner approval
- approve homeowner spending alone
- activate change orders without homeowner approval
- silently replace trades/materials without homeowner approval
- change schedule, payments, materials, trades, or discovery records after the GC assignment is completed

## Concierge / GC Management Model

The homeowner remains the project owner and final approval authority.

GC can recommend:

- materials
- trades
- schedules
- scope changes
- payment requests
- permit/inspection actions
- completion status

Homeowner approval remains required for major project changes.

Important screens:

- homeowner side: `src/app/(homeowner)/project/[id]/concierge.tsx`
- GC side: `src/app/(general-contractor)/approvals.tsx`

Completed GC-managed projects retain read-only access to:

- schedule history
- permit and inspection records
- payment request history
- material orders and substitutions
- trade assignments and negotiations
- discovery/change records
- project messages
- assistant summaries
- closeout binder

## Trade Slots and Dispatch

Important files:

- `supabase/migrations/009_trade_slots.sql`
- `supabase/functions/generate-trade-slots/index.ts`
- `supabase/functions/dispatch-slots/index.ts`
- `supabase/functions/accept-job/index.ts`
- `src/lib/project-dispatch.ts`

Flow:

1. Project brief/estimate identifies required work.
2. `generate-trade-slots` creates trade slots.
3. `dispatch-slots` sends slots to matching companies.
4. Company accepts a slot through `accept-job`.
5. When all required slots are filled, scheduling proceeds.

Supported trade slot types include:

- plumber
- electrician
- tile installer
- cabinet installer
- painter
- flooring installer
- drywall
- demolition

The legacy `general_contractor` trade type exists in old schema context, but the product model now treats GC as a separate role.

## Material Ordering

Important files:

- `supabase/functions/generate-material-orders/index.ts`
- `supabase/functions/claim-material-order/index.ts`
- `supabase/functions/supplier-payout/index.ts`
- `src/app/(homeowner)/project/[id]/materials.tsx`
- `src/app/(company)/job/[id]/materials.tsx`
- `src/app/(general-contractor)/project/[id]/materials.tsx`
- `src/app/(supplier)/orders/index.tsx`
- `src/app/(supplier)/orders/[id]/index.tsx`

Material flow:

1. Project creates material rows from AI brief/BOM.
2. Company can verify material quantities.
3. Material orders are generated after schedule confirmation or repair flow.
4. Eligible suppliers can claim fixed-price orders.
5. Supplier uploads delivery proof.
6. Homeowner confirms receipt.
7. Supplier payout is released.

Recent GC authorization update:

- `generate-material-orders` now allows active verified GC managers to repair/generate material orders for managed projects, while preserving homeowner and assigned company access.
- This updated function was deployed to Supabase project `wgbloslndalmocckrejw`.

## Payments and Payouts

Important files:

- `supabase/functions/create-payment-intent/index.ts`
- `supabase/functions/release-milestone/index.ts`
- `supabase/functions/supplier-payout/index.ts`
- `supabase/functions/create-connect-account/index.ts`
- `supabase/functions/create-gc-concierge-payment-intent/index.ts`
- `supabase/functions/gc-concierge-payout/index.ts`
- `src/lib/payments.ts`
- `src/lib/payouts.ts`

Payment model:

- Homeowner authorizes project payments.
- Company milestone payouts require homeowner authority.
- Supplier payouts require delivery proof and homeowner confirmation.
- GC concierge payments and payouts are separate from trade quote approval.
- Stripe Connect payout readiness is cached in account profile tables.

App UI should not show WalkerAI internal commission, platform fee, or markup economics to user roles.

## Notifications and Push

Important files:

- `src/app/notifications.tsx`
- `src/app/(homeowner)/notifications.tsx`
- `src/components/notifications/NotificationButton.tsx`
- `src/lib/notifications/meta.ts`
- `src/lib/notifications/navigation.ts`
- `src/lib/push/index.ts`
- `supabase/functions/send-push/index.ts`

Notification model:

- notifications are stored in Supabase
- role-aware routing maps notification type/payload to app screens
- notification load/read failures use app-safe fallback copy instead of raw Supabase error text
- push notifications use APNs on iOS
- APNs setup depends on Apple key/team/bundle secrets in Supabase

GC notifications route into GC screens when the current user is a GC.

Transient infrastructure errors such as network failures or database timeouts are normalized through `src/lib/supabase/functions.ts` so screens can show polished fallback copy instead of database wording.

## Database and Schema Areas

Important schema families:

- users
- companies
- suppliers
- general_contractors
- projects
- project_slots
- general_contractor_projects
- project_approval_requests
- gc_payment_requests
- gc_concierge_bookings
- gc_trade_quote_negotiations
- quotes
- quote_line_items
- milestones
- materials
- material_orders
- supplier_catalog
- messages
- notifications
- permits/warranties/change-order tables

RLS and triggers are heavily used to protect:

- role/profile boundaries
- homeowner-owned actions
- company project participation
- supplier material-order access
- GC readiness and project-control authority
- Stripe payout readiness fields

## Supabase Edge Functions

Current function directory includes:

- `accept-job`
- `analyze-photos`
- `claim-material-order`
- `create-connect-account`
- `create-gc-concierge-payment-intent`
- `create-payment-intent`
- `dispatch-job`
- `dispatch-slots`
- `expand-dispatch`
- `gc-concierge-payout`
- `generate-diy-guide`
- `generate-material-orders`
- `generate-project-brief`
- `generate-questionnaire`
- `generate-render`
- `generate-trade-slots`
- `release-milestone`
- `send-push`
- `stripe-webhook`
- `supplier-payout`

One-off helper sources exist locally:

- `create-test-user`
- `seed-qa`

These should not remain deployed casually. `create-test-user` was temporarily deployed to reset QA accounts and then deleted.

## Storage and Documents

The app uses Supabase Storage for:

- project photos
- progress photos
- license documents
- insurance documents
- supplier delivery proof
- permit documents
- warranty documents
- avatar/profile assets

Document preview and private document storage helpers live in:

- `src/lib/document-preview.ts`
- `src/lib/supabase/storage.ts`

## Reviews and Ratings

Review-related files:

- `src/app/(homeowner)/project/[id]/review.tsx`
- `src/app/(company)/job/[id]/review.tsx`
- `src/app/(homeowner)/my-reviews.tsx`
- migrations related to project/company/supplier/GC reviews

Homeowners can review companies and GCs participating in a project.

## QA Accounts

Live QA accounts:

- Homeowner: `qa-homeowner@walkerai.app`
- Company: `qa-company@walkerai.app`
- Supplier: `qa-supplier@walkerai.app`
- General Contractor: `qa-gc@walkerai.app`

Credentials:

- `/Users/raahilshaik/Downloads/walkerai-qa-credentials.txt`

Verification status as of this document:

- all four logins authenticate
- company is verified and payout-ready
- supplier is verified and payout-ready
- GC is verified, concierge-enabled, and payout-ready

## Testing

Main commands:

```bash
npx tsc --noEmit
npm test -- --runInBand
git diff --check
```

QA account commands:

```bash
WALKERAI_QA_CREDENTIALS="$HOME/Downloads/walkerai-qa-credentials.txt" node scripts/check-qa-credentials.mjs
```

Full suite at last green run before this document:

- 49 Jest suites
- 333 tests

The suite count may change as tests are added.

## Known Product/Engineering Gaps

Known items that still need careful verification or product decisions:

1. Full four-account runtime walkthrough has started and read-only surfaces were verified, but mutation-sensitive paths still need a controlled QA scenario.
2. GC-created projects for homeowners without existing accounts need invite/account-claiming product design.
3. Supabase deployed function/schema drift should be checked before relying on the full production backend as current.
4. APNs push delivery depends on Apple/Supabase APNs secrets being set correctly.
5. TestFlight archive should be re-run after final GC/account changes and after Apple account signing issues are resolved.
6. LiDAR should be tested on physical iOS hardware; simulator can only cover non-LiDAR fallbacks.
