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
    expect(homeownerList).toContain("setErrorMessage(formatAppSafeErrorMessage(projectsError, 'Could not load messages.'))");
    expect(homeownerList).toContain("setErrorMessage(formatAppSafeErrorMessage(\n        slotResult.error ?? gcResult.error,\n        'Could not load message participants.',\n      ))");
    expect(homeownerList).toContain("setErrorMessage(formatAppSafeErrorMessage(messagesError, 'Could not load messages.'))");
    expect(homeownerList).not.toContain('setErrorMessage(projectsError.message)');
    expect(homeownerList).not.toContain('setErrorMessage(messagesError.message)');
    expect(homeownerList).not.toContain('slotResult.error?.message ?? gcResult.error?.message');

    for (const source of [homeownerProjectMessages, homeownerLegacyChat, companyMessages]) {
      expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
      expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load messages.'))");
      expect(source).toContain("Alert.alert('Message not sent', formatAppSafeErrorMessage(error, 'Please try again.'))");
      expect(source).not.toContain('setErrorMessage(`Could not load messages: ${error.message}`)');
      expect(source).not.toContain("Alert.alert('Message not sent', error.message)");
    }

    expect(gcMessages).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(gcMessages).toContain("formatAppSafeErrorMessage(messageResult.error, 'Please try again.')");
    expect(gcMessages).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load messages.'))");
    expect(gcMessages).toContain("setComposeLockMessage('Messages are unavailable right now. Try again shortly.')");
    expect(gcMessages).toContain('if (error) throw error;');
    expect(gcMessages).toContain("Alert.alert('Message not sent', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(gcMessages).not.toContain('setErrorMessage(`Could not load messages: ${messageResult.error.message}`)');
    expect(gcMessages).not.toContain("Alert.alert('Message not sent', error.message)");
  });
});
