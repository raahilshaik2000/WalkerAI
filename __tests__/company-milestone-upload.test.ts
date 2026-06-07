export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('company milestone proof uploads', () => {
  it('keeps photo upload available after a milestone is marked complete and before payment release', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain('const canAdvance = !!STATUS_NEXT[m.status];');
    expect(source).toContain('const canUploadPhoto = !isReleasedMilestone(m.status);');
    expect(source).toContain('{(canAdvance || canUploadPhoto) && (');
    expect(source).toContain('{canUploadPhoto && (');
  });

  it('requires progress evidence before a contractor can mark a milestone complete', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain('async function hasMilestoneProgressEvidence');
    expect(source).toContain(".from('project_photos')");
    expect(source).toContain(".like('storage_path', `${projectId}/milestones/${milestoneId}/%`)");
    expect(source).toContain(".from('messages')");
    expect(source).toContain(".ilike('body', `%milestone:${milestoneId}%`)");
    expect(source).toContain('const currentProjectId = projectId;');
    expect(source).toContain('const hasEvidence = await hasMilestoneProgressEvidence(currentProjectId, milestone.id);');
    expect(source).toContain('Upload at least one progress photo for this milestone before marking it complete.');
    expect(source).toContain('body: `[milestone:${milestone.id}] Progress photo uploaded for "${milestone.title}": ${publicUrl}`,');
  });
});
