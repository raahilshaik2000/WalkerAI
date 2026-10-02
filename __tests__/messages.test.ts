export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('project messages', () => {
  it('uses app-safe copy for homeowner and company message failures', () => {
    const homeownerList = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/messages.tsx'),
      'utf8',
    );
    const homeownerProjectMessages = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/messages.tsx'),
      'utf8',
    );
    const homeownerData = fs.readFileSync(
      path.join(__dirname, '../src/lib/homeowner-data.ts'),
      'utf8',
    );
    const homeownerLegacyChat = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/chat.tsx'),
      'utf8',
    );
    const companyMessages = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/messages.tsx'),
      'utf8',
    );
    const gcMessages = fs.readFileSync(
      path.join(__dirname, '../src/app/(general-contractor)/project/[id]/messages.tsx'),
      'utf8',
    );

    expect(homeownerList).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(homeownerList).toContain("import { useHomeownerMessageThreads, type HomeownerMessageThread } from '@/lib/homeowner-data';");
    expect(homeownerList).toContain("formatAppSafeErrorMessage(threadsQuery.error, 'Could not load messages.')");
    expect(homeownerList).toContain('void threadsQuery.refetch();');
    expect(homeownerData).toContain('export async function fetchHomeownerMessageThreads(userId: string)');
    expect(homeownerData).toContain('if (projectsError) throw projectsError;');
    expect(homeownerData).toContain("const gcContextUnavailable = isMissingSupabaseSchemaObjectError(gcResult.error, 'general_contractor_projects');");
    expect(homeownerData).toContain('throw slotResult.error ?? gcResult.error;');
    expect(homeownerData).toContain('if (messagesError) throw messagesError;');
    expect(homeownerList).not.toContain('setErrorMessage(projectsError.message)');
    expect(homeownerList).not.toContain('setErrorMessage(messagesError.message)');
    expect(homeownerList).not.toContain('slotResult.error?.message ?? gcResult.error?.message');

    for (const source of [homeownerLegacyChat, companyMessages]) {
      expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
      expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load messages.'))");
      expect(source).toContain("Alert.alert('Message not sent', formatAppSafeErrorMessage(error, 'Please try again.'))");
      expect(source).not.toContain('setErrorMessage(`Could not load messages: ${error.message}`)');
      expect(source).not.toContain("Alert.alert('Message not sent', error.message)");
    }

    expect(homeownerProjectMessages).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(homeownerProjectMessages).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load messages.'))");
    expect(homeownerProjectMessages).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load messages.'))");
    expect(homeownerProjectMessages).toContain("setMessages([]);\n          return;");
    expect(homeownerProjectMessages).toContain("setMessages([]);\n      }");
    expect(homeownerProjectMessages).toContain("Alert.alert('Message not sent', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(homeownerProjectMessages).toContain('setBody(trimmed); // restore on error');
    expect(homeownerProjectMessages).toContain('} finally {\n      setSending(false);');
    expect(homeownerProjectMessages).not.toContain('setErrorMessage(`Could not load messages: ${error.message}`)');
    expect(homeownerProjectMessages).not.toContain("Alert.alert('Message not sent', error.message)");

    expect(gcMessages).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(gcMessages).toContain('const clearMessageState = useCallback((lockMessage: string, currentUser: string | null = null) => {');
    expect(gcMessages).toContain("formatAppSafeErrorMessage(messageResult.error, 'Please try again.')");
    expect(gcMessages).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load messages.'))");
    expect(gcMessages).toContain("setErrorMessage('You need to be signed in to view project messages.');\n            clearMessageState('Sign in to send project messages.');");
    expect(gcMessages).toContain("setErrorMessage(`Could not load messages: ${formatAppSafeErrorMessage(messageResult.error, 'Please try again.')}`);\n          clearMessageState('Messages are unavailable right now. Try again shortly.', currentUser.id);\n          return;");
    expect(gcMessages).toContain('setBody(\'\');');
    expect(gcMessages).toContain('setSending(false);');
    expect(gcMessages).toContain('setUploadingAttachment(false);');
    expect(gcMessages).toContain('if (error) throw error;');
    expect(gcMessages).toContain("Alert.alert('Message not sent', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(gcMessages).not.toContain('setErrorMessage(`Could not load messages: ${messageResult.error.message}`)');
    expect(gcMessages).not.toContain("Alert.alert('Message not sent', error.message)");
  });
});
