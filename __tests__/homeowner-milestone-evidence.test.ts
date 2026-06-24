export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('homeowner milestone evidence visibility', () => {
  it('shows slot completion evidence and per-trade approval flow (master path)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/milestones.tsx'),
      'utf8',
    );

    // Master-path slot evidence query
    expect(source).toContain(".from('project_photos')");
    expect(source).toContain(".like('storage_path', `${projectId}/slots/%`)");
    expect(source).toContain(".from('messages')");
    expect(source).toContain(".ilike('body', '%[slot:%')");
    // Evidence gate before homeowner approval
    expect(source).toContain('const hasEvidence = trade.evidence_urls.length > 0;');
    expect(source).toContain('const canApprove = readyForReview && !hasActiveDispute && hasEvidence;');
    // Approve & Release button
    expect(source).toContain('handleApproveTrade');
    expect(source).toContain("hasEvidence ? 'Approve & Release Payment' : 'Awaiting Photos'");
    expect(source).toContain('disabled={!canApprove}');
    // Evidence missing hint
    expect(source).toContain('readyForReview && !hasEvidence');
  });

  it('keeps milestone card text in a real content column instead of collapsing vertically', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain('<View style={styles.milestoneContent}>');
    expect(source).toContain("milestoneRowLayout: { flexDirection: 'row'");
    expect(source).toContain('milestoneContent: { flex: 1, minWidth: 0 }');
    expect(source).toContain('milestoneTitleWrap: { flex: 1, minWidth: 0 }');
    expect(source).toContain('<Text style={styles.milestoneTitle} numberOfLines={2}>');
    expect(source).toContain('<Text style={styles.companyName} numberOfLines={1}>');
  });

  it('uses app-safe copy for homeowner milestone load and dispute failures', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';");
    expect(source).toContain("Alert.alert('Could not load milestones', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(source).toContain("Alert.alert('Release failed', await formatSupabaseFunctionError(err, 'Please try again.'))");
    expect(source).toContain("Alert.alert('Could not open dispute', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(source).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load milestones.')");
    expect(source).not.toContain("Alert.alert('Error', await formatSupabaseFunctionError(err, 'Failed to release payment.'))");
    expect(source).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to open dispute.')");
  });
});
