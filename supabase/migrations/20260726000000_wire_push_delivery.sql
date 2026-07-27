-- Wire the notifications table to the send-push edge function.
--
-- Until now, rows inserted into public.notifications were shown in-app (via
-- Supabase Realtime) but nothing triggered an OS push. The row -> send-push
-- bridge lived only as a dashboard Database Webhook (not in version control) or
-- was never configured. This migration captures that bridge as code: an AFTER
-- INSERT trigger that calls the send-push function through pg_net.
--
-- The send-push URL and the service-role key are read from Supabase Vault so no
-- secret is committed here. Set them once (outside version control) with:
--   select vault.create_secret('https://<ref>.functions.supabase.co/send-push', 'send_push_url');
--   select vault.create_secret('<service_role_key>', 'service_role_key');
-- Until both secrets exist, the trigger is a safe no-op (the notification row
-- is still created and shown in-app; only the push is skipped).

create extension if not exists pg_net;

create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_service_key text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets
    where name = 'send_push_url'
    limit 1;

  select decrypted_secret into v_service_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;

  -- Secrets not configured yet: skip delivery, keep the in-app notification.
  if v_url is null or v_service_key is null then
    return new;
  end if;

  -- pg_net queues the request and returns immediately, so this never blocks the
  -- INSERT. Any failure here must not break notification creation.
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'notification_id', new.id,
        'user_id', new.user_id,
        'type', new.type,
        'payload', coalesce(new.payload, '{}'::jsonb)
      )
    );
  exception when others then
    raise warning 'dispatch_push_notification failed for notification %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists dispatch_push_notification_trigger on public.notifications;
create trigger dispatch_push_notification_trigger
  after insert on public.notifications
  for each row
  execute function public.dispatch_push_notification();

revoke all on function public.dispatch_push_notification() from public, anon, authenticated;
