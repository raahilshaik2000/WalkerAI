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

const allowedRoles = ['homeowner', 'company', 'supplier', 'general_contractor'] as const;

interface CreateRequest {
  email: string;
  password: string;
  role: 'homeowner' | 'company' | 'supplier' | 'general_contractor';
  full_name?: string;
  business_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // QA-only helper: it mints auth users with the service role, so it must never
  // be invokable without an explicit shared secret. Fails closed — if
  // QA_SEED_SECRET is unset, or the caller doesn't present a matching
  // `x-qa-seed-secret` header, the request is rejected. This keeps the function
  // safe even if it is accidentally deployed to a live project.
  const qaSecret = Deno.env.get('QA_SEED_SECRET');
  if (!qaSecret || req.headers.get('x-qa-seed-secret') !== qaSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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
    if (!allowedRoles.includes(body.role)) {
      return new Response(JSON.stringify({ error: `role must be one of: ${allowedRoles.join(', ')}` }), {
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

    if (body.role === 'company') {
      const { error: companyError } = await supabase.from('companies').upsert({
        user_id: userId,
        name: body.business_name?.trim() || 'QA Trade Company',
        address: '100 King St W',
        license_number: 'QA-LICENSE-001',
        license_doc_url: 'qa/company-license.pdf',
        insurance_doc_url: 'qa/company-insurance.pdf',
        service_radius_km: 50,
        trade_types: [
          'plumber',
          'electrician',
          'tile_installer',
          'cabinet_installer',
          'painter',
          'flooring_installer',
          'drywall',
          'demolition',
        ],
        primary_trade: 'plumber',
        city: 'Toronto',
        province: 'ON',
        postal_code: 'M5V 3A8',
        lat: 43.6532,
        lng: -79.3832,
        stripe_account_id: 'acct_qa_company_test',
        stripe_details_submitted: true,
        stripe_payouts_enabled: true,
        stripe_transfers_active: true,
        verified: true,
      }, { onConflict: 'user_id' });

      if (companyError) {
        return new Response(JSON.stringify({
          auth_user_id: userId,
          warning: `auth user ready but company profile upsert failed: ${companyError.message}`,
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (body.role === 'supplier') {
      const { error: supplierError } = await supabase.from('suppliers').upsert({
        user_id: userId,
        business_name: body.business_name?.trim() || 'QA Building Supplier',
        address: '100 King St W',
        license_number: 'QA-SUPPLY-001',
        license_doc_url: 'qa/supplier-license.pdf',
        service_radius_km: 100,
        categories: ['Cabinets & Storage', 'Countertops & Surfaces', 'Tile & Flooring', 'Plumbing Fixtures'],
        city: 'Toronto',
        province: 'ON',
        postal_code: 'M5V 3A8',
        lat: 43.6532,
        lng: -79.3832,
        stripe_account_id: 'acct_qa_supplier_test',
        stripe_details_submitted: true,
        stripe_payouts_enabled: true,
        stripe_transfers_active: true,
        verified: true,
      }, { onConflict: 'user_id' });

      if (supplierError) {
        return new Response(JSON.stringify({
          auth_user_id: userId,
          warning: `auth user ready but supplier profile upsert failed: ${supplierError.message}`,
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (body.role === 'general_contractor') {
      const { error: gcError } = await supabase.from('general_contractors').upsert({
        user_id: userId,
        business_name: body.business_name?.trim() || 'QA General Contractor',
        address: '100 King St W',
        city: 'Toronto',
        province: 'ON',
        postal_code: 'M5X 1A9',
        lat: 43.6487,
        lng: -79.3817,
        service_radius_km: 100,
        license_number: 'QA-GC-001',
        license_doc_url: 'qa/gc-license.pdf',
        insurance_doc_url: 'qa/gc-insurance.pdf',
        verified: true,
        concierge_enabled: true,
        stripe_account_id: 'acct_qa_gc_test',
        stripe_details_submitted: true,
        stripe_payouts_enabled: true,
        stripe_transfers_active: true,
        default_markup_pct: 15,
        default_concierge_fee_pct: 10,
      }, { onConflict: 'user_id' });

      if (gcError) {
        return new Response(JSON.stringify({
          auth_user_id: userId,
          warning: `auth user ready but GC profile upsert failed: ${gcError.message}`,
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      email: body.email,
      role: body.role,
      was_existing: !!existing,
      profile: profileLabel(body.role),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function profileLabel(role: CreateRequest['role']) {
  if (role === 'company') return 'verified_company';
  if (role === 'supplier') return 'verified_supplier';
  if (role === 'general_contractor') return 'verified_general_contractor';
  return null;
}
