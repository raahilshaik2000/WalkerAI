export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('company milestone proof uploads', () => {
  it('keeps slot photo upload available after marking complete and before payment release', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain('handleUploadSlotPhoto');
    expect(source).toContain('handleMarkSlotComplete');
    // Photo button visible even after submission (while awaiting approval)
    expect(source).toContain('onPress={handleUploadSlotPhoto}');
  });

  it('requires slot completion evidence before a contractor can mark a trade complete', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain('async function hasSlotCompletionEvidence');
    expect(source).toContain(".from('project_photos')");
    expect(source).toContain(".like('storage_path', `${projectId}/slots/${slotId}/%`)");
    expect(source).toContain(".from('messages')");
    expect(source).toContain(".ilike('body', `%slot:${slotId}%`)");
    expect(source).toContain('const hasEvidence = await hasSlotCompletionEvidence(projectId, slotId);');
    expect(source).toContain('Upload at least one completion photo before marking this trade complete.');
  });

  it('uses app-safe copy for company milestone load and upload failures', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(source).toContain("Alert.alert('Could not load milestones', formatAppSafeErrorMessage(companyError, 'Please try again.'))");
    expect(source).toContain("Alert.alert('Upload failed', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(source).toContain("Alert.alert('Could not mark complete', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(source).not.toContain("Alert.alert('Error', companyError.message)");
    expect(source).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update milestone.')");
    expect(source).not.toContain("Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.')");
  });

  it('updates slot completion_submitted_at when contractor marks trade complete', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain(".update({ completion_submitted_at: new Date().toISOString() })");
    expect(source).toContain(".from('project_slots')");
    expect(source).toContain('setMasterSlot((prev) => prev ?');
    expect(source).toContain('completion_submitted_at: new Date().toISOString()');
    expect(source).toContain('}, [projectId, slotId, user?.id]);');
  });
});
