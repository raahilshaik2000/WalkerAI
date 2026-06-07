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
