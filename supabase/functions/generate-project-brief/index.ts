import { createClient } from 'jsr:@supabase/supabase-js@2';

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices[0].message.content as string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isMissingColumnError(error: { message?: string } | null | undefined) {
  return !!error?.message && /column .* does not exist/i.test(error.message);
}

type JoinedGcProfile = {
  user_id: string | null;
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

async function isActiveGeneralContractorForProject(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from('general_contractor_projects')
    .select(`
      id,
      general_contractors!inner (
        user_id, verified, business_name, city, province, lat, lng,
        license_number, license_doc_url, insurance_doc_url
      )
    `)
    .eq('project_id', projectId)
    .eq('status', 'active')
    .eq('general_contractors.user_id', userId)
    .eq('general_contractors.verified', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const gc = data ? getJoinedGcProfile(data as { general_contractors?: JoinedGcProfile | JoinedGcProfile[] | null }) : null;
  if (!hasCompleteGcWorkflowProfile(gc)) return false;

  const { data: appUser, error: appUserError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (appUserError) throw appUserError;
  return appUser?.role === 'general_contractor';
}

const PROJECT_TYPES = ['kitchen', 'bathroom', 'flooring', 'painting', 'basement', 'addition', 'other'] as const;
type ProjectType = typeof PROJECT_TYPES[number];

function isProjectType(value: unknown): value is ProjectType {
  return typeof value === 'string' && PROJECT_TYPES.includes(value as ProjectType);
}

function formatProjectType(projectType: ProjectType) {
  return projectType.replace(/_/g, ' ');
}

// CAD cents — regional labour cost baselines
const CANADIAN_COST_RANGES: Record<string, Partial<Record<ProjectType, { min: number; max: number }>>> = {
  ON: { kitchen: { min: 2500000, max: 7500000 }, bathroom: { min: 800000, max: 2500000 } },
  BC: { kitchen: { min: 2800000, max: 8500000 }, bathroom: { min: 900000, max: 2800000 } },
  AB: { kitchen: { min: 2200000, max: 6500000 }, bathroom: { min: 750000, max: 2200000 } },
  QC: { kitchen: { min: 2000000, max: 6000000 }, bathroom: { min: 700000, max: 2000000 } },
  MB: { kitchen: { min: 1800000, max: 5500000 }, bathroom: { min: 650000, max: 1800000 } },
  SK: { kitchen: { min: 1800000, max: 5000000 }, bathroom: { min: 600000, max: 1700000 } },
  NS: { kitchen: { min: 2000000, max: 5500000 }, bathroom: { min: 700000, max: 2000000 } },
  NB: { kitchen: { min: 1900000, max: 5000000 }, bathroom: { min: 650000, max: 1800000 } },
  NL: { kitchen: { min: 1900000, max: 5000000 }, bathroom: { min: 650000, max: 1800000 } },
  PE: { kitchen: { min: 1800000, max: 4500000 }, bathroom: { min: 600000, max: 1600000 } },
};

const DEFAULT_PROJECT_COSTS: Record<ProjectType, { min: number; max: number }> = {
  kitchen: { min: 2000000, max: 6000000 },
  bathroom: { min: 700000, max: 2000000 },
  flooring: { min: 500000, max: 1800000 },
  painting: { min: 300000, max: 1200000 },
  basement: { min: 3000000, max: 9000000 },
  addition: { min: 8000000, max: 25000000 },
  other: { min: 1000000, max: 4000000 },
};
const POSTGRES_INTEGER_MAX = 2147483647;

const CANADIAN_PROVINCE_CODES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);
const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  alberta: 'AB',
  britishcolumbia: 'BC',
  manitoba: 'MB',
  newbrunswick: 'NB',
  newfoundlandandlabrador: 'NL',
  labrador: 'NL',
  novascotia: 'NS',
  northwestterritories: 'NT',
  nunavut: 'NU',
  ontario: 'ON',
  princeedwardisland: 'PE',
  pei: 'PE',
  quebec: 'QC',
  saskatchewan: 'SK',
  yukon: 'YT',
  yukonterritory: 'YT',
};

function normalizeCanadianProvince(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return 'ON';
  const upper = raw.toUpperCase();
  const code = upper.startsWith('CA-') ? upper.slice(3) : upper;
  if (CANADIAN_PROVINCE_CODES.has(code)) return code;
  const compact = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
  return PROVINCE_NAME_TO_CODE[compact] ?? 'ON';
}

type GeneratedBrief = {
  materials: Array<{ item: string; quantity: number; unit: string; quality_tier: string }>;
  scope_of_work: Array<{ phase: string; description: string; sort_order: number }>;
  ai_cost_min: number;
  ai_cost_max: number;
  permits: Array<{ permit_type: string; required?: boolean }>;
  ai_observations: string;
  confidence_score?: number;
  confidence_notes?: string[];
};

function parseProviderJson(text: string): GeneratedBrief {
  try {
    return JSON.parse(text.trim());
  } catch {
    const stripped = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(stripped);
  }
}

function normalizeForcedCostCents(value: unknown, fieldName: 'forced_cost_min' | 'forced_cost_max'): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer CAD-cent amount`);
  }
  if (value > POSTGRES_INTEGER_MAX) {
    throw new Error(`${fieldName} exceeds the supported project budget limit`);
  }
  return value;
}

function normalizeForcedBudget(
  forcedCostMin: unknown,
  forcedCostMax: unknown,
): { forcedCostMin?: number; forcedCostMax?: number } {
  const normalizedMin = normalizeForcedCostCents(forcedCostMin, 'forced_cost_min');
  const normalizedMax = normalizeForcedCostCents(forcedCostMax, 'forced_cost_max');

  if ((normalizedMin === undefined) !== (normalizedMax === undefined)) {
    throw new Error('Both forced_cost_min and forced_cost_max are required when overriding the project budget');
  }
  if (normalizedMin !== undefined && normalizedMax !== undefined && normalizedMax < normalizedMin) {
    throw new Error('forced_cost_max must be greater than or equal to forced_cost_min');
  }

  return { forcedCostMin: normalizedMin, forcedCostMax: normalizedMax };
}

function answerValues(questionnaireAnswers: unknown): string[] {
  if (!questionnaireAnswers || typeof questionnaireAnswers !== 'object') return [];
  return Object.values(questionnaireAnswers as Record<string, unknown>)
    .filter((value): value is string => typeof value === 'string');
}

function inferQualityTier(questionnaireAnswers: unknown): 'budget' | 'mid-range' | 'luxury' {
  const answers = answerValues(questionnaireAnswers).join(' ');
  if (answers.includes('luxury')) return 'luxury';
  if (answers.includes('mid')) return 'mid-range';
  return 'budget';
}

function hasAnswer(questionnaireAnswers: unknown, prefix: string) {
  return answerValues(questionnaireAnswers).some((answer) => answer.startsWith(prefix));
}

function hasAnyAnswerPrefix(questionnaireAnswers: unknown, prefix: string) {
  return answerValues(questionnaireAnswers).some((answer) => answer.startsWith(prefix));
}

function projectCostRange(provinceCode: string, projectType: ProjectType) {
  return CANADIAN_COST_RANGES[provinceCode]?.[projectType] ?? DEFAULT_PROJECT_COSTS[projectType];
}

async function gcProjectTypeForProject(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<ProjectType | null> {
  const { data, error } = await supabase
    .from('general_contractor_projects')
    .select('project_type')
    .eq('project_id', projectId)
    .neq('status', 'removed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return isProjectType(data?.project_type) ? data.project_type : null;
}

function fallbackBrief({
  projectType,
  questionnaireAnswers,
  provinceCode,
  forcedCostMin,
  forcedCostMax,
  reason,
}: {
  projectType: ProjectType;
  questionnaireAnswers: unknown;
  provinceCode: string;
  forcedCostMin?: number;
  forcedCostMax?: number;
  reason: string;
}): GeneratedBrief {
  const qualityTier = inferQualityTier(questionnaireAnswers);
  const regionalCosts = projectCostRange(provinceCode, projectType);
  const materials: GeneratedBrief['materials'] = [
    { item: 'Site protection and dust-control materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
    { item: 'Construction disposal and cleanup supplies', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
  ];
  const scope: GeneratedBrief['scope_of_work'] = [
    { phase: 'demolition', description: 'Protect adjacent areas, remove selected finishes and fixtures, and prepare the room for renovation.', sort_order: 0 },
    { phase: 'rough-in', description: 'Verify field dimensions and coordinate required plumbing, electrical, and structural rough-in before installation.', sort_order: 1 },
    { phase: 'installation', description: 'Install selected materials and fixtures according to homeowner choices and site-verified measurements.', sort_order: 2 },
    { phase: 'finishing', description: 'Complete trim, caulking, paint touchups, cleanup, and final walkthrough with the homeowner.', sort_order: 3 },
  ];
  const permits: GeneratedBrief['permits'] = [];

  if (projectType === 'bathroom') {
    const tileWorkSelected = !hasAnswer(questionnaireAnswers, 'b_tile_keep');
    const showerWorkSelected = !hasAnswer(questionnaireAnswers, 'b_sh_keep');
    const vanityWorkSelected = !hasAnswer(questionnaireAnswers, 'b_van_keep');
    const toiletWorkSelected = !hasAnswer(questionnaireAnswers, 'b_toil_keep');

    if (tileWorkSelected) {
      materials.push({ item: 'Bathroom tile and setting materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    }
    if (showerWorkSelected) {
      materials.push({ item: 'Bathroom plumbing fixtures', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    }
    if (vanityWorkSelected) {
      materials.push({ item: 'Vanity, sink, and hardware package', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    }
    if (toiletWorkSelected) {
      materials.push({ item: 'Toilet fixture and connection materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    }
    if (tileWorkSelected && (hasAnswer(questionnaireAnswers, 'b_tile_full') || hasAnswer(questionnaireAnswers, 'b_tile_shower'))) {
      materials.push({ item: 'Waterproofing membrane and sealants', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    }
    materials.push(
      { item: 'Bathroom lighting and electrical trim', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
      { item: 'Paint, primer, and finishing supplies', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
    );
    if (tileWorkSelected) {
      scope.splice(2, 0, { phase: 'installation', description: 'Install selected tile scope with waterproofing where required.', sort_order: 2 });
    }
    if (!hasAnswer(questionnaireAnswers, 'b_plumb_none')) {
      permits.push({ permit_type: 'Plumbing permit', required: true });
    }
  } else if (projectType === 'kitchen') {
    const hasCabinetAnswer = hasAnyAnswerPrefix(questionnaireAnswers, 'k_cab_');
    const replacesCabinets = !hasCabinetAnswer || hasAnswer(questionnaireAnswers, 'k_cab_full');
    const replacesCountertops = !hasAnswer(questionnaireAnswers, 'k_ct_keep');

    if (replacesCabinets) {
      materials.push({ item: 'Kitchen cabinet package', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    } else if (hasAnswer(questionnaireAnswers, 'k_cab_reface')) {
      materials.push({ item: 'Cabinet refacing doors, drawer fronts, and hardware', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    } else if (hasAnswer(questionnaireAnswers, 'k_cab_paint')) {
      materials.push({ item: 'Cabinet refinishing paint and prep materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    }
    if (replacesCountertops) {
      materials.push({ item: 'Countertop material and fabrication allowance', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    }
    if (!hasAnswer(questionnaireAnswers, 'k_floor_keep')) {
      materials.push({ item: 'Kitchen flooring materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    }
    if (!hasAnswer(questionnaireAnswers, 'k_app_none')) {
      materials.push({ item: 'Appliance coordination and installation materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    }
    if (replacesCountertops || replacesCabinets) {
      materials.push({ item: 'Backsplash and setting materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier });
    }
    materials.push(
      { item: 'Kitchen lighting and electrical trim', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
      { item: 'Paint, primer, and finishing supplies', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
    );
    if (hasAnswer(questionnaireAnswers, 'k_lay_major')) {
      permits.push({ permit_type: 'Building permit', required: true });
      permits.push({ permit_type: 'Electrical permit', required: true });
      permits.push({ permit_type: 'Plumbing permit', required: true });
    } else if (hasAnswer(questionnaireAnswers, 'k_lay_minor')) {
      permits.push({ permit_type: 'Electrical permit', required: true });
    }
  } else if (projectType === 'flooring') {
    materials.push(
      { item: 'Flooring material package', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
      { item: 'Underlayment, transitions, and trim', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
    );
    scope.splice(2, 0, { phase: 'installation', description: 'Prepare subfloor, install selected flooring, transitions, trim, and site cleanup.', sort_order: 2 });
  } else if (projectType === 'painting') {
    materials.push(
      { item: 'Paint, primer, and sundries', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
      { item: 'Patching, masking, and surface preparation materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
    );
    scope.splice(1, 1, { phase: 'rough-in', description: 'Patch, sand, protect adjacent areas, and prepare surfaces for paint.', sort_order: 1 });
  } else if (projectType === 'basement') {
    materials.push(
      { item: 'Basement framing and drywall materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
      { item: 'Basement electrical and lighting allowance', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
      { item: 'Basement flooring and trim package', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
    );
    permits.push({ permit_type: 'Building permit', required: true });
    permits.push({ permit_type: 'Electrical permit', required: true });
  } else if (projectType === 'addition') {
    materials.push(
      { item: 'Framing, sheathing, and structural materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
      { item: 'Exterior envelope, windows, and door allowance', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
      { item: 'Drywall, insulation, and interior finish materials', quantity: 1, unit: 'allowance', quality_tier: qualityTier },
    );
    permits.push({ permit_type: 'Building permit', required: true });
    permits.push({ permit_type: 'Electrical permit', required: true });
  } else {
    materials.push({ item: `${formatProjectType(projectType)} project material allowance`, quantity: 1, unit: 'allowance', quality_tier: qualityTier });
  }

  return {
    materials,
    scope_of_work: scope.map((item, index) => ({ ...item, sort_order: index })),
    ai_cost_min: forcedCostMin ?? regionalCosts.min,
    ai_cost_max: forcedCostMax ?? regionalCosts.max,
    permits,
    ai_observations: `The ${formatProjectType(projectType)} project brief was generated from homeowner answers, deterministic pricing, and required contractor verification because AI brief generation was unavailable (${reason}). Material quantities and field conditions must be confirmed by the contractor before quoting.`,
    confidence_score: 62,
    confidence_notes: ['AI provider unavailable; estimate relies on homeowner inputs and pricing rules.', 'Contractor verification is required before final quote approval.'],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { project_id, analysis, questionnaire_answers, province, custom_prompt, forced_cost_min, forced_cost_max } = await req.json();
    const { forcedCostMin, forcedCostMax } = normalizeForcedBudget(forced_cost_min, forced_cost_max);

    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id, room_type, homeowner_id, province, status')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requesterIsHomeowner = project.homeowner_id === user.id;
    const requesterIsActiveGc = requesterIsHomeowner
      ? false
      : await isActiveGeneralContractorForProject(adminClient, project_id, user.id);
    if (!requesterIsHomeowner && !requesterIsActiveGc) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['draft', 'brief_ready'].includes(project.status)) {
      return new Response(JSON.stringify({ error: 'Project brief can only be generated before contractor dispatch starts' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const gcProjectType = await gcProjectTypeForProject(adminClient, project_id);
    const projectType = gcProjectType ?? (isProjectType(project.room_type) ? project.room_type : 'kitchen');
    const provinceCode = normalizeCanadianProvince(province ?? project.province);

    // Use caller-provided prompt if available (client has richer pricing logic),
    // otherwise fall back to the server-side auto-generated prompt.
    let promptToUse: string;
    if (custom_prompt) {
      promptToUse = custom_prompt;
    } else {
      const regionalCosts = projectCostRange(provinceCode, projectType);
      promptToUse = `Generate a detailed renovation project brief for a ${formatProjectType(projectType)} project in ${provinceCode}, Canada.

Room Analysis: ${JSON.stringify(analysis)}
Homeowner Preferences (questionnaire answers): ${JSON.stringify(questionnaire_answers)}

Regional cost baseline (CAD cents): min=${regionalCosts.min}, max=${regionalCosts.max}

Return a valid JSON object with this exact structure:
{
  "materials": [
    { "item": "string", "quantity": number, "unit": "string", "quality_tier": "budget|mid-range|luxury" }
  ],
  "scope_of_work": [
    { "phase": "demolition|rough-in|installation|finishing", "description": "string", "sort_order": number }
  ],
  "ai_cost_min": number,
  "ai_cost_max": number,
  "permits": [
    { "permit_type": "string", "required": true|false }
  ],
  "ai_observations": "2-3 sentence summary for the homeowner"
}

Rules:
- ai_cost_min and ai_cost_max must be in CAD cents and within ±30% of regional baseline
- Adjust cost based on quality_tier preferences from questionnaire
- Include realistic Canadian permit requirements (building permit, plumbing, electrical as needed)
- Materials should reflect the quality tier selected
- scope_of_work must cover all phases in order
- Return ONLY the JSON, no markdown`;
    }

    let brief: GeneratedBrief;
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    try {
      if (!openAiKey) throw new Error('missing OpenAI API key');
      const rawText = await callOpenAI(promptToUse, openAiKey);
      brief = parseProviderJson(rawText);
    } catch (providerError) {
      console.error('OpenAI brief generation failed, using fallback:', providerError);
      brief = fallbackBrief({
        projectType,
        questionnaireAnswers: questionnaire_answers,
        provinceCode,
        forcedCostMin,
        forcedCostMax,
        reason: providerError instanceof Error ? providerError.message : 'provider error',
      });
    }

    // Caller may supply pre-calculated costs from a local pricing engine — trust those over AI-generated
    if (forcedCostMin !== undefined) brief.ai_cost_min = forcedCostMin;
    if (forcedCostMax !== undefined) brief.ai_cost_max = forcedCostMax;

    if (!Number.isFinite(brief.ai_cost_min) || !Number.isFinite(brief.ai_cost_max) || brief.ai_cost_min <= 0 || brief.ai_cost_max <= 0) {
      throw new Error('Generated brief is missing a valid project budget');
    }
    if (brief.ai_cost_max < brief.ai_cost_min) {
      throw new Error('Generated brief budget max is lower than budget min');
    }
    if (!Array.isArray(brief.materials) || brief.materials.length === 0) {
      throw new Error('Generated brief is missing materials');
    }
    if (!Array.isArray(brief.scope_of_work) || brief.scope_of_work.length === 0) {
      throw new Error('Generated brief is missing scope of work');
    }

    // Persist all generated data
    const projectUpdatePayload = {
      ai_cost_min: brief.ai_cost_min,
      ai_cost_max: brief.ai_cost_max,
      questionnaire_answers,
      status: 'brief_ready',
    };

    const projectUpdateResult = await adminClient
      .from('projects')
      .update(projectUpdatePayload)
      .eq('id', project_id);

    if (projectUpdateResult.error) throw projectUpdateResult.error;

    const { error: deleteMaterialsError } = await adminClient.from('materials').delete().eq('project_id', project_id);
    if (deleteMaterialsError) throw deleteMaterialsError;

    const materialRows = (brief.materials as Array<{ item: string; quantity: number; unit: string; quality_tier: string }>)
      .map((m, sort_order) => ({ ...m, project_id, sort_order }));
    let materialsInsertResult = await adminClient.from('materials').insert(materialRows);
    if (isMissingColumnError(materialsInsertResult.error)) {
      materialsInsertResult = await adminClient.from('materials').insert(
        materialRows.map(({ sort_order: _sort_order, ...row }) => row)
      );
    }
    const materialsInsertError = materialsInsertResult.error;
    if (materialsInsertError) throw materialsInsertError;

    const { error: deleteScopeError } = await adminClient.from('scope_of_work').delete().eq('project_id', project_id);
    if (deleteScopeError) throw deleteScopeError;

    const { error: scopeInsertError } = await adminClient.from('scope_of_work').insert(
      (brief.scope_of_work as Array<{ phase: string; description: string; sort_order: number }>)
        .map((s) => ({ ...s, project_id }))
    );
    if (scopeInsertError) throw scopeInsertError;

    const { error: deletePermitsError } = await adminClient.from('permits').delete().eq('project_id', project_id);
    if (deletePermitsError) throw deletePermitsError;

    const requiredPermits = Array.isArray(brief.permits)
      ? (brief.permits as Array<{ permit_type?: unknown; required?: unknown }>)
        .filter((p) => p.required !== false && typeof p.permit_type === 'string' && p.permit_type.trim().length > 0)
        .map((p) => ({
          project_id,
          permit_type: (p.permit_type as string).trim(),
          status: 'not_applied',
        }))
      : [];

    if (requiredPermits.length > 0) {
      const { error: permitsInsertError } = await adminClient.from('permits').insert(
        requiredPermits
      );
      if (permitsInsertError) throw permitsInsertError;
    }

    return new Response(
      JSON.stringify({ success: true, ...brief }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('generate-project-brief error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
