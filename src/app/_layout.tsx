import { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import Config from 'react-native-config';

const STRIPE_PUBLISHABLE_KEY = Config.STRIPE_PUBLISHABLE_KEY ?? '';

import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';

// Keep splash screen visible while we fetch auth state
SplashScreen.preventAutoHideAsync();

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,         // 30s before background refetch
      gcTime: 5 * 60 * 1000,    // 5min in cache
      retry: 2,
    },
  },
});

function AuthGate() {
  const navigation = useNavigation<any>();
  const segments = useSegments();
  const { session, role, hydrated, setSession, setHydrated } = useAuthStore();

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        if (!hydrated) setHydrated(true);
      }
    );

    // Hydrate from AsyncStorage on first mount
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setHydrated(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';
    const inHomeownerGroup = segments[0] === '(homeowner)';
    const inCompanyGroup = segments[0] === '(company)';

    if (!session) {
      // No session → send to auth
      if (!inAuthGroup) {
        navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
      }
    } else if (role === 'homeowner') {
      if (!inHomeownerGroup) {
        navigation.reset({ index: 0, routes: [{ name: 'Homeowner' }] });
      }
    } else if (role === 'company') {
      if (!inCompanyGroup) {
        navigation.reset({ index: 0, routes: [{ name: 'Company' }] });
      }
    }
  }, [session, role, hydrated, segments]);

  return null;
}

function NotificationHandler() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    // Handle notification taps (app backgrounded)
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as {
          deepLink?: string;
        };
        if (data.deepLink) {
          router.push(data.deepLink as never);
        }
      }
    );

    // Register push token
    registerPushToken();

    return () => subscription.remove();
  }, []);

  return null;
}

async function registerPushToken() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync();

    const { data: { user } } = await supabase.auth.getUser();
    if (user && token) {
      // Store in device_tokens table (supports multiple devices per user)
      await supabase.from('device_tokens').upsert({
        user_id: user.id,
        token,
        platform: Platform.OS,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'token' });
    }
  } catch {
    // Push notifications not available in simulator — ignore
  }
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.walkerai.app">
      <QueryClientProvider client={queryClient}>
        <AuthGate />
        <NotificationHandler />
        <StatusBar barStyle="light-content" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(homeowner)" />
          <Stack.Screen name="(company)" />
        </Stack>
      </QueryClientProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}
