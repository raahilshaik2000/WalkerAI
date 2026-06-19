// Public landing page that Stripe redirects the browser to after (or during)
// Connect onboarding. The app has no hosted domain / universal links yet.
//
// NOTE: Supabase forces edge-function responses on the *.supabase.co domain to
// `Content-Type: text/plain` with a sandbox CSP (anti-phishing), so HTML will
// NOT render here — it shows as raw source. We therefore serve a clean,
// ASCII-only plain-text message (no tags, no smart quotes / emoji) so it reads
// properly. The app itself re-syncs payout status when it regains focus, so the
// user just has to swipe back.
//
// Deploy with --no-verify-jwt so Safari can load it without an auth token.

const RETURN_TEXT = [
  "You're all set.",
  '',
  'Your payout details were submitted to Stripe.',
  'Return to the WalkerAI app - your payout status will',
  'update automatically.',
  '',
  'You can close this tab and switch back to WalkerAI.',
].join('\n');

const REFRESH_TEXT = [
  'Your setup link expired.',
  '',
  'Return to the WalkerAI app and tap "Set up payouts"',
  'again to continue.',
].join('\n');

Deno.serve((req) => {
  const url = new URL(req.url);
  const refresh = url.searchParams.get('refresh') === '1';
  return new Response(refresh ? REFRESH_TEXT : RETURN_TEXT, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
});
