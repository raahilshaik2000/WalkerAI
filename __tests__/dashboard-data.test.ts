import { ALL_INSPIRATION_ITEMS, NEWS_DETAIL_CONTENT } from '../src/components/dashboard/data';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('dashboard inspiration data', () => {
  it('does not label static inspiration images as AI-generated designs', () => {
    expect(ALL_INSPIRATION_ITEMS.some((item) => /ai design/i.test(item.categoryLabel))).toBe(false);
    expect(ALL_INSPIRATION_ITEMS.some((item) => /^AI\b/i.test(item.title))).toBe(false);
  });

  it('does not show fake save counts for static inspiration ideas', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const files = [
      'src/components/dashboard/data.ts',
      'src/components/dashboard/InspirationCarousel.tsx',
      'src/app/(homeowner)/browse-ideas.tsx',
      'src/app/(homeowner)/inspiration-detail.tsx',
    ];

    for (const file of files) {
      const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      expect(source).not.toContain('saves');
      expect(source).not.toContain('setSaved');
    }
  });

  it('does not export unused fake dashboard records', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(path.join(repoRoot, 'src/components/dashboard/data.ts'), 'utf8');

    expect(source).not.toMatch(/\bFAKE_/);
    expect(source).not.toContain('PROJECTS_LIST');
    expect(source).not.toContain('BuildRight Co.');
    expect(source).not.toContain('PremiumFit Inc.');
  });

  it('describes milestone payments using the implemented homeowner approval flow', () => {
    const milestoneArticle = NEWS_DETAIL_CONTENT.n3;

    expect(milestoneArticle).toContain('Payment is only released after your approval.');
    expect(milestoneArticle).toContain('Payment release pauses while the dispute is active');
    expect(milestoneArticle).not.toMatch(/\b48 hours\b/i);
    expect(milestoneArticle).not.toMatch(/auto(?:matically)? release/i);
  });
});

describe('company dashboard project list', () => {
  it('keeps accepted trade slots distinct before opening pricing and job controls', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(path.join(repoRoot, 'src/app/(company)/index.tsx'), 'utf8');

    expect(source).toContain('slot:project_slots ( id, trade_type )');
    expect(source).toContain('const slot = Array.isArray(dispatch.slot) ? dispatch.slot[0] : dispatch.slot;');
    expect(source).toContain('trade_type: slot?.trade_type ?? null');
    expect(source).toContain("[...legacyActive, ...acceptedDispatchActive, ...slotActive].forEach");
    expect(source).toContain("byKey.set(`${job.id}:${job.slotId ?? 'legacy'}`, job)");
    expect(source).toContain("key={`${job.id}:${job.slotId ?? 'legacy'}`}");
    expect(source).toContain("navigation.navigate('JobDetail', { screen: 'JobDetailMain', params: { id: job.id, slot: job.slotId } })");
  });
});

describe('homeowner optional GC context', () => {
  it('does not fail core homeowner screens when GC assignment tables are not migrated yet', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const helper = fs.readFileSync(path.join(repoRoot, 'src/lib/supabase/errors.ts'), 'utf8');
    const carousel = fs.readFileSync(path.join(repoRoot, 'src/components/dashboard/ProjectsCarousel.tsx'), 'utf8');
    const projects = fs.readFileSync(path.join(repoRoot, 'src/app/(homeowner)/projects.tsx'), 'utf8');
    const projectDetail = fs.readFileSync(path.join(repoRoot, 'src/app/(homeowner)/project/[id]/index.tsx'), 'utf8');
    const messages = fs.readFileSync(path.join(repoRoot, 'src/app/(homeowner)/messages.tsx'), 'utf8');

    expect(helper).toContain('isMissingSupabaseSchemaObjectError');
    expect(helper).toContain('/schema cache/');
    expect(helper).toContain('/could not find the (table|column|relationship|function)/');
    expect(helper).toContain('/relation .* does not exist/');

    for (const source of [carousel, projects, projectDetail, messages]) {
      expect(source).toContain("isMissingSupabaseSchemaObjectError");
      expect(source).toContain("'general_contractor_projects'");
    }

    expect(carousel).toContain('setProjects(projectList);');
    expect(projects).toContain('if (!isMissingSupabaseSchemaObjectError(gcContextError, \'general_contractor_projects\'))');
    expect(projectDetail).toContain('setGcProjectContext(gcContextResult.error ? null');
    expect(messages).toContain('const gcContextUnavailable = isMissingSupabaseSchemaObjectError(gcResult.error, \'general_contractor_projects\');');
    expect(messages).toContain('gcContextUnavailable ? [] : (gcResult.data ?? [])');
  });
});
