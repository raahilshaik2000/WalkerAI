export interface CompanyCalendarProject {
  id: string;
  address: string;
  city: string;
  room_type: string;
}

export interface CompanyCalendarMilestone {
  id: string;
  title: string;
  amount: number;
  status: string;
  due_date: string | null;
  slot_id: string | null;
  project: CompanyCalendarProject;
}

interface QuoteWithProject {
  status: string | null;
  slot_id?: string | null;
  project?: CompanyCalendarProject | CompanyCalendarProject[] | null;
}

interface RawCalendarMilestone {
  id: string;
  title: string;
  amount: number;
  status: string;
  due_date: string | null;
  quote?: QuoteWithProject | QuoteWithProject[] | null;
}

function isReleasedMilestoneStatus(status: string) {
  return status === 'paid' || status === 'homeowner_approved';
}

function getQuote(value: QuoteWithProject | QuoteWithProject[] | null | undefined): QuoteWithProject | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getProject(value: CompanyCalendarProject | CompanyCalendarProject[] | null | undefined): CompanyCalendarProject | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function mapCompanyCalendarMilestones(rows: RawCalendarMilestone[]): CompanyCalendarMilestone[] {
  return rows
    .filter((milestone) => !isReleasedMilestoneStatus(milestone.status) && getQuote(milestone.quote)?.status === 'approved')
    .map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      amount: milestone.amount,
      status: milestone.status,
      due_date: milestone.due_date,
      slot_id: getQuote(milestone.quote)?.slot_id ?? null,
      project: getProject(getQuote(milestone.quote)?.project) ?? {
        id: '',
        address: '',
        city: '',
        room_type: '',
      },
    }));
}
