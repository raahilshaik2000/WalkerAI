// One-off helper. Creates a single auth user + matching public.users row
// with the requested role. Idempotent: if the email already exists, just
// resets the password and confirms the role.
//
// Delete after use:
//   supabase functions delete create-test-user --project-ref <ref>

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateRequest {
  email: string;
  password: string;
  role: 'homeowner' | 'company' | 'supplier';
  full_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body: CreateRequest = await req.json();
    if (!body.email || !body.password || !body.role) {
      return new Response(JSON.stringify({ error: 'email, password, role required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find or create the auth user.
    const { data: existingList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = existingList?.users?.find(
      (u) => u.email?.toLowerCase() === body.email.toLowerCase(),
    );

    let userId: string;
    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, {
        password: body.password,
        email_confirm: true,
        user_metadata: { role: body.role },
      });
      userId = existing.id;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { role: body.role },
      });
      if (error || !data?.user) {
        throw new Error(`createUser failed: ${error?.message ?? 'no user returned'}`);
      }
      userId = data.user.id;
    }

    // Upsert the public.users row.
    const { error: upsertError } = await supabase.from('users').upsert({
      id: userId,
      email: body.email,
      role: body.role,
      full_name: body.full_name ?? null,
    }, { onConflict: 'id' });

    if (upsertError) {
      return new Response(JSON.stringify({
        auth_user_id: userId,
        warning: `auth user ready but public.users upsert failed: ${upsertError.message}`,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      email: body.email,
      role: body.role,
      was_existing: !!existing,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
