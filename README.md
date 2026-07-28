# WalkerAI

WalkerAI is an AI-powered home renovation platform (kitchen and bathroom focused, Canada / CAD first) that connects homeowners with verified local trades, material suppliers, and general contractors. A homeowner uploads photos of a room, AI produces a renovation plan with a measured budget and material scope, the project is dispatched to matched pros, and the whole job runs inside the app: quoting, milestone or trade based payments held in Stripe escrow, material ordering from suppliers, completion, reviews, and warranties. There is also a standalone "DIY Guide" mode where AI generates step by step instructions instead of dispatching a pro.

This README documents the entire app: the systems, the account types, the end to end processes, and every screen in sequence.

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [Tech stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Accounts and user roles](#4-accounts-and-user-roles)
5. [Systems](#5-systems)
6. [End-to-end processes](#6-end-to-end-processes)
7. [App pages, every screen in sequence](#7-app-pages-every-screen-in-sequence)
8. [Backend reference](#8-backend-reference)
9. [State management](#9-state-management)
10. [`src/lib` module reference](#10-srclib-module-reference)
11. [Notification types](#11-notification-types)
12. [Environment variables and API keys](#12-environment-variables-and-api-keys)
13. [Getting started](#13-getting-started)
14. [Project structure](#14-project-structure)
15. [Testing](#15-testing)
16. [Known items and notes](#16-known-items-and-notes)

---

## 1. Product overview

The value proposition, taken from the welcome screen (`src/app/(auth)/index.tsx`): "Your renovation, reimagined. AI planning meets verified contractors." Three pillars:

- Upload photos, get an AI generated renovation plan.
- Get measured budgeting and material scope.
- Get matched with verified local pros.

The platform manages the full lifecycle: project brief, AI photo analysis, dispatch to trades or a general contractor, quoting, milestone or trade based payments via Stripe Connect, material ordering from suppliers, and completion with reviews and warranties. A separate DIY track produces an AI generated step by step guide with a materials list.

The app is currently **iOS focused**. Push notifications use a custom native APNs module (no Firebase / FCM). Room scanning has both an iOS (ARKit RoomPlan) and Android (ARCore) native path, but push does not have an Android path yet.

---

## 2. Tech stack

| Library | Role |
|---|---|
| `react-native` 0.84, `react` 19.2 | Core framework |
| TypeScript 5.8 | Language; path alias `@/*` maps to `src/*` |
| `zustand` 5.0 | Client state (auth, profile, project wizard, DIY wizard) |
| `@tanstack/react-query` 5.90 | Server state fetching and caching in screens |
| `@react-navigation/native` + `stack` + `bottom-tabs` 7.x | Navigation (nested stacks + tab navigators per role) |
| `@stripe/stripe-react-native` 0.59 | Payments UI (Payment Sheet, Connect onboarding) |
| `@supabase/supabase-js` 2.99 | Backend client (Auth, Postgres, Storage, Realtime, Edge Functions) |
| `@notifee/react-native` 9.1 | Foreground / local notification display and tap handling |
| `react-native-reanimated` 4.2 + `react-native-worklets` | Animations |
| `react-native-vector-icons` 10.3 | Iconography |
| `react-native-image-picker` 8.2 | Photo capture and upload |
| `react-native-config` 1.6 | `.env` into compiled `Config.*` bindings (client-safe keys only) |
| `@react-native-async-storage/async-storage` | Session and Zustand persistence |
| `@shopify/flash-list`, `react-native-svg`, `react-native-linear-gradient`, `react-native-haptic-feedback`, `react-native-screens`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-splash-screen`, `react-native-url-polyfill` | UI, performance, and platform plumbing |

Backend: Supabase (Postgres with RLS + PostGIS + pg_cron, Auth, Edge Functions on Deno, Realtime, Storage, Vault) and Stripe Connect for escrow and payouts. AI via Anthropic Claude (vision) and OpenAI (gpt-4o), plus the Reimagine Home API for room renders.

---

## 3. Architecture

**Client (React Native, iOS focused):** a single Supabase client (`src/lib/supabase/client.ts`) backs Auth, data, storage, realtime, and edge-function calls. `src/navigation/RootNavigator.tsx` reads the signed in user's role and mounts one of five top level navigators (Auth, Homeowner, Company, Supplier, GeneralContractor). State is split between Zustand (auth/profile/wizards) and React Query (server data). Native iOS modules add push (APNs), room scanning (RoomPlan), a 3D room customizer (SceneKit), and voice input (Speech.framework).

**Backend (Supabase):** Postgres with Row Level Security on essentially every table, 190 migrations, and 24 Deno edge functions that own all privileged operations (dispatch, payments, payouts, AI generation, push). Stripe is integrated through `create-payment-intent`, `create-connect-account`, and a single `stripe-webhook` that is the source of truth for funding and disputes. In-app notifications are delivered live via Realtime; OS push is delivered by a `pg_net` database trigger that calls the `send-push` edge function.

**Money math** lives in one canonical file (`src/lib/master-quote.ts`, unit tested) and is intentionally duplicated inside the Deno edge functions, which cannot import from `src/`.

---

## 4. Accounts and user roles

Roles are defined in `src/constants/enums.ts`:

```ts
export type UserRole = 'homeowner' | 'company' | 'supplier' | 'general_contractor' | 'admin';
export type PublicSignupRole = Exclude<UserRole, 'admin'>;
```

| Role | What it is and can do | Navigator |
|---|---|---|
| **homeowner** | The consumer. Creates renovation projects (photos, AI analysis, questionnaire, AI render, brief, confirm), tracks milestones / permits / quotes / materials / warranties, messages the trade, pays via Stripe, or runs the separate DIY flow. Tabs: Dashboard, Projects, Post, Messages, Profile. | `HomeownerNavigator` |
| **company** | A trade / renovation company (the "contractor" account). Receives dispatched jobs, builds quotes, manages calendar / milestones / change orders / materials / warranties / reviews, has Stripe Connect payouts, and completes business / license / insurance onboarding gated by a pending-verification screen. Tabs: Jobs, Calendar, Earnings, Profile. | `CompanyNavigator` |
| **supplier** | A materials vendor. Manages a catalog, fulfills material orders (feed, claim, ship, deliver), tracks earnings, and completes business / license / category onboarding. Tabs: Orders, Catalog, Earnings, Profile. | `SupplierNavigator` |
| **general_contractor** | A higher level account distinct from "company." Manages a full project workspace: creates GC projects, approves scope / schedule / payment / trade substitution requests, tracks discovery / trades / permits / materials / payments / completion, and applies markup and concierge fees. Tabs: Projects, Approvals, Profile. | `GeneralContractorNavigator` |
| **admin** | Exists in the enum, excluded from public signup, with no in-app navigator. Internal / backend only. |

**Role resolution:** on every auth state change, `RootNavigator.applySession()` queries `public.users` for the signed in user and drives which navigator renders. It uses a graceful column degradation fallback (retries with fewer columns if a column is missing) to survive schema drift, and shows an "Account setup incomplete" / "Account temporarily unavailable" fallback (with Sign Out) rather than crashing if the role is missing or the profile query fails.

---

## 5. Systems

- **Auth.** Supabase email/password. `signUp(email, password, role)` (`src/lib/supabase/auth.ts`) passes the role in signup metadata; a Postgres trigger (`011_auth_user_trigger.sql`) provisions the `public.users` row. Sessions persist across restarts via AsyncStorage (`autoRefreshToken`, `persistSession`). A `sameUser` check prevents a token refresh from blanking the navigator mid flow.

- **Projects and AI.** A homeowner project moves from photos to an AI room analysis (`analyze-photos`, Claude vision), to a brief with materials / scope / cost range / permits (`generate-project-brief`, OpenAI gpt-4o), to trade slots (`generate-trade-slots`). Optional AI room renders come from the Reimagine Home API (`generate-render`). The DIY track uses `generate-diy-guide` (Claude vision). Every AI path has a deterministic fallback so the wizard never hard blocks.

- **Dispatch.** `generate-trade-slots` creates one `project_slots` row per required trade, ordered by a construction sequence (`work_order`: demolition first, painter last). `dispatch-slots` matches verified companies by trade type and PostGIS radius (50/75/100/150 km rounds), logs attempts in `dispatch_logs`, and marks slots `dispatching`. First company to accept wins. `expand-dispatch` (pg_cron, every 2h) widens the radius on timeout or gives up after 4 rounds.

- **Quotes, payments, and escrow.** Two models coexist. Legacy per-quote: a company builds a `quotes` row with `quote_line_items` and `milestones`. Master (default): each trade's payout is locked at acceptance in `project_slots.payout_cents`. `create-payment-intent` captures funds immediately to the WalkerAI platform balance (escrow), avoiding the 7 day PaymentIntent expiry. `stripe-webhook` is the single source of truth for `payment_intent.succeeded` (funds the project), `account.updated` (Connect readiness), and `charge.dispute.*` (flags the project disputed).

- **Payouts.** Legacy `release-milestone` transfers a milestone amount minus commission (default 10%). Master `release-trade-payout` releases the pre-locked per trade amount, strictly in `work_order` sequence, and notifies the next trade's company (`trade_turn_started`). `supplier-payout` pays a delivered material order minus a platform fee (default 8%). `gc-concierge-payout` pays a GC 80% of a concierge booking.

- **Materials.** When a project goes active, `generate-material-orders` creates one `material_orders` row per material with a rule based CAD price and a supplier category, then notifies nearby verified suppliers. A supplier claims via `claim-material-order`, updates status through processing, shipped, delivered, and is paid via `supplier-payout` once a delivery photo is present.

- **General Contractor concierge.** A homeowner can link a GC (`general_contractor_projects`: invited, active, completed, removed). An active, fully verified GC gains dispatch / brief / material authority over the project. GCs can broker trade price negotiations (`gc_trade_quote_negotiations`) and sell concierge bookings. Every GC recommendation flows through a homeowner approval gate (`project_approval_requests`); nothing becomes authoritative without homeowner approval.

- **Notifications and push.** Any code path that inserts a `notifications` row drives both the in-app feed (via Realtime) and an OS push. A `pg_net` `AFTER INSERT` trigger on `public.notifications` calls the `send-push` edge function, which fans out to active iOS `device_tokens` over APNs (ES256 JWT), honoring `notification_preferences` and marking dead tokens inactive. The trigger reads its URL and service-role key from Supabase Vault and is a safe no-op until push secrets are configured.

- **Disputes and warranties.** The `disputes` table blocks payout release while a dispute is open. Stripe chargebacks (`charge.dispute.created` / `closed`) independently flag and restore `projects.status = 'disputed'`. The `warranties` table stores post completion documents with an expiry, surfaced by a `warranty_expiring` notification.

- **Room scan, voice, and customizer (native iOS).** RoomPlan / ARKit scanning captures room dimensions; a SceneKit customizer swaps surface materials; Speech.framework powers voice driven questionnaire answers. Android has an ARCore room scan path.

- **Storage.** Eight Supabase Storage buckets (`src/lib/supabase/storage.ts`): `project-photos`, `renders`, `permits`, `warranties`, `change-order-docs`, `company-docs`, `progress-photos`, `avatars`. Local `file://` URIs are uploaded via raw XHR with the session token; base64 uploads retry with backoff.

---

## 6. End-to-end processes

### Project lifecycle (`ProjectStatus`)

```
draft -> brief_ready -> dispatching -> scheduling -> active -> completed
                                    (legacy path: accepted / quoting)
                       side states: cancelled, disputed, diy_saved
```

1. **draft.** Homeowner creates a project and uploads photos; `analyze-photos` writes `projects.ai_analysis`.
2. **brief_ready.** `generate-project-brief` (or `generate-trade-slots` for the master model) sets `ai_cost_min/max` and populates `materials`, `scope_of_work`, `permits`.
3. **dispatching.** `dispatch-slots` matches verified companies, inserts `dispatch_logs`; `expand-dispatch` widens the radius on timeout.
4. **acceptance.** A company calls `accept-job`; `atomic_accept_slot` fills the slot and locks `payout_cents` (master) or auto-creates a quote and milestones (legacy).
5. **scheduling.** Once all slots are filled the project moves to `scheduling`; the homeowner confirms dates.
6. **funding.** `create-payment-intent` creates the per-quote or master project PaymentIntent; `stripe-webhook`'s `payment_intent.succeeded` funds it.
7. **active.** `activateProjectAfterPayment` sets the project active and calls `generate-material-orders`.
8. **completion and payout.** Contractors mark work complete with photo evidence; the homeowner releases payouts (`release-trade-payout` or `release-milestone`). When all trades / milestones are paid, the project completes.
9. **disputes.** A Stripe chargeback flags the project disputed; a homeowner can also route to DIY (`diy_saved`).

### Trade dispatch

Slots are created in construction order and dispatched by trade type + radius. The first company to `accept-job` a slot wins via an advisory-lock RPC; other pending dispatches on that slot flip to `filled`. `expand-dispatch` (every 2h) times out unaccepted dispatches, widens the radius up to 4 rounds, then reverts the project to `brief_ready` with a `dispatch_no_match` notification. Sequential trades are paid strictly by `work_order`; paying one unlocks the next (`trade_turn_started`).

### Payments and escrow

Funds are captured immediately to the WalkerAI platform balance (true escrow) so milestone / trade releases can lag without hitting the PaymentIntent auth window. `stripe-webhook` owns funding, Connect readiness sync, dispute flagging, and transfer reversals, and is idempotent via `processed_stripe_events`.

### Payout models

- **Legacy per-milestone** (`release-milestone`): quote approved, milestone complete with evidence, no active dispute; commission deducted per transfer with the remainder swept on the final milestone.
- **Master / trade sequential** (`release-trade-payout`): payout locked at acceptance as `avg(estimated_cost_min, estimated_cost_max) * (1 - platform_margin_pct)`; WalkerAI's margin is the implicit gap between the master total and the sum of trade payouts and is never shown to the homeowner. Trades pay in `work_order` order; the last trade paid auto-completes the project (unless a GC is managing, which adds a completion approval gate).

### Materials

active project -> `generate-material-orders` (one order per material, rule based CAD price, supplier category) -> nearby suppliers notified -> `claim-material-order` (supplier claims, price locked) -> status processing / shipped / delivered -> `supplier-payout` (requires a delivery photo).

### General Contractor concierge

Management invite (`general_contractor_projects`) -> an active, fully verified GC gains project authority -> trade price negotiations (`gc_trade_quote_negotiations`) and concierge bookings (`gc_concierge_bookings`, paid via `create-gc-concierge-payment-intent`, released 80% via `gc-concierge-payout`) -> every recommendation gated through `project_approval_requests`.

---

## 7. App pages, every screen in sequence

Navigation entry: `src/navigation/RootNavigator.tsx` mounts one top level navigator based on session + role. Registration allows any of homeowner / company / supplier / general_contractor.

### 7.1 Auth and onboarding (all roles start here)

1. **Welcome** (`src/app/(auth)/index.tsx`) - animated landing screen with the logo and value props; links to Login / Register.
2. **Login** (`src/app/(auth)/login.tsx`) - email and password sign in.
3. **Register** (`src/app/(auth)/register.tsx`) - sign up with a role selector, email, password, confirm.

### 7.2 Homeowner

**Bottom tabs (`HomeownerTabs`):**

- **Dashboard** (`(homeowner)/index.tsx`) - home feed: quick actions, projects carousel, inspiration carousel, activity timeline.
- **Projects** (`(homeowner)/projects.tsx`) - list of projects with progress rings and status.
- **Post** - intercepted tab; opens a sheet with "Post a Project" and "DIY Guide."
- **Messages** (`(homeowner)/messages.tsx`) - message threads per project.
- **Profile** (`(homeowner)/profile.tsx`) - profile summary and links to settings / edit / reviews.

**Project creation wizard, in order** (`(homeowner)/project/create/`):

1. **RoomType** (`room-type.tsx`) - pick Kitchen or Bathroom.
2. **Photos** (`photos.tsx`) - upload 4 to 12 room photos.
3. **Measurements** (`measurements.tsx`) - enter room dimensions manually.
4. **Analyzing** (`analyzing.tsx`) - progress screen while photos + measurements upload to AI analysis.
5. **Questionnaire** (`questionnaire.tsx`) - fixed scope / quality / preference questions (voice capable).
6. **Renders** (`renders.tsx`) - view AI generated design renders.
7. **Brief** (`brief.tsx`) - full brief and estimate: cost range, confidence, quantities, materials.
8. **MaterialDetail** (`material-detail.tsx`) - change a material line item's quality tier / price.
9. **Address** (`address.tsx`) - enter / confirm the property address (voice assisted).
10. **Confirm** (`confirm.tsx`) - final confirmation; submits and dispatches the project.

Related capture screens: **RoomScan** (`(homeowner)/room-scan.tsx`, ARKit / ARCore capture), **RoomResults** (`room-results.tsx`, review the scanned plan / 3D model), **ManualMeasurement** (`manual-measurement.tsx`, fallback entry).

**DIY wizard, in order:**

1. **DIYStart** (`project/create/diy-start.tsx`) - pick a DIY category and describe the task.
2. **DIYPhotos** (`diy-photos.tsx`) - upload 2 to 8 photos.
3. **DIYDetails** (`diy-details.tsx`) - skill level, timeline, budget.
4. **DIYGenerating** (`diy-generating.tsx`) - loading while the AI builds the guide.
5. **DIYGuide** (`(homeowner)/diy-guide.tsx`) - finished guide with Steps and Materials tabs.

**Project detail sub-stack** (`(homeowner)/project/[id]/`):

- **ProjectDetailMain** (`index.tsx`) - overview and links to all sub pages.
- **ChangeOrders** (`change-orders.tsx`) - request / approve scope and cost changes.
- **Messages** (`messages.tsx`) - chat with the assigned contractor.
- **Milestones** (`milestones.tsx`) - milestone checklist with photo proof.
- **Permits** (`permits.tsx`) - upload / view permit and inspection docs.
- **Quote** (`quote.tsx`) - view and pay the contractor's quote (Stripe).
- **Review** (`review.tsx`) - rate the contractor after completion.
- **Materials** (`materials.tsx`) - track material orders and payment status.
- **ProjectSchedule** (`schedule.tsx`) - view / edit scheduled dates.
- **Warranties** (`warranties.tsx`) - warranty documents and coverage.
- **Concierge** (`concierge.tsx`) - book / manage and pay a GC concierge service.

**Other homeowner screens:** Settings (`settings.tsx`), Notifications (shared `src/app/notifications.tsx`), Search (`search.tsx`), FindPro (`find-pro.tsx`), BrowseIdeas (`browse-ideas.tsx`), Schedule (`schedule.tsx`), InspirationDetail (`inspiration-detail.tsx`), NewsDetail (`news-detail.tsx`), Chat (`chat.tsx`), EditProfile (`edit-profile.tsx`), MyReviews (`my-reviews.tsx`), SavedAddresses (`saved-addresses.tsx`).

### 7.3 Company / trade

**Bottom tabs (`CompanyTabs`):** Jobs (`(company)/index.tsx`), Calendar (`calendar.tsx`), Earnings (`earnings.tsx`), CompanyProfile (`profile.tsx`).

**Onboarding, in order:** BusinessOnboarding (`(company)/onboarding/business.tsx`), LicenseOnboarding (`onboarding/license.tsx`), InsuranceOnboarding (`onboarding/insurance.tsx`), PendingVerification (`pending-verification.tsx`).

**Job detail sub-stack** (`(company)/job/[id]/`): JobDetailMain (`index.tsx`), JobChangeOrders (`change-orders.tsx`), JobMessages (`messages.tsx`), JobMilestones (`milestones.tsx`, also hosts the "I'm on my way" and payout release actions), QuoteBuilder (`quote-builder.tsx`), JobMaterials (`materials.tsx`), JobWarranties (`warranties.tsx`), JobReview (`review.tsx`). Plus Notifications (shared).

### 7.4 General Contractor

**Bottom tabs (`GeneralContractorTabs`):** Projects (`(general-contractor)/index.tsx`), Approvals (`approvals.tsx`), Profile (`profile.tsx`).

**Onboarding, in order:** BusinessOnboarding (`onboarding/business.tsx`), LicenseOnboarding (`onboarding/license.tsx`), InsuranceOnboarding (`onboarding/insurance.tsx`).

**Create project:** GeneralContractorCreateProject (`project/create.tsx`).

**Project detail screens** (`(general-contractor)/project/[id]/`): ProjectDetail (`index.tsx`), Discovery and Changes (`discovery.tsx`), Trade Management (`trades.tsx`), Schedule Center (`schedule.tsx`), Permits and Inspections (`permits.tsx`), Payment Requests (`payments.tsx`), Material Sourcing (`materials.tsx`), Messages (`messages.tsx`), Completion binder (`completion.tsx`), Project Assistant (`assistant.tsx`). Plus Notifications (shared).

### 7.5 Supplier

**Bottom tabs (`SupplierTabs`):** Open Orders (`(supplier)/orders/index.tsx`), My Catalog (`catalog/index.tsx`), Earnings (`earnings/index.tsx`), Profile (`profile/index.tsx`).

**Onboarding, in order:** BusinessOnboarding (`onboarding/business.tsx`), LicenseOnboarding (`onboarding/license.tsx`), CategoriesOnboarding (`onboarding/categories.tsx`), PendingVerification (`pending-verification.tsx`).

**Orders and catalog:** SupplierActiveOrders (`orders/active.tsx`), SupplierOrderDetail (`orders/[id]/index.tsx`), SupplierAddCatalogItem (`catalog/add.tsx`), SupplierEditCatalogItem (`catalog/[id]/index.tsx`), SupplierProjectMessages (reuses the homeowner project messages screen). Plus Notifications (shared).

### 7.6 Shared screens

`src/app/notifications.tsx` is a single notifications feed registered on all four role stacks. The homeowner project messages screen is reused by the supplier navigator. (`src/app/index.tsx` is unused RN boilerplate; `(homeowner)/project-detail-view.tsx` exists but is not wired into any navigator.)

---

## 8. Backend reference

### Edge functions (24, `supabase/functions/`)

**Dispatch:** `generate-trade-slots` (decide trades + order), `dispatch-slots` (match companies by trade + radius), `expand-dispatch` (cron radius widening / give up), `accept-job` (atomic slot / job acceptance).

**AI:** `analyze-photos` (Claude vision room analysis), `generate-project-brief` (OpenAI gpt-4o materials / scope / cost / permits), `generate-diy-guide` (Claude vision DIY steps), `generate-render` (Reimagine Home room renders).

**Payments / Stripe:** `create-payment-intent` (legacy or master escrow PaymentIntent), `stripe-webhook` (funding, Connect sync, disputes; idempotent), `create-connect-account` (Express Connect onboarding link), `refresh-connect-status` (cheap readiness re-sync), `stripe-return` (post onboarding landing page), `create-gc-concierge-payment-intent` (pay a concierge booking).

**Payouts:** `release-milestone` (legacy per milestone), `release-trade-payout` (master sequential per trade), `supplier-payout` (delivered material order), `gc-concierge-payout` (80% GC split).

**Materials:** `generate-material-orders` (create orders + notify suppliers), `claim-material-order` (supplier claims, price locked).

**Push:** `send-push` (APNs fan out with per type copy and preference gating).

**Admin / QA:** `create-test-user`, `seed-qa` (both secret gated), `delete-project`.

### Core data model (`supabase/migrations/`, 190 files, RLS on essentially every table)

| Table | Purpose |
|---|---|
| `users` | App account per Supabase auth user; `role`, `stripe_customer_id`, profile fields |
| `companies` | Trade contractor profile; `verified`, `trade_types[]`, Stripe Connect flags, `lat/lng`, `service_radius_km` |
| `suppliers` | Material supplier profile; `categories[]`, radius, Connect, `verified` |
| `general_contractors` | GC / concierge account; `verified`, `concierge_enabled`, default markup and fee percents, license / insurance docs |
| `projects` | Central renovation job; `status`, `ai_cost_min/max`, `payment_model` (legacy / master), `payment_status`, `master_total_cents`, `platform_margin_pct`, `dispatch_round`, `scheduling_status` |
| `project_slots` | One row per required trade; `trade_type`, `status`, `assigned_company_id`, `work_order`, `payout_cents`, `payout_status`, `en_route_at` |
| `quotes`, `quote_line_items` | Legacy contractor price and its breakdown |
| `milestones` | Legacy per quote payment tranches |
| `material_orders`, `materials` | Auto-generated procurement orders and the project's material list |
| `notifications` | In-app feed; `type`, `payload` JSONB, `read`, plus push delivery columns |
| `device_tokens`, `notification_preferences` | Push token registry and per user opt-in |
| `disputes`, `dispatch_logs` | Dispute records and per company dispatch attempts |
| `general_contractor_projects` | GC management link to a project |
| `gc_concierge_bookings`, `gc_trade_quote_negotiations` | Paid concierge services and GC brokered price negotiations |
| `project_approval_requests` | Generic homeowner approval gate for GC recommendations |
| Supporting | `project_photos`, `renders`, `scope_of_work`, `permits`, `reviews`, `warranties`, `change_orders`, `supplier_catalog`, `material_order_bids`, `processed_stripe_events` |

`src/constants/enums.ts` is the canonical TypeScript mirror of the DB check constraints (`ProjectStatus`, `MilestoneStatus`, `QuoteStatus`, `DispatchResponse`, `MaterialOrderStatus`, `NotificationType`, etc.).

### Infrastructure

- Supabase project ref `wgbloslndalmocckrejw`; iOS bundle id `com.walkerai.app`.
- Postgres + RLS, Auth (email/password with a signup trigger), Edge Functions (Deno), Realtime (drives the in-app notification feed), Storage (8 buckets), Vault (`send_push_url`, `service_role_key` for the push bridge).
- `notifications` to `send-push` bridge: `supabase/migrations/20260726000000_wire_push_delivery.sql` adds a `pg_net` `AFTER INSERT` trigger that reads the Vault secrets and posts to `send-push`; it is a safe no-op until the secrets exist.
- Native iOS modules: RoomPlan scanning, SceneKit customizer, Speech.framework voice, custom APNs push.

---

## 9. State management

**Zustand stores (`src/stores/`):**

- `useAuthStore` (`auth.store.ts`) - session, resolved role, `hydrated`; persists session only.
- `useProfileStore` (`profile.store.ts`) - cached profile fields, notification prefs, app prefs (Face ID, location, analytics, appearance); persisted.
- `useProjectWizardStore` (`project-wizard.store.ts`) - the homeowner post-a-project wizard state (address, photos, room type, AI analysis, questionnaire, render, measurements, material overrides, step); in memory.
- `useDIYWizardStore` (`diy-wizard.store.ts`) - the DIY flow state (category, photos, budget, skill, resulting guide); in memory.

**React Query** handles server-state fetching and caching inside screens. The Supabase client is shared, with wrappers for user-safe error formatting (`supabase/functions.ts`), storage (`supabase/storage.ts`), and schema-drift detection (`supabase/errors.ts`).

---

## 10. `src/lib` module reference

**Payments / payouts:** `payments.ts`, `payouts.ts`, `company-payouts.ts`, `stripe.ts`, `stripe-connect.ts`, `master-quote.ts` (+ test, the canonical money rules), `gc-markup.ts`.

**Quotes / pricing / measurements:** `currency.ts`, `measurements.ts`, `material-orders.ts`, `material-detail-route.ts`, `data/pricing-reference.ts`.

**Dispatch / project lifecycle:** `project-dispatch.ts`, `project-activation.ts`, `project-analysis.ts`, `project-share.ts`, `project-voice.ts`, `homeowner-schedule.ts`, `general-contractor.ts`, `gc-project-type.ts`, `trade-labels.ts`, `company-calendar.ts`.

**Room scan / visual:** `room-scan.ts`, `room-scan/normalizeFloorPlan.ts`, `room-scan/floorPlanGeometry.ts`, `room-customizer.ts`, `visual-preview.ts`.

**Notifications:** `notifications/meta.ts` (display metadata), `notifications/navigation.ts` (`resolveNotificationRoute` / `toRootNotificationRoute` deep-link routing), `push/index.ts` (APNs registration + token save + tap handling).

**Formatting / misc:** `canada.ts`, `dates.ts`, `document-preview.ts`, `formatters.ts`, `navigation-params.ts`, `supplier-catalog.ts`, `supplier-onboarding.ts`.

---

## 11. Notification types

Notifications drive both the in-app feed and OS push. Types are declared in `src/constants/enums.ts`, given copy in `supabase/functions/send-push/index.ts`, display metadata in `src/lib/notifications/meta.ts`, and deep-link routing in `src/lib/notifications/navigation.ts`. Categories:

- **Dispatch / jobs:** `job_dispatched`, `slot_dispatched`, `job_accepted`, `slot_accepted`, `job_filled`, `all_slots_filled`, `schedule_confirmed`, `dispatch_no_match`.
- **Quotes / funding:** `quote_submitted`, `quote_approved`, `project_funded`.
- **Trades / milestones:** `trade_en_route` (the "I'm on my way" event), `trade_needs_approval`, `milestone_needs_approval`, `milestone_completed`, `trade_turn_started`.
- **Payouts:** `milestone_paid`, `trade_payout_paid`, `supplier_paid`, `gc_concierge_payout_released`.
- **Payments:** `payment_failed`, `payment_disputed`, `payment_dispute_resolved`, `dispute_raised`.
- **Materials:** `new_material_order`, `material_order_claimed`, `order_shipped`, `order_delivered`, `bid_selected`, `bid_rejected`.
- **General Contractor:** `gc_management_invited`, `gc_management_invite_received`, `gc_management_confirmed`, `gc_approval_requested`, `gc_approval_responded`, `gc_payment_requested`, `gc_payment_responded`, `gc_concierge_booking_requested`, `gc_concierge_booking_responded`, `gc_concierge_booking_paid`, `gc_trade_negotiation_requested`, `gc_trade_negotiation_responded`.
- **Other:** `new_message`, `project_complete`, `warranty_expiring`.

---

## 12. Environment variables and API keys

The app needs the keys below. **Values are never committed.** Copy `.env.example` to `.env` and fill it in locally. `react-native-config` compiles every value in `.env` into the app binary, so **only publishable / public keys belong there** and real secrets live as Supabase Edge Function secrets. `npm run secrets:check` (also runs before `start` / `ios` / `android`) fails the build if a server secret ends up in `.env`.

### 1. Client `.env` (publishable / public only, shipped in the app binary)

| Key | What it is |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (public) |
| `SUPABASE_ANON_KEY` | Supabase publishable / anon key (safe in clients; protected by RLS) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_...`; a committed fallback also exists in `src/lib/stripe.ts`) |

Do not put any secret (`sk-...`, service role, Stripe secret, etc.) here. There is no Google Maps key; address lookup uses keyless OpenStreetMap Nominatim.

### 2. Supabase Edge Function secrets (server side, `supabase secrets set ...`)

Read with `Deno.env.get(...)` in `supabase/functions/*`. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase, so you typically only set the rest.

| Key | Used by |
| --- | --- |
| `ANTHROPIC_API_KEY` (opt. `ANTHROPIC_VISION_MODEL`) | AI photo analysis + DIY guide generation |
| `OPENAI_API_KEY` | Project brief + trade-slot generation |
| `REIMAGINE_API_KEY` | Room re-imagine renders |
| `STRIPE_SECRET_KEY` | Payments / payouts / Connect |
| `STRIPE_WEBHOOK_SECRET` | Verifying Stripe webhook signatures |
| `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_USE_PRODUCTION` | iOS push (APNs) via the `send-push` function; use `APNS_USE_PRODUCTION=true` for TestFlight / App Store |
| `QA_SEED_SECRET` | QA seeding functions (also mirrored in `.env` for `npm run qa:*`) |

### 3. Supabase Vault secrets (for the notifications to push bridge)

Set in the SQL editor so the `notifications` INSERT trigger can call `send-push`:

| Secret name | What it is |
| --- | --- |
| `send_push_url` | The deployed `send-push` function URL |
| `service_role_key` | Service-role key used by the trigger to authenticate its call |

---

## 13. Getting started

> Complete the [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment) first. This app is iOS focused.

### Step 1: Install

```sh
npm install
cd ios && bundle install && bundle exec pod install && cd ..
```

Copy `.env.example` to `.env` and fill in the client keys (see [Environment variables](#12-environment-variables-and-api-keys)).

### Step 2: Start Metro

```sh
npm start
```

### Step 3: Build and run

```sh
# iOS
npm run ios

# Android
npm run android
```

Other scripts: `npm test` (Jest), `npm run lint` (ESLint), `npm run secrets:check` (fails if a server secret is in `.env`), `npm run qa:check` / `npm run qa:reset` (QA credential helpers).

### Backend

The Supabase backend lives in `supabase/`. Apply migrations with `supabase db push` and deploy functions with `supabase functions deploy <name>`. Server secrets are set with `supabase secrets set ...`; the push bridge also needs the two Vault secrets above.

---

## 14. Project structure

```
src/
  app/                # Screens, grouped by role: (auth) (homeowner) (company) (supplier) (general-contractor)
  navigation/         # RootNavigator + per-role navigators
  components/          # Shared UI (ui/, company/, notifications/, ...)
  lib/                # Domain logic: payments, dispatch, notifications, room-scan, supabase wrappers, ...
  stores/             # Zustand stores (auth, profile, project wizard, DIY wizard)
  constants/          # enums.ts (roles, statuses, notification types), theme
  data/               # Pricing reference tables
ios/                  # Native iOS app + custom modules (Push, RoomPlan, RoomCustomizer, Voice)
android/              # Native Android app (includes ARCore room scan)
supabase/
  functions/          # 24 Deno edge functions
  migrations/         # 190 SQL migrations
scripts/              # check-client-secrets.mjs, QA credential helpers
__tests__/            # Jest suites
```

---

## 15. Testing

Jest is the test runner (`npm test`). The suites under `__tests__/` cover money math (`master-quote`), notification wiring (`notifications-meta`, `notifications-navigation`), edge function source guards (`supabase-functions`), and domain logic (materials, general contractor, payments, dates, currency, etc.). Many suites read source files and assert invariants (for example, that every live notification type is registered across the sender, enum, meta, and routing), so adding a notification type requires updating all four places.

---

## 16. Known items and notes

- **iOS first.** Push is iOS only (custom APNs, no FCM). Room scan has an Android ARCore path; push does not.
- **Push delivery** requires the APNs secrets and the two Vault secrets to be set; the code fails soft (`push_error='APNS_NOT_CONFIGURED'`) when they are missing.
- **Two payment models** coexist (legacy per-quote and master per-trade); master is the default for new projects.
- **Vestigial Maps dependency:** `.env.example` history and `react-native-google-places-autocomplete` remain, but address lookup uses keyless Nominatim; there is no Google Maps key.
- **Unused files:** `src/app/index.tsx` (RN boilerplate) and `src/app/(homeowner)/project-detail-view.tsx` (not wired into any navigator).
- Additional product narrative lives in `docs/` and `CLAUDE.md`.
