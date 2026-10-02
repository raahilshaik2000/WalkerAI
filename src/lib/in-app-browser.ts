import { NativeModules, Platform, Linking, Alert } from 'react-native';

const { WalkerInAppBrowser } = NativeModules;

export interface InAppBrowserResult {
  status: 'success' | 'closed' | 'error';
  url?: string;
}

export async function openInAppBrowser(url: string): Promise<InAppBrowserResult> {
  if (Platform.OS === 'ios' && WalkerInAppBrowser?.openURL) {
    try {
      const res = await WalkerInAppBrowser.openURL(url);
      return res || { status: 'closed' };
    } catch {
      // Fallback to Linking if native module call fails
    }
  }

  try {
    await Linking.openURL(url);
    return { status: 'closed' };
  } catch {
    Alert.alert('Unable to open link', `Please visit ${url}`);
    return { status: 'error' };
  }
}

export async function closeInAppBrowser(): Promise<void> {
  if (Platform.OS === 'ios' && WalkerInAppBrowser?.close) {
    try {
      await WalkerInAppBrowser.close();
    } catch {
      // ignore
    }
  }
}

// Ensure in-app browser automatically closes when a walkerai:// deep link arrives
Linking.addEventListener('url', (event) => {
  if (event.url && event.url.startsWith('walkerai://')) {
    closeInAppBrowser();
  }
});
