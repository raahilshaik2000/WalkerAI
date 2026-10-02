import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateOrdersBody {
  project_id: string;
}

type QualityTier = 'budget' | 'mid-range' | 'luxury';
type SupplierCategory =
  | 'Cabinets & Storage'
  | 'Countertops & Surfaces'
  | 'Tile & Flooring'
  | 'Plumbing Fixtures'
  | 'Lighting & Electrical'
  | 'Appliances'
  | 'Hardware & Fixtures'
  | 'Paint & Wall Coverings'
  | 'Lumber & Structural'
  | 'Windows & Doors'
  | 'Insulation & Drywall'
  | 'Other';

interface UnitPrice {
  low: number;
  avg: number;
  high: number;
  unit: string;
}

type JoinedGcProfile = {
  id?: string;
  verified: boolean | null;
  business_name: string | null;
  city: string | null;
  province: string | null;
  lat: number | null;
  lng: number | null;
  license_number: string | null;
  license_doc_url: string | null;
  insurance_doc_url: string | null;
};

const MATERIAL_PRICE_RULES: Array<[RegExp, UnitPrice]> = [
  [/custom cabinet|custom cab/i, { unit: 'LF', low: 260, avg: 380, high: 600 }],
  [/semi[- ]custom/i, { unit: 'LF', low: 180, avg: 280, high: 420 }],
  [/vanity cabinet/i, { unit: 'EA', low: 220, avg: 480, high: 950 }],
  [/kitchen cabinet|cabinet/i, { unit: 'LF', low: 120, avg: 190, high: 300 }],
  [/marble|granite|stone|premium countertop/i, { unit: 'LF', low: 80, avg: 130, high: 220 }],
  [/quartz/i, { unit: 'LF', low: 60, avg: 95, high: 150 }],
  [/countertop|laminate countertop/i, { unit: 'LF', low: 25, avg: 40, high: 65 }],
  [/shower tile/i, { unit: 'SQF', low: 6, avg: 10, high: 18 }],
  [/backsplash/i, { unit: 'SQF', low: 5, avg: 9, high: 16 }],
  [/wall tile/i, { unit: 'SQF', low: 5, avg: 8, high: 15 }],
  [/floor tile|tile/i, { unit: 'SQF', low: 4, avg: 7, high: 12 }],
  [/engineered hardwood|hardwood/i, { unit: 'SQF', low: 4.5, avg: 7.5, high: 12 }],
  [/vinyl plank|lvp|vinyl/i, { unit: 'SQF', low: 2.5, avg: 4.25, high: 7 }],
  [/laminate/i, { unit: 'SQF', low: 2, avg: 3.5, high: 6 }],
  [/toilet/i, { unit: 'EA', low: 250, avg: 425, high: 700 }],
  [/bathtub|bath tub|soaker tub|freestanding tub/i, { unit: 'EA', low: 500, avg: 1100, high: 2200 }],
  [/shower base|shower pan/i, { unit: 'EA', low: 180, avg: 350, high: 750 }],
  [/shower valve|shower trim/i, { unit: 'EA', low: 150, avg: 300, high: 650 }],
  [/shower head|showerhead/i, { unit: 'EA', low: 80, avg: 180, high: 300 }],
  [/vanity/i, { unit: 'EA', low: 400, avg: 850, high: 1500 }],
  [/sink faucet|kitchen faucet|faucet/i, { unit: 'EA', low: 90, avg: 180, high: 350 }],
  [/sink|basin/i, { unit: 'EA', low: 120, avg: 240, high: 500 }],
  [/bathroom fan|exhaust fan|ventilation fan/i, { unit: 'EA', low: 90, avg: 180, high: 380 }],
  [/pot light|recessed light|potlight/i, { unit: 'EA', low: 18, avg: 35, high: 75 }],
  [/gfi|gfci|ground fault/i, { unit: 'EA', low: 18, avg: 32, high: 55 }],
  [/light fixture|lighting fixture|light/i, { unit: 'EA', low: 50, avg: 140, high: 350 }],
  [/waterproof membrane|waterproofing membrane/i, { unit: 'SQF', low: 2, avg: 3.5, high: 5.5 }],
  [/ceiling paint/i, { unit: 'Gallon', low: 22, avg: 36, high: 60 }],
  [/primer/i, { unit: 'Gallon', low: 18, avg: 28, high: 45 }],
  [/paint/i, { unit: 'Gallon', low: 25, avg: 40, high: 70 }],
  [/moisture resistant drywall|cement board/i, { unit: 'Sheet', low: 20, avg: 28, high: 40 }],
  [/drywall/i, { unit: 'Sheet', low: 16, avg: 22, high: 35 }],
  [/baseboard/i, { unit: 'LF', low: 1.2, avg: 2.2, high: 4.2 }],
  [/casing/i, { unit: 'LF', low: 1.3, avg: 2.4, high: 4.5 }],
  [/door hardware/i, { unit: 'EA', low: 22, avg: 45, high: 95 }],
  [/interior door|door slab/i, { unit: 'EA', low: 120, avg: 240, high: 500 }],
];

function estimateFixedPriceCents(itemName: string, quantity: number, qualityTier: QualityTier | null): number {
  const rule = MATERIAL_PRICE_RULES.find(([pattern]) => pattern.test(itemName));
  const price = rule?.[1] ?? { unit: 'EA', low: 40, avg: 75, high: 140 };
  const unitPrice = qualityTier === 'luxury' ? price.high : qualityTier === 'mid-range' ? price.avg : price.low;
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  return Math.max(100, Math.round(unitPrice * safeQuantity * 100));
}

function effectiveMaterialQuantity(material: any): number {
  const quantity = Number(material.verified_quantity ?? material.quantity ?? 1);
  return Number.isFinite(quantity) ? quantity : 0;
}

function supplierCategoryForMaterial(itemName: string): SupplierCategory {
  if (/cabinet|vanity cabinet|storage|shelv/i.test(itemName)) return 'Cabinets & Storage';
  if (/countertop|quartz|granite|marble|stone|laminate countertop|surface/i.test(itemName)) return 'Countertops & Surfaces';
  if (/tile|floor|hardwood|vinyl|lvp|laminate|backsplash/i.test(itemName)) return 'Tile & Flooring';
  if (/toilet|tub|shower|faucet|sink|basin|valve|plumbing/i.test(itemName)) return 'Plumbing Fixtures';
  if (/light|lighting|pot light|recessed|gfi|gfci|electrical|fan|ventilation/i.test(itemName)) return 'Lighting & Electrical';
  if (/appliance|range|oven|fridge|refrigerator|dishwasher|microwave|hood/i.test(itemName)) return 'Appliances';
  if (/hardware|hinge|pull|handle|knob|door hardware/i.test(itemName)) return 'Hardware & Fixtures';
  if (/paint|primer|wall covering|wallpaper/i.test(itemName)) return 'Paint & Wall Coverings';
  if (/lumber|stud|plywood|subfloor|joist|beam|framing/i.test(itemName)) return 'Lumber & Structural';
  if (/window|door|casing|baseboard|trim/i.test(itemName)) return 'Windows & Doors';
  if (/drywall|cement board|insulation|membrane|waterproof/i.test(itemName)) return 'Insulation & Drywall';
  return 'Other';
}

function extractCatalogItemId(material: any): string | null {
  const notesMatch = material.contractor_notes?.match(/Walker catalog item ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (notesMatch) return notesMatch[1];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (material.specific_model && uuidRegex.test(material.specific_model)) {
    return material.specific_model;
  }
  return null;
}

function extractCatalogSku(material: any): string | null {
  const skuMatch = material.contractor_notes?.match(/SKU\s+([A-Za-z0-9_-]+)/i);
  if (skuMatch) return skuMatch[1];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (material.specific_model && !uuidRegex.test(material.specific_model)) {
    return material.specific_model;
  }
  return null;
}

function extractCatalogUnitPriceCents(material: any): number | null {
  const match = material.contractor_notes?.match(/Catalog unit price \$?([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (match) {
    const dollars = parseFloat(match[1]);
    if (!isNaN(dollars) && dollars > 0) {
      return Math.round(dollars * 100);
    }
  }
  return null;
}

function buildMaterialOrderNotes(material: any, catalogSku?: string | null, unitPriceNote?: string | null): string {
  const details = [
    catalogSku ? `Supplier SKU: ${catalogSku}` : null,
    unitPriceNote ? `Pricing reference: ${unitPriceNote}` : null,
    material.brand_preference ? `Brand: ${material.brand_preference}` : null,
    material.color_finish ? `Color/finish: ${material.color_finish}` : null,
    material.specific_model ? `Product/model: ${material.specific_model}` : null,
    material.contractor_notes ? `Homeowner notes: ${material.contractor_notes}` : null,
  ].filter(Boolean);

  return [
    'Fixed price generated from Walker AI material pricing reference.',
    ...details,
  ].join('\n');
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  return !!error?.message && /column .* does not exist/i.test(error.message);
}

async function userCompanyId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function companyParticipatesInProject(supabase: any, project: any, companyId: string): Promise<boolean> {
  if (project.assigned_company_id === companyId) return true;

  const { data, error } = await supabase
    .from('project_slots')
    .select('id')
    .eq('project_id', project.id)
    .eq('assigned_company_id', companyId)
    .in('status', ['filled', 'scheduled'])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

function getJoinedGcProfile(row: { general_contractors?: JoinedGcProfile | JoinedGcProfile[] | null }) {
  return Array.isArray(row.general_contractors)
    ? row.general_contractors[0] ?? null
    : row.general_contractors ?? null;
}

function hasCompleteGcWorkflowProfile(gc: JoinedGcProfile | null | undefined) {
  return gc?.verified === true
    && !!gc.business_name?.trim()
    && !!gc.city?.trim()
    && !!gc.province?.trim()
    && typeof gc.lat === 'number'
    && typeof gc.lng === 'number'
    && !!gc.license_number?.trim()
    && !!gc.license_doc_url?.trim()
    && !!gc.insurance_doc_url?.trim();
}

async function userGeneralContractorId(supabase: any, userId: string): Promise<string | null> {
  const { data: appUser, error: appUserError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (appUserError) throw appUserError;
  if (appUser?.role === 'general_contractor') {
    const { data, error } = await supabase
      .from('general_contractors')
      .select('id, verified, business_name, city, province, lat, lng, license_number, license_doc_url, insurance_doc_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return hasCompleteGcWorkflowProfile(data as JoinedGcProfile | null) ? data.id : null;
  }

  return null;
}

async function generalContractorManagesProject(supabase: any, projectId: string, generalContractorId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('general_contractor_projects')
    .select(`
      id,
      general_contractors!inner (
        verified, business_name, city, province, lat, lng,
        license_number, license_doc_url, insurance_doc_url
      )
    `)
    .eq('project_id', projectId)
    .eq('general_contractor_id', generalContractorId)
    .eq('status', 'active')
    .eq('general_contractors.verified', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const gc = data ? getJoinedGcProfile(data as { general_contractors?: JoinedGcProfile | JoinedGcProfile[] | null }) : null;
  return hasCompleteGcWorkflowProfile(gc);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isServiceRoleCall = authHeader === `Bearer ${serviceRoleKey}`;
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey,
    );

    const { project_id }: GenerateOrdersBody = await req.json();
    if (!project_id) throw new Error('project_id required');

    let requesterId: string | null = null;
    if (!isServiceRoleCall) {
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      requesterId = user.id;
    }

    // Fetch project for address + delivery deadline info
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, homeowner_id, assigned_company_id, address, city, province, status')
      .eq('id', project_id)
      .single();
    if (projErr || !project) throw new Error('Project not found');
    if (!isServiceRoleCall && project.homeowner_id !== requesterId) {
      const companyId = requesterId ? await userCompanyId(supabase, requesterId) : null;
      const isAssignedContractor = companyId
        ? await companyParticipatesInProject(supabase, project, companyId)
        : false;
      const generalContractorId = !isAssignedContractor && requesterId
        ? await userGeneralContractorId(supabase, requesterId)
        : null;
      const isActiveGcManager = generalContractorId
        ? await generalContractorManagesProject(supabase, project.id, generalContractorId)
        : false;
      if (!isAssignedContractor && !isActiveGcManager) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    if (project.status !== 'active') throw new Error('Project must be active to generate material orders');

    // Fetch all materials for the project that don't yet have an order
    const { data: materials, error: matErr } = await supabase
      .from('materials')
      .select('*')
      .eq('project_id', project_id)
      .is('material_order_id', null);
    if (matErr) throw matErr;
    const orderableMaterials = (materials ?? []).filter((material: any) => effectiveMaterialQuantity(material) > 0);
    if (orderableMaterials.length === 0) {
      return new Response(JSON.stringify({ message: 'No materials to order', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Set delivery deadline = 7 days from now (adjust per project timeline)
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);
    const deliveryDeadline = deadline.toISOString().split('T')[0];

    const deliveryAddress = [project.address, project.city, project.province].filter(Boolean).join(', ');

    // Query supplier_catalog to verify catalog_item_ids and load actual catalog pricing if present
    const candidateCatalogIds = orderableMaterials
      .map(extractCatalogItemId)
      .filter((id): id is string => Boolean(id));

    const catalogMap = new Map<string, any>();
    if (candidateCatalogIds.length > 0) {
      const { data: catalogItems } = await supabase
        .from('supplier_catalog')
        .select('id, sku, price_per_unit, category')
        .in('id', candidateCatalogIds);
      if (catalogItems) {
        for (const item of catalogItems) {
          catalogMap.set(item.id, item);
        }
      }
    }

    // Create one material_order per material
    const orderInserts = orderableMaterials.map((m: any) => {
      const quantity = effectiveMaterialQuantity(m);
      const rawCatalogId = extractCatalogItemId(m);
      const catalogItem = rawCatalogId ? catalogMap.get(rawCatalogId) : null;
      const validCatalogItemId = catalogItem ? catalogItem.id : null;
      const extractedSku = catalogItem?.sku ?? extractCatalogSku(m);
      const catalogUnitPriceCents = catalogItem?.price_per_unit ?? extractCatalogUnitPriceCents(m);
      const fixedPrice = catalogUnitPriceCents != null
        ? Math.max(100, Math.round(catalogUnitPriceCents * quantity))
        : estimateFixedPriceCents(m.item ?? 'Material', quantity, m.quality_tier ?? null);
      const category = catalogItem?.category ?? supplierCategoryForMaterial(m.item ?? 'Material');
      const unitPriceNote = catalogUnitPriceCents != null
        ? `$${(catalogUnitPriceCents / 100).toFixed(2)} / ${m.unit ?? 'unit'}`
        : null;

      return {
        project_id,
        material_id: m.id,
        status: 'open',
        category,
        catalog_item_id: validCatalogItemId,
        quantity_needed: quantity,
        unit: m.unit ?? 'units',
        quality_tier: m.quality_tier ?? null,
        offered_price: fixedPrice,
        final_price: fixedPrice,
        delivery_address: deliveryAddress || null,
        delivery_deadline: deliveryDeadline,
        notes: buildMaterialOrderNotes(m, extractedSku, unitPriceNote),
      };
    });

    let insertResult = await supabase
      .from('material_orders')
      .insert(orderInserts)
      .select('id, material_id, category');
    if (isMissingColumnError(insertResult.error)) {
      insertResult = await supabase
        .from('material_orders')
        .insert(orderInserts.map((order) => (
          Object.fromEntries(Object.entries(order).filter(([key]) => key !== 'category' && key !== 'catalog_item_id'))
        )))
        .select('id, material_id');
    }
    const { data: createdOrders, error: insertErr } = insertResult;
    if (insertErr) throw insertErr;

    // Link each material to its order
    for (const order of (createdOrders ?? [])) {
      const { error: linkErr } = await supabase
        .from('materials')
        .update({ material_order_id: order.id, order_status: 'open' })
        .eq('id', order.material_id);
      if (linkErr) throw linkErr;
    }

    // Notify nearby verified suppliers whose selected categories match at least one order.
    const orderCategories = new Set(orderInserts.map((order) => order.category));
    const { data: suppliers, error: supplierErr } = await supabase.rpc('suppliers_within_radius', { proj_id: project_id });
    if (supplierErr) throw supplierErr;
    const matchedSuppliers = (suppliers ?? []).filter((s: any) =>
      (s.categories ?? []).some((category: SupplierCategory) => orderCategories.has(category))
    );
    if (matchedSuppliers.length > 0) {
      const notifInserts = matchedSuppliers.map((s: any) => ({
        user_id: s.user_id,
        type: 'new_material_order',
        payload: { project_id, order_count: createdOrders?.length ?? 0, city: project.city },
      }));
      const { error: notifErr } = await supabase.from('notifications').insert(notifInserts);
      if (notifErr) throw notifErr;
    }

    return new Response(
      JSON.stringify({ success: true, orders_created: createdOrders?.length ?? 0, suppliers_notified: matchedSuppliers.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
