import { mapCompanyCalendarMilestones } from '../src/lib/company-calendar';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

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
          slot_id: 'slot-rough-in',
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
      {
        id: 'gc-non-room',
        title: 'Flooring install',
        amount: 75000,
        status: 'pending',
        due_date: '2026-06-18',
        quote: {
          status: 'approved',
          slot_id: 'slot-flooring',
          project: { id: 'project-4', address: '4 Main St', city: 'Toronto', room_type: null },
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
        slot_id: 'slot-rough-in',
        project: { id: 'project-1', address: '1 Main St', city: 'Toronto', room_type: 'kitchen' },
      },
      {
        id: 'gc-non-room',
        title: 'Flooring install',
        amount: 75000,
        status: 'pending',
        due_date: '2026-06-18',
        slot_id: 'slot-flooring',
        project: { id: 'project-4', address: '4 Main St', city: 'Toronto', room_type: null },
      },
    ]);
  });

  it('passes the approved quote slot into milestone navigation', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src/app/(company)/calendar.tsx'), 'utf8');

    expect(source).toContain('company_id, status, slot_id');
    expect(source).toContain('params: { id: m.project.id, slot: m.slot_id ?? undefined }');
  });

  it('does not render unknown project rooms as bathroom milestones', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src/app/(company)/calendar.tsx'), 'utf8');
    const mapper = fs.readFileSync(path.join(repoRoot, 'src/lib/company-calendar.ts'), 'utf8');

    expect(source).toContain("from('general_contractor_projects')");
    expect(source).toContain("isMissingSupabaseSchemaObjectError(gcContextError, 'general_contractor_projects')");
    expect(source).toContain('gcProjectTypeIcon(m.project.gc_project_type, m.project.room_type)');
    expect(source).not.toContain("m.project.room_type === 'kitchen' ? 'countertop-outline' : 'shower'");
    expect(mapper).toContain('room_type: string | null;');
    expect(mapper).toContain('gc_project_type?: string | null;');
    expect(mapper).toContain('room_type: null');
  });

  it('keeps company calendar load errors app-safe', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src/app/(company)/calendar.tsx'), 'utf8');

    expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(companyError, 'Could not load company profile.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load calendar.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(gcContextError, 'Could not load project management context.'))");
    expect(source).not.toContain('setErrorMessage(companyError.message)');
    expect(source).not.toContain('setErrorMessage(error.message)');
  });
});
