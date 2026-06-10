---
date: 2026-06-08
author: claude
status: awaiting-approval
target: production (wgbloslndalmocckrejw)
---

# Deploy Plan: Sync Production Backend with App Code

## Goal

Make the deployed Supabase project (`wgbloslndalmocckrejw`) match what the app
expects so users hit a coherent backend instead of a half-audited one.

## Current state (audited 2026-06-08)

**Edge functions (18 total):**
- `analyze-photos` is current (v18, deployed 2026-06-07 in this session)
- **17 others are stale** — last updates 2026-05-09 → 2026-05-29. They miss
  hardening from the audit (provider fallbacks, schema-compat guards, budget
  normalization, milestone proof requirements, dispatch window enforcement,
  DIY ownership validation, real error surfacing).

**Migrations — out of sync in BOTH directions:**
- **18 migrations exist on remote that are NOT in our repo** (timestamps
  `20260528212207` through `20260530051623`, applied via Dashboard SQL or
  out-of-band CLI between May 28–30, never committed to git).
- **47 migrations exist in our repo that are NOT applied to remote** (the
  June 4–5 audit batch).
- Local schema state is genuinely unknown — we don't have SQL files for
  what the 18 remote migrations actually changed.

The Supabase CLI's `db pull` won't run cleanly because of this mismatch.

## Risk assessment

| Action | Risk | Mitigation |
|---|---|---|
| Deploy edge functions | LOW. Stateless. Each deploy is atomic. Previous versions remain available via `supabase functions list` for rollback. | Deploy in small batches, smoke test after each batch. |
| Push migrations blind | HIGH. 18 unknown schema changes already on remote. Our migrations may collide (e.g. `ADD COLUMN` that already exists, `DROP` of something already dropped, RLS policies that re-add removed ones). | Do NOT push blind. Reconcile first. |
| Mark remote migrations as "reverted" (CLI's suggestion) | VERY HIGH. They ARE applied. Lying to the history table would let our migrations re-apply schema changes that were already done. | Never do this. |

## Proposed plan — two independent streams

### Stream A: Deploy 17 stale edge functions (do this first, safely)

This unblocks ~80% of the audit value because the bugs were mostly in
function logic, not schema. No migration risk.

**Sequence:**
```bash
# 1. Snapshot current versions so we know what to roll back to if needed
supabase functions list --project-ref wgbloslndalmocckrejw > /tmp/walkerai-fn-versions-before.txt

# 2. Deploy in topological order (lower-risk first, payment/auth-critical last)
#    Group 1: read-only / generation functions (no money, no auth state)
supabase functions deploy generate-questionnaire --project-ref wgbloslndalmocckrejw
supabase functions deploy generate-project-brief --project-ref wgbloslndalmocckrejw
supabase functions deploy generate-diy-guide --project-ref wgbloslndalmocckrejw
supabase functions deploy generate-render --project-ref wgbloslndalmocckrejw
supabase functions deploy generate-trade-slots --project-ref wgbloslndalmocckrejw
supabase functions deploy generate-material-orders --project-ref wgbloslndalmocckrejw

#    Group 2: dispatch + acceptance (no money, but workflow-critical)
supabase functions deploy dispatch-slots --project-ref wgbloslndalmocckrejw
supabase functions deploy dispatch-job --project-ref wgbloslndalmocckrejw
supabase functions deploy expand-dispatch --project-ref wgbloslndalmocckrejw
supabase functions deploy accept-job --project-ref wgbloslndalmocckrejw
supabase functions deploy claim-material-order --project-ref wgbloslndalmocckrejw

#    Group 3: notifications
supabase functions deploy send-push --project-ref wgbloslndalmocckrejw

#    Group 4: PAYMENT FUNCTIONS — highest stakes, deploy last with verification between each
supabase functions deploy create-connect-account --project-ref wgbloslndalmocckrejw
supabase functions deploy create-payment-intent --project-ref wgbloslndalmocckrejw
supabase functions deploy stripe-webhook --project-ref wgbloslndalmocckrejw
supabase functions deploy supplier-payout --project-ref wgbloslndalmocckrejw
supabase functions deploy release-milestone --project-ref wgbloslndalmocckrejw

# 3. Verify all came up clean
supabase functions list --project-ref wgbloslndalmocckrejw > /tmp/walkerai-fn-versions-after.txt
diff /tmp/walkerai-fn-versions-before.txt /tmp/walkerai-fn-versions-after.txt
```

**Smoke test after deploy** (you on iPhone, me watching logs):
1. Create new project → photos → analyze (already tested, should work)
2. Generate brief
3. Confirm dispatch
4. Have contractor accept (will need a Company QA account)

**Rollback:** Each function deploy is independently revertible.
```bash
# Find the prior version ID from supabase dashboard, then:
supabase functions deploy <name> --import-map <prev_dir> --project-ref wgbloslndalmocckrejw
# OR: re-deploy from a prior git commit
git checkout <prior-sha> -- supabase/functions/<name>
supabase functions deploy <name> --project-ref wgbloslndalmocckrejw
git checkout HEAD -- supabase/functions/<name>
```

**Time:** ~5 min deploy + 15-30 min smoke test.

---

### Stream B: Reconcile migrations (DO NOT START WITHOUT FURTHER INVESTIGATION)

This one needs more discovery before action. Two options:

**Option B1 — Discovery first, then push (recommended)**
1. Use Supabase Dashboard SQL editor to query `supabase_migrations.schema_migrations`
   and pull the actual SQL of each of the 18 remote-only migrations.
2. Commit those 18 SQL files to `supabase/migrations/` to recover lost history.
3. For each of our 47 local migrations, run a dry-run inspection: read what
   it does, query the current remote schema, decide if it's a no-op,
   conflict, or genuine new change.
4. Group into:
    - **Safe to apply as-is** (genuine new schema changes)
    - **Need rewrite** (would conflict — e.g., already-added column)
    - **Already applied** (mark as applied without running)
5. Apply in groups via Dashboard SQL editor with manual review.

**Estimated time:** 2-3 hours of careful work, mostly reading SQL.

**Option B2 — Take a backup, mark all-applied, push remaining (faster but riskier)**
1. `pg_dump` the entire production DB to a local file (safety net).
2. `supabase migration repair --status applied <each-of-18-remote-only>` to
   reconcile history (tells CLI: we know these were applied).
3. `supabase db push` — runs our 47 against current state.
4. If anything fails, manually fix or restore from dump.

**Estimated time:** ~1 hour, but with non-trivial probability of breakage.

---

## My recommendation

1. **Today: do Stream A only.** Low risk, immediate value, unblocks all the
   function-level audit fixes for live users.
2. **After Stream A is stable:** spend a session on Stream B Option B1 —
   it's the careful path and the only one that gives us a clean foundation
   going forward.
3. Don't touch payment functions in Stream A without you also doing a real
   payment smoke test right after (in test mode).

## What I need from you to proceed

- ✅ Approve Stream A (edge function deploys) → I'll execute today
- ✅ Approve me running the SAME Stream A with you watching, NOT
  background — so we can stop immediately if anything looks wrong
- ⏸ Defer Stream B decision until Stream A is verified clean

## Rollback contact + state

- Project ref: `wgbloslndalmocckrejw`
- Dashboard: https://supabase.com/dashboard/project/wgbloslndalmocckrejw
- Current function versions snapshotted before deploy:
  `/tmp/walkerai-fn-versions-before.txt`
