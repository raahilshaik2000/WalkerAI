export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('homeowner project detail routes', () => {
  it('does not keep the stale fake project/detail route set', () => {
    const repoRoot = path.resolve(__dirname, '..');
    expect(fs.existsSync(path.join(repoRoot, 'src/app/(homeowner)/project/detail'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'src/components/dashboard/projectDetailData.ts'))).toBe(false);
  });

  it('does not register the stale top-level ProjectDetailView screen', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const navigatorSource = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/RootNavigator.tsx'),
      'utf8',
    );

    expect(navigatorSource).not.toContain('ProjectDetailViewScreen');
    expect(navigatorSource).not.toContain('name="ProjectDetailView"');
  });

  it('keeps schedule confirmation reachable after a pending quote moves the project to quoting', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const detailSource = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(detailSource).toContain('status, scheduling_status, ai_cost_min');
    expect(detailSource).toContain('const shouldShowScheduleAction =');
    expect(detailSource).toContain("project.status === 'quoting' && project.scheduling_status === 'pending_homeowner'");
    expect(detailSource).toMatch(
      /shouldShowScheduleAction[\s\S]*?\? \[\{ label: 'Schedule', iconName: 'calendar-outline', screen: 'ProjectSchedule' \}\]/
    );
  });

  it('uses native vector icons for project action tiles instead of unsupported emoji glyphs', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const detailSource = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(detailSource).toContain("import Ionicons from 'react-native-vector-icons/Ionicons'");
    expect(detailSource).toContain("<Ionicons name={action.iconName}");
    expect(detailSource).toContain("iconName: 'reader-outline'");
    expect(detailSource).not.toContain("icon: '📋'");
    expect(detailSource).not.toContain("icon: '💬'");
    expect(detailSource).not.toContain("icon: '📄'");
  });
});
