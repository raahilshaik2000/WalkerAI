import { groupHomeownerScheduleItems, mapHomeownerScheduleItems } from '../src/lib/homeowner-schedule';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('homeowner schedule helpers', () => {
  const projects = [
    { id: 'project-1', address: '1 Main St', city: 'Toronto', room_type: 'kitchen' },
    { id: 'project-2', address: null, city: 'Ottawa', room_type: 'bathroom' },
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
      subtitle: 'Pipe Co - Kitchen renovation - 1 Main St, Toronto',
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
  it('keeps projects in quoting after schedule confirmation when pending quotes still need payment', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/schedule.tsx'),
      'utf8',
    );

    expect(source).toContain(".from('quotes')");
    expect(source).toContain(".eq('project_id', projectId)");
    expect(source).toContain(".eq('status', 'pending')");
    expect(source).toContain("const hasPendingQuotes = (pendingQuotes?.length ?? 0) > 0;");
    expect(source).toContain('allRequiredQuotesApproved = allSchedulableSlotsHaveApprovedQuotes');
    expect(source).toContain("? 'quoting'");
    expect(source).toContain("? 'active'");
    expect(source).toContain(": 'scheduling';");
    expect(source).toContain("supabase.functions.invoke('generate-material-orders'");
    expect(source).toMatch(
      /const nextProjectStatus =[\s\S]*?\.from\('projects'\)[\s\S]*?status: nextProjectStatus/
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
});
