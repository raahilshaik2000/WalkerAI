import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { isMissingSupabaseSchemaObjectError } from '@/lib/supabase/errors';
import {
  mapHomeownerScheduleItems,
  type HomeownerScheduleItem,
  type ScheduleProject,
} from '@/lib/homeowner-schedule';

export const homeownerQueryKeys = {
  messageThreads: (userId: string) => ['homeowner', 'message-threads', userId] as const,
  carouselProjects: (userId: string) => ['homeowner', 'carousel-projects', userId] as const,
  schedule: (userId: string) => ['homeowner', 'schedule', userId] as const,
  projectQuote: (projectId: string) => ['homeowner', 'project-quote', projectId] as const,
};

export interface HomeownerMessageThread {
  projectId: string;
  projectTitle: string;
  contractorName: string;
  lastMessage: string;
  lastMessageTime: string;
  lastSentAt: string;
}

export interface HomeownerCarouselProject {
  id: string;
  room_type: string | null;
  status: string;
  address: string | null;
  city: string | null;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
  renders: Array<{ url: string; selected?: boolean | null }>;
  project_photos: Array<{ url: string }>;
  gc_project_type?: string | null;
}

export interface HomeownerQuoteProject {
  ai_cost_min: number;
  ai_cost_max: number;
  status: string;
  room_type: string | null;
  ai_analysis: any;
  payment_model: 'legacy' | 'master' | null;
  payment_status: 'unpaid' | 'funded' | 'refunded' | null;
  master_total_cents: number | null;
  assigned_company_id?: string | null;
}

export interface HomeownerQuoteItem {
  id: string;
  type: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  sort_order: number | null;
}

export interface HomeownerQuoteMilestone {
  id: string;
  title: string;
  amount: number;
  status: string;
  sort_order: number;
  due_date: string | null;
}

export interface HomeownerSubmittedQuote {
  id: string;
  slot_id: string | null;
  company_id: string;
  company_name: string | null;
  total_amount: number;
  status: string;
  submitted_at: string | null;
  milestones: HomeownerQuoteMilestone[];
  line_items: HomeownerQuoteItem[];
}

export interface HomeownerQuoteSlot {
  id: string;
  trade_type: string | null;
  status: string | null;
  assigned_company_id: string | null;
  company_name: string | null;
}

interface ProjectThreadRow {
  id: string;
  room_type: string | null;
  companies?: { name: string | null } | Array<{ name: string | null }> | null;
}

interface SlotThreadRow {
  project_id: string;
  assigned_company_id: string | null;
  fulfillment_type?: 'walker_ai' | 'external' | null;
  external_trade_name?: string | null;
  external_trade_company?: string | null;
  companies?: { name: string | null } | Array<{ name: string | null }> | null;
}

interface GcThreadRow {
  project_id: string;
  status: string;
  general_contractor?: { business_name: string | null } | Array<{ business_name: string | null }> | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function firstJoinedRow<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function projectTitle(roomType: string | null) {
  return roomType
    ? `${roomType.charAt(0).toUpperCase()}${roomType.slice(1)} Renovation`
    : 'Project';
}

export async function fetchHomeownerMessageThreads(userId: string): Promise<HomeownerMessageThread[]> {
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, room_type, companies!assigned_company_id(name)')
    .eq('homeowner_id', userId)
    .order('created_at', { ascending: false });

  if (projectsError) throw projectsError;

  const projectRows = (projects ?? []) as ProjectThreadRow[];
  const ownedProjectIds = projectRows.map((p) => p.id);
  if (!ownedProjectIds.length) return [];

  const [slotResult, gcResult] = await Promise.all([
    supabase
      .from('project_slots')
      .select(`
        project_id, assigned_company_id, fulfillment_type,
        external_trade_name, external_trade_company,
        companies!assigned_company_id(name)
      `)
      .in('project_id', ownedProjectIds)
      .or('assigned_company_id.not.is.null,fulfillment_type.eq.external'),
    supabase
      .from('general_contractor_projects')
      .select('project_id, status, general_contractor:general_contractors(business_name)')
      .in('project_id', ownedProjectIds)
      .in('status', ['invited', 'active', 'completed']),
  ]);

  const gcContextUnavailable = isMissingSupabaseSchemaObjectError(gcResult.error, 'general_contractor_projects');
  if (slotResult.error || (gcResult.error && !gcContextUnavailable)) {
    throw slotResult.error ?? gcResult.error;
  }

  const slotsByProject = new Map<string, SlotThreadRow[]>();
  for (const slot of (slotResult.data ?? []) as SlotThreadRow[]) {
    const rows = slotsByProject.get(slot.project_id) ?? [];
    rows.push(slot);
    slotsByProject.set(slot.project_id, rows);
  }

  const gcsByProject = new Map<string, GcThreadRow[]>();
  for (const assignment of (gcContextUnavailable ? [] : (gcResult.data ?? [])) as GcThreadRow[]) {
    const rows = gcsByProject.get(assignment.project_id) ?? [];
    rows.push(assignment);
    gcsByProject.set(assignment.project_id, rows);
  }

  const participantNameForProject = (project: ProjectThreadRow): string | null => {
    const assignedCompany = firstJoinedRow(project.companies);
    if (assignedCompany?.name) return assignedCompany.name;

    const gc = gcsByProject.get(project.id)?.[0];
    const gcProfile = firstJoinedRow(gc?.general_contractor);
    if (gcProfile?.business_name) return gcProfile.business_name;

    const slotNames = (slotsByProject.get(project.id) ?? [])
      .map((slot) => {
        if (slot.fulfillment_type === 'external') {
          return slot.external_trade_company ?? slot.external_trade_name ?? null;
        }
        return firstJoinedRow(slot.companies)?.name ?? null;
      })
      .filter((name): name is string => Boolean(name));
    if (slotNames.length === 1) return slotNames[0];
    if (slotNames.length > 1) return `${slotNames.length} project participants`;
    return null;
  };

  const threadProjects = projectRows
    .map((project) => ({ project, participantName: participantNameForProject(project) }))
    .filter((row) => !!row.participantName);

  if (!threadProjects.length) return [];

  const projectIds = threadProjects.map(({ project }) => project.id);
  const { data: msgs, error: messagesError } = await supabase
    .from('messages')
    .select('project_id, body, sent_at, attachment_url')
    .in('project_id', projectIds)
    .order('sent_at', { ascending: false })
    .limit(500);

  if (messagesError) throw messagesError;

  const latestMsg: Record<string, { body: string | null; sent_at: string; attachment_url: string | null }> = {};
  for (const m of msgs ?? []) {
    if (!latestMsg[m.project_id]) {
      latestMsg[m.project_id] = {
        body: m.body,
        sent_at: m.sent_at,
        attachment_url: m.attachment_url,
      };
    }
  }

  const result: HomeownerMessageThread[] = threadProjects.map(({ project, participantName }) => {
    const last = latestMsg[project.id];
    return {
      projectId: project.id,
      projectTitle: projectTitle(project.room_type),
      contractorName: participantName!,
      lastMessage: last ? (last.body || (last.attachment_url ? 'Photo attachment' : 'No message text')) : 'No messages yet',
      lastMessageTime: last ? timeAgo(last.sent_at) : '',
      lastSentAt: last?.sent_at ?? '',
    };
  });

  result.sort((a, b) => {
    if (!a.lastSentAt && !b.lastSentAt) return 0;
    if (!a.lastSentAt) return 1;
    if (!b.lastSentAt) return -1;
    return new Date(b.lastSentAt).getTime() - new Date(a.lastSentAt).getTime();
  });

  return result;
}

export async function fetchHomeownerCarouselProjects(userId: string): Promise<HomeownerCarouselProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, room_type, status, address, city, ai_cost_min, ai_cost_max, renders(url, selected), project_photos(url)')
    .eq('homeowner_id', userId)
    .not('status', 'eq', 'diy_saved')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;

  let projectList = ((data as HomeownerCarouselProject[]) ?? []).map((project) => ({
    ...project,
    room_type: project.room_type ?? null,
  }));

  const ids = projectList.map((project) => project.id);
  if (ids.length === 0) return projectList;

  const { data: gcContextData, error: gcContextError } = await supabase
    .from('general_contractor_projects')
    .select('project_id, project_type')
    .in('project_id', ids)
    .neq('status', 'removed')
    .order('created_at', { ascending: false });

  if (gcContextError) {
    if (!isMissingSupabaseSchemaObjectError(gcContextError, 'general_contractor_projects')) {
      throw gcContextError;
    }
    return projectList;
  }

  const gcProjectTypes = new Map<string, string | null>();
  ((gcContextData ?? []) as Array<{ project_id: string; project_type: string | null }>).forEach((row) => {
    if (!gcProjectTypes.has(row.project_id)) {
      gcProjectTypes.set(row.project_id, row.project_type);
    }
  });

  return projectList.map((project) => ({
    ...project,
    gc_project_type: gcProjectTypes.get(project.id) ?? null,
  }));
}

export async function fetchHomeownerSchedule(userId: string): Promise<HomeownerScheduleItem[]> {
  const { data: projectsData, error: projectsError } = await supabase
    .from('projects')
    .select('id, address, city, room_type')
    .eq('homeowner_id', userId)
    .not('status', 'eq', 'diy_saved')
    .order('created_at', { ascending: false });

  if (projectsError) throw projectsError;

  const projects = (projectsData ?? []) as ScheduleProject[];
  const projectIds = projects.map((project) => project.id);
  if (projectIds.length === 0) return [];

  const [slotsResult, milestonesResult] = await Promise.all([
    supabase
      .from('project_slots')
      .select('id, project_id, trade_type, status, scheduled_start_date, scheduled_end_date, companies(name)')
      .in('project_id', projectIds)
      .not('scheduled_start_date', 'is', null)
      .order('scheduled_start_date', { ascending: true }),
    supabase
      .from('milestones')
      .select('id, title, amount, status, due_date, quote:quotes!inner(project_id, status)')
      .in('quote.project_id', projectIds)
      .eq('quote.status', 'approved')
      .not('due_date', 'is', null)
      .not('status', 'eq', 'paid')
      .order('due_date', { ascending: true }),
  ]);

  if (slotsResult.error || milestonesResult.error) {
    throw slotsResult.error ?? milestonesResult.error;
  }

  return mapHomeownerScheduleItems(
    projects,
    (slotsResult.data ?? []) as any[],
    (milestonesResult.data ?? []) as any[],
  );
}

export async function fetchHomeownerProjectQuote(projectId: string): Promise<{
  project: HomeownerQuoteProject;
  slots: HomeownerQuoteSlot[];
  quotes: HomeownerSubmittedQuote[];
}> {
  const { data: proj, error: projectError } = await supabase
    .from('projects')
    .select('ai_cost_min, ai_cost_max, status, room_type, ai_analysis, payment_model, payment_status, master_total_cents, assigned_company_id')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError) throw projectError;
  if (!proj) throw new Error('Project not found.');

  const [slotsResult, quotesResult] = await Promise.all([
    supabase
      .from('project_slots')
      .select('id, trade_type, status, assigned_company_id, companies(name)')
      .eq('project_id', projectId)
      .order('work_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('quotes')
      .select(`
        id, slot_id, company_id, total_amount, status, submitted_at,
        companies(name),
        milestones(id, title, amount, status, sort_order, due_date),
        quote_line_items(id, type, description, quantity, unit, unit_cost, total_cost, sort_order)
      `)
      .eq('project_id', projectId)
      .in('status', ['pending', 'approved'])
      .order('submitted_at', { ascending: false }),
  ]);

  const slotsError = slotsResult.error;
  if (slotsError) throw slotsError;
  if (quotesResult.error && !isMissingSupabaseSchemaObjectError(quotesResult.error, 'quotes')) {
    throw quotesResult.error;
  }

  const slotRows = slotsResult.data ?? [];
  const slots: HomeownerQuoteSlot[] = (slotRows as any[]).map((s) => {
    const company = Array.isArray(s.companies) ? s.companies[0] : s.companies;
    return {
      id: s.id,
      trade_type: s.trade_type ?? null,
      status: s.status ?? null,
      assigned_company_id: s.assigned_company_id ?? null,
      company_name: company?.name ?? null,
    };
  });

  const quoteRows = quotesResult.data ?? [];
  const quotes: HomeownerSubmittedQuote[] = (quoteRows as any[]).map((q) => {
    const company = Array.isArray(q.companies) ? q.companies[0] : q.companies;
    const rawMilestones = (q.milestones ?? []) as any[];
    const sortedMilestones: HomeownerQuoteMilestone[] = [...rawMilestones]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((m) => ({
        id: m.id,
        title: m.title ?? '',
        amount: m.amount ?? 0,
        status: m.status ?? 'pending',
        sort_order: m.sort_order ?? 1,
        due_date: m.due_date ?? null,
      }));

    const rawLineItems = (q.quote_line_items ?? []) as any[];
    const sortedLineItems: HomeownerQuoteItem[] = [...rawLineItems]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((li) => ({
        id: li.id,
        type: li.type ?? 'other',
        description: li.description ?? '',
        quantity: li.quantity ?? null,
        unit: li.unit ?? null,
        unit_cost: li.unit_cost ?? null,
        total_cost: li.total_cost ?? null,
        sort_order: li.sort_order ?? 1,
      }));

    return {
      id: q.id,
      slot_id: q.slot_id ?? null,
      company_id: q.company_id,
      company_name: company?.name ?? null,
      total_amount: q.total_amount ?? 0,
      status: q.status ?? 'pending',
      submitted_at: q.submitted_at ?? null,
      milestones: sortedMilestones,
      line_items: sortedLineItems,
    };
  });

  return { project: proj as HomeownerQuoteProject, slots, quotes };
}

export function useHomeownerMessageThreads(userId: string | undefined) {
  return useQuery({
    queryKey: homeownerQueryKeys.messageThreads(userId ?? 'anonymous'),
    enabled: !!userId,
    queryFn: () => fetchHomeownerMessageThreads(userId!),
    staleTime: 20_000,
  });
}

export function useHomeownerCarouselProjects(userId: string | undefined) {
  return useQuery({
    queryKey: homeownerQueryKeys.carouselProjects(userId ?? 'anonymous'),
    enabled: !!userId,
    queryFn: () => fetchHomeownerCarouselProjects(userId!),
    staleTime: 30_000,
  });
}

export function useHomeownerSchedule(userId: string | undefined) {
  return useQuery({
    queryKey: homeownerQueryKeys.schedule(userId ?? 'anonymous'),
    enabled: !!userId,
    queryFn: () => fetchHomeownerSchedule(userId!),
    staleTime: 30_000,
  });
}

export function useHomeownerProjectQuote(projectId: string | undefined) {
  return useQuery({
    queryKey: homeownerQueryKeys.projectQuote(projectId ?? 'missing'),
    enabled: !!projectId,
    queryFn: () => fetchHomeownerProjectQuote(projectId!),
    staleTime: 20_000,
  });
}
