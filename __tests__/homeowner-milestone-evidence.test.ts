export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('homeowner milestone evidence visibility', () => {
  it('shows contractor progress evidence before homeowner payment release', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain('Image,');
    expect(source).toContain('evidence_urls: string[];');
    expect(source).toContain('function evidenceUrlsForMilestone');
    expect(source).toContain(".from('project_photos')");
    expect(source).toContain(".select('url, storage_path')");
    expect(source).toContain(".like('storage_path', `${projectId}/milestones/%`)");
    expect(source).toContain("table: 'project_photos', filter: `project_id=eq.${projectId}`");
    expect(source).toContain(".from('messages')");
    expect(source).toContain(".select('body, attachment_url')");
    expect(source).toContain(".ilike('body', '%[milestone:%')");
    expect(source).toContain("table: 'messages', filter: `project_id=eq.${projectId}`");
    expect(source).toContain('evidence_urls: evidenceUrlsForMilestone(milestone.id, photoEvidenceRows, messageEvidenceRows, projectId),');
    expect(source).toContain('Progress evidence');
    expect(source).toContain('source={{ uri: url }}');
    expect(source).toContain('const hasProgressEvidence = milestone.evidence_urls.length > 0;');
    expect(source).toContain('const canApprove = isReadyForReview && !hasActiveDispute && hasProgressEvidence;');
    expect(source).toContain("hasProgressEvidence ? 'Approve & Release Payment' : 'Awaiting Progress Proof'");
    expect(source).toContain('disabled={!canApprove}');
    expect(source).toContain('Progress photo evidence is missing. Ask the contractor to upload proof before approving.');
  });

  it('keeps milestone card text in a real content column instead of collapsing vertically', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain('<View style={styles.milestoneRowLayout}>');
    expect(source).toContain("milestoneRowLayout: { flexDirection: 'row'");
    expect(source).toContain('milestoneContent: { flex: 1, minWidth: 0 }');
    expect(source).toContain('milestoneTitleWrap: { flex: 1, minWidth: 0 }');
    expect(source).toContain('<Text style={styles.milestoneTitle} numberOfLines={2}>');
    expect(source).toContain('<Text style={styles.companyName} numberOfLines={1}>');
  });
});
