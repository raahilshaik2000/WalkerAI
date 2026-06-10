// One-off QA account seeder. Creates 3 auth users (homeowner, company,
// supplier) and seeds minimal profile rows so the E2E test plan can run
// without manual onboarding.
//
// Idempotent: if a user already exists by email, the function updates
// rather than re-inserts, so it's safe to re-invoke.
//
// Delete after use:
//   supabase functions delete _seed-qa --project-ref <ref>

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SeedRequest {
  homeowner_email: string;
  homeowner_password: string;
  company_email: string;
  company_password: string;
  supplier_email: string;
  supplier_password: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body: SeedRequest = await req.json();

    const homeowner = await ensureUser(supabase, body.homeowner_email, body.homeowner_password, 'homeowner');
    const company = await ensureUser(supabase, body.company_email, body.company_password, 'company');
    const supplier = await ensureUser(supabase, body.supplier_email, body.supplier_password, 'supplier');

    // ── Homeowner: just the users row ─────────────────────────────
    await supabase.from('users').upsert({
      id: homeowner.id,
      email: body.homeowner_email,
      role: 'homeowner',
      full_name: 'QA Homeowner',
    }, { onConflict: 'id' });

    // ── Company: profile + Stripe Connect test stubs ──────────────
    await supabase.from('users').upsert({
      id: company.id,
      email: body.company_email,
      role: 'company',
      full_name: 'QA Company Owner',
    }, { onConflict: 'id' });

    const companyRow = {
      user_id: company.id,
      business_name: 'QA Test Renovations Inc.',
      license_number: 'QA-LICENSE-001',
      service_radius_km: 50,
      trade_types: ['general_contractor'],
      primary_trade: 'general_contractor',
      city: 'Toronto',
      province: 'ON',
      postal_code: 'M5V 3A8',
      latitude: 43.6532,
      longitude: -79.3832,
      stripe_account_id: 'acct_qa_company_test',
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_onboarding_completed: true,
      is_verified: true,
    };
    const { error: companyError } = await supabase.from('companies').upsert(companyRow, { onConflict: 'user_id' });
    if (companyError && !/duplicate|already/i.test(companyError.message ?? '')) {
      console.warn('company upsert:', companyError.message);
    }

    // ── Supplier: profile + Stripe Connect test stubs ─────────────
    await supabase.from('users').upsert({
      id: supplier.id,
      email: body.supplier_email,
      role: 'supplier',
      full_name: 'QA Supplier Owner',
    }, { onConflict: 'id' });

    const supplierRow = {
      user_id: supplier.id,
      business_name: 'QA Test Building Supply Co.',
      license_number: 'QA-SUPPLY-001',
      service_radius_km: 100,
      categories: ['cabinets', 'countertops', 'tile', 'fixtures'],
      city: 'Toronto',
      province: 'ON',
      postal_code: 'M5V 3A8',
      latitude: 43.6532,
      longitude: -79.3832,
      stripe_account_id: 'acct_qa_supplier_test',
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_onboarding_completed: true,
      is_verified: true,
    };
    const { error: supplierError } = await supabase.from('suppliers').upsert(supplierRow, { onConflict: 'user_id' });
    if (supplierError && !/duplicate|already/i.test(supplierError.message ?? '')) {
      console.warn('supplier upsert:', supplierError.message);
    }

    return new Response(JSON.stringify({
      success: true,
      accounts: {
        homeowner: { id: homeowner.id, email: body.homeowner_email },
        company: { id: company.id, email: body.company_email },
        supplier: { id: supplier.id, email: body.supplier_email },
      },
      notes: [
        'Stripe Connect IDs are placeholder strings for E2E flows that gate on stripe_*_enabled.',
        'Real payment tests require live Stripe test-mode keys + real Connect onboarding.',
        'Company is configured as general_contractor in Toronto, 50km radius.',
        'Supplier is configured with 4 categories in Toronto, 100km radius.',
      ],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('seed error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

async function ensureUser(
  supabase: ReturnType<typeof createClient>,
  email: string,
  password: string,
  role: string,
): Promise<{ id: string }> {
  // Try to find an existing user first; if so, update password rather than
  // create. This makes the seed idempotent.
  const { data: existingList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = existingList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { role },
    });
    return { id: existing.id };
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });
  if (error || !data?.user) throw new Error(`createUser(${email}): ${error?.message ?? 'no user'}`);
  return { id: data.user.id };
}
