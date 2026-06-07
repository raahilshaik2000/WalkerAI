import { mapCompanyCalendarMilestones } from '../src/lib/company-calendar';

describe('company calendar milestone mapping', () => {
  it('includes only unreleased milestones from approved quotes', () => {
    const rows = [
      {
        id: 'approved-pending',
        title: 'Rough-in',
        amount: 100000,
        status: 'pending',
        due_date: '2026-06-15',
        quote: {
          status: 'approved',
          project: { id: 'project-1', address: '1 Main St', city: 'Toronto', room_type: 'kitchen' },
        },
      },
      {
        id: 'pending-quote',
        title: 'Should not show',
        amount: 50000,
        status: 'pending',
        due_date: '2026-06-16',
        quote: {
          status: 'pending',
          project: { id: 'project-2', address: '2 Main St', city: 'Toronto', room_type: 'bathroom' },
        },
      },
      {
        id: 'released',
        title: 'Already released',
        amount: 25000,
        status: 'homeowner_approved',
        due_date: '2026-06-17',
        quote: {
          status: 'approved',
          project: { id: 'project-3', address: '3 Main St', city: 'Toronto', room_type: 'bathroom' },
        },
      },
    ];

    expect(mapCompanyCalendarMilestones(rows)).toEqual([
      {
        id: 'approved-pending',
        title: 'Rough-in',
        amount: 100000,
        status: 'pending',
        due_date: '2026-06-15',
        project: { id: 'project-1', address: '1 Main St', city: 'Toronto', room_type: 'kitchen' },
      },
    ]);
  });
});
