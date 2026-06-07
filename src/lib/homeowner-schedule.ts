export type HomeownerScheduleItemType = 'trade' | 'milestone';

export interface ScheduleProject {
  id: string;
  address: string | null;
  city: string | null;
  room_type: string | null;
}

interface RawScheduledSlot {
  id: string;
  project_id: string;
  trade_type: string;
  status: string;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  companies?: { name: string | null } | Array<{ name: string | null }> | null;
}

interface RawMilestone {
  id: string;
  title: string;
  amount: number;
  status: string;
  due_date: string | null;
  quote?: { project_id: string; status: string | null } | Array<{ project_id: string; status: string | null }> | null;
}

export interface HomeownerScheduleItem {
  id: string;
  type: HomeownerScheduleItemType;
  projectId: string;
  title: string;
  subtitle: string;
  date: string;
  endDate: string | null;
  status: string;
  amount: number | null;
  project: ScheduleProject;
}

const TRADE_LABELS: Record<string, string> = {
  general_contractor: 'General Contractor',
  plumber: 'Plumber',
  electrician: 'Electrician',
  tile_installer: 'Tile Installer',
  cabinet_installer: 'Cabinet Installer',
  painter: 'Painter',
  flooring_installer: 'Flooring Installer',
  drywall: 'Drywall',
  demolition: 'Demolition',
};

function getCompanyName(value: RawScheduledSlot['companies']) {
  if (Array.isArray(value)) return value[0]?.name ?? null;
  return value?.name ?? null;
}

function getQuote(value: RawMilestone['quote']) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function projectLabel(project: ScheduleProject) {
  const room = project.room_type ? `${project.room_type.charAt(0).toUpperCase()}${project.room_type.slice(1)} renovation` : 'Project';
  const location = [project.address, project.city].filter(Boolean).join(', ');
  return location ? `${room} - ${location}` : room;
}

export function mapHomeownerScheduleItems(
  projects: ScheduleProject[],
  slots: RawScheduledSlot[],
  milestones: RawMilestone[],
): HomeownerScheduleItem[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));

  const tradeItems = slots
    .filter((slot) => !!slot.scheduled_start_date)
    .map((slot): HomeownerScheduleItem | null => {
      const project = projectById.get(slot.project_id);
      if (!project || !slot.scheduled_start_date) return null;
      const tradeLabel = TRADE_LABELS[slot.trade_type] ?? slot.trade_type.replace(/_/g, ' ');
      const company = getCompanyName(slot.companies);
      return {
        id: `trade:${slot.id}`,
        type: 'trade',
        projectId: project.id,
        title: `${tradeLabel} scheduled`,
        subtitle: company ? `${company} - ${projectLabel(project)}` : projectLabel(project),
        date: slot.scheduled_start_date,
        endDate: slot.scheduled_end_date,
        status: slot.status,
        amount: null,
        project,
      };
    })
    .filter((item): item is HomeownerScheduleItem => item != null);

  const milestoneItems = milestones
    .filter((milestone) => !!milestone.due_date && getQuote(milestone.quote)?.status === 'approved')
    .map((milestone): HomeownerScheduleItem | null => {
      const quote = getQuote(milestone.quote);
      const project = quote ? projectById.get(quote.project_id) : null;
      if (!project || !milestone.due_date) return null;
      return {
        id: `milestone:${milestone.id}`,
        type: 'milestone',
        projectId: project.id,
        title: milestone.title,
        subtitle: projectLabel(project),
        date: milestone.due_date,
        endDate: null,
        status: milestone.status,
        amount: milestone.amount,
        project,
      };
    })
    .filter((item): item is HomeownerScheduleItem => item != null);

  return [...tradeItems, ...milestoneItems].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.title.localeCompare(b.title);
  });
}

export function groupHomeownerScheduleItems(items: HomeownerScheduleItem[]): { label: string; items: HomeownerScheduleItem[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

  const grouped = {
    overdue: [] as HomeownerScheduleItem[],
    today: [] as HomeownerScheduleItem[],
    thisWeek: [] as HomeownerScheduleItem[],
    upcoming: [] as HomeownerScheduleItem[],
  };

  for (const item of items) {
    const date = new Date(item.date);
    date.setHours(0, 0, 0, 0);
    if (date < today) grouped.overdue.push(item);
    else if (date.getTime() === today.getTime()) grouped.today.push(item);
    else if (date <= endOfWeek) grouped.thisWeek.push(item);
    else grouped.upcoming.push(item);
  }

  return [
    { label: 'OVERDUE', items: grouped.overdue },
    { label: 'TODAY', items: grouped.today },
    { label: 'THIS WEEK', items: grouped.thisWeek },
    { label: 'UPCOMING', items: grouped.upcoming },
  ].filter((group) => group.items.length > 0);
}
