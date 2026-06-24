import { groupHomeownerScheduleItems, mapHomeownerScheduleItems } from '../src/lib/homeowner-schedule';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('homeowner schedule helpers', () => {
  const projects = [
    { id: 'project-1', address: '1 Main St', city: 'Toronto', room_type: 'kitchen' },
    { id: 'project-2', address: null, city: 'Ottawa', room_type: 'bathroom' },
    { id: 'project-3', address: '3 Main St', city: 'Toronto', room_type: null },
  ];

  it('maps scheduled trades and approved quote milestones into a sorted schedule feed', () => {
    const items = mapHomeownerScheduleItems(
      projects,
      [
        {
          id: 'slot-1',
          project_id: 'project-1',
          trade_type: 'plumber',
          status: 'scheduled',
          scheduled_start_date: '2026-06-20',
          scheduled_end_date: '2026-06-21',
          companies: { name: 'Pipe Co' },
        },
      ],
      [
        {
          id: 'milestone-1',
          title: 'Rough-in complete',
          amount: 120000,
          status: 'pending',
          due_date: '2026-06-18',
          quote: { project_id: 'project-1', status: 'approved' },
        },
      ],
    );

    expect(items.map((item) => item.id)).toEqual(['milestone:milestone-1', 'trade:slot-1']);
    expect(items[1]).toMatchObject({
      title: 'Plumber scheduled',
      subtitle: 'Pipe Co - Kitchen Renovation - 1 Main St, Toronto',
    });
  });

  it('labels legacy general_contractor slots as lead contractor slots', () => {
    const items = mapHomeownerScheduleItems(
      projects,
      [
        {
          id: 'slot-legacy-gc',
          project_id: 'project-1',
          trade_type: 'general_contractor',
          status: 'scheduled',
          scheduled_start_date: '2026-06-20',
          scheduled_end_date: '2026-06-21',
          companies: { name: 'Legacy Renovations Co' },
        },
      ],
      [],
    );

    expect(items[0]).toMatchObject({
      title: 'Lead contractor scheduled',
      subtitle: 'Legacy Renovations Co - Kitchen Renovation - 1 Main St, Toronto',
    });
  });

  it('labels nullable project room types without crashing', () => {
    const items = mapHomeownerScheduleItems(
      projects,
      [
        {
          id: 'slot-flooring',
          project_id: 'project-3',
          trade_type: 'flooring',
          status: 'scheduled',
          scheduled_start_date: '2026-06-20',
          scheduled_end_date: null,
          companies: { name: 'Floor Co' },
        },
      ],
      [],
    );

    expect(items[0]).toMatchObject({
      title: 'Flooring scheduled',
      subtitle: 'Floor Co - Renovation Project - 3 Main St, Toronto',
    });
  });

  it('excludes unscheduled slots and milestones from unapproved quotes', () => {
    const items = mapHomeownerScheduleItems(
      projects,
      [
        {
          id: 'slot-1',
          project_id: 'project-1',
          trade_type: 'electrician',
          status: 'filled',
          scheduled_start_date: null,
          scheduled_end_date: null,
          companies: null,
        },
      ],
      [
        {
          id: 'milestone-1',
          title: 'Draft milestone',
          amount: 120000,
          status: 'pending',
          due_date: '2026-06-18',
          quote: { project_id: 'project-1', status: 'pending' },
        },
      ],
    );

    expect(items).toEqual([]);
  });

  it('groups past schedule items as overdue', () => {
    const items = mapHomeownerScheduleItems(
      projects,
      [
        {
          id: 'slot-1',
          project_id: 'project-1',
          trade_type: 'plumber',
          status: 'scheduled',
          scheduled_start_date: '2000-01-01',
          scheduled_end_date: null,
          companies: null,
        },
      ],
      [],
    );

    expect(groupHomeownerScheduleItems(items)[0]).toMatchObject({
      label: 'OVERDUE',
      items: [{ id: 'trade:slot-1' }],
    });
  });
});

describe('homeowner project schedule screen source guards', () => {
  it('activates project on payment (funded) and stays in scheduling otherwise (master-only path)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/schedule.tsx'),
      'utf8',
    );

    expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load schedule.'))");
    expect(source).toContain("Alert.alert('Could not confirm schedule', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(source).not.toContain('setErrorMessage(error.message)');
    expect(source).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to confirm schedule.')");
    // Master-only: payment_status drives activation, no quote path
    expect(source).toContain(".select('payment_status')");
    expect(source).toContain("const projectPaymentStatus = (paymentInfo as any)?.payment_status ?? null;");
    expect(source).toContain("const nextProjectStatus = projectPaymentStatus === 'funded' ? 'active' : 'scheduling';");
    expect(source).not.toContain("const hasPendingQuotes");
    expect(source).not.toContain('allSchedulableSlotsHaveApprovedQuotes');
    expect(source).not.toContain("? 'quoting'");
    expect(source).toContain("supabase.functions.invoke('generate-material-orders'");
    expect(source).toMatch(
      /nextProjectStatus[\s\S]*?status: nextProjectStatus/
    );
    expect(source).toMatch(
      /if \(nextProjectStatus === 'active'\) \{[\s\S]*?generate-material-orders/
    );
    expect(source).not.toContain("status: 'scheduling',");
  });

  it('describes schedule list availability more accurately than active-only copy', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/schedule.tsx'),
      'utf8',
    );

    expect(source).toContain('Scheduled trades and approved quote milestone due dates will appear here once your project has assigned dates or approved milestones.');
    expect(source).not.toContain('once your project is active.');
  });

  it('uses app-safe copy for the top-level homeowner schedule feed', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/schedule.tsx'),
      'utf8',
    );

    expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(projectsError, 'Could not load schedule.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(slotsResult.error ?? milestonesResult.error, 'Could not load schedule.'))");
    expect(source).not.toContain('setErrorMessage(projectsError.message)');
    expect(source).not.toContain("setErrorMessage(slotsResult.error?.message ?? milestonesResult.error?.message ?? 'Could not load schedule.')");
  });
});
