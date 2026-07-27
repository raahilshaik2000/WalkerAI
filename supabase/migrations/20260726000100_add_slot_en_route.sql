-- "I'm on my way": let the assigned company mark a trade slot as en route.
--
-- A nullable timestamp (not a new slot status) so the existing
-- open/dispatching/filled/scheduled state machine is untouched. The assigned
-- company writes this from the client the same way it already writes
-- completion_submitted_at (see src/app/(company)/job/[id]/milestones.tsx),
-- so the existing company slot-update RLS already scopes the write to the
-- company's own assigned slot. No new policy is required.

alter table public.project_slots
  add column if not exists en_route_at timestamptz;

comment on column public.project_slots.en_route_at is
  'Set when the assigned company taps "I''m on my way". Null until then; drives the trade_en_route notification and the homeowner on-the-way indicator.';
