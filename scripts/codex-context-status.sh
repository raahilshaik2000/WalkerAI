#!/usr/bin/env bash
set -euo pipefail

echo "== WalkerAI Codex Context Status =="
echo "cwd: $(pwd)"
echo "branch: $(git branch --show-current 2>/dev/null || true)"
echo

echo "== Dirty Worktree Summary =="
git status --short | awk '
  { counts[$1] += 1 }
  END {
    if (NR == 0) {
      print "clean"
    } else {
      for (status in counts) print status, counts[status]
    }
  }
'
echo

echo "== Key Validation Commands =="
echo "npx tsc --noEmit --pretty false"
echo "npm run lint -- --quiet"
echo "npm test -- --runInBand"
echo "git diff --check"
echo

if [[ "${1:-}" == "--remote" ]]; then
  echo "== Supabase Drift Quick Checks =="
  if command -v supabase >/dev/null 2>&1; then
  echo "functions:"
  supabase functions list --project-ref wgbloslndalmocckrejw 2>/dev/null \
    | awk 'NR <= 4 || /accept-job|generate-project-brief|generate-render|generate-trade-slots|dispatch-slots|claim-material-order|release-milestone|stripe-webhook|supplier-payout/ { print }' \
    || echo "supabase functions list failed"
  echo
  echo "missing/available key RPCs:"
  supabase db query --linked "select routine_name from information_schema.routines where routine_schema='public' and routine_name in ('atomic_accept_slot','atomic_accept_job','atomic_claim_material_order','supplier_can_fulfill_material_order') order by routine_name;" 2>/dev/null \
    || echo "supabase db query failed"
  else
  echo "supabase CLI not found"
  fi
  echo
else
  echo "== Supabase Drift Quick Checks =="
  echo "skipped; run: bash scripts/codex-context-status.sh --remote"
fi
echo

echo "== Resume Ledger =="
echo "thoughts/shared/handoffs/walkerai-e2e-audit/current.md"
