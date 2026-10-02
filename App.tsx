import React from 'react';
import { LogBox, StatusBar, StyleSheet, Text, View } from 'react-native';

LogBox.ignoreLogs([
  'InteractionManager',
  'Sending `onAnimatedValueUpdate`',
]);
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { STRIPE_PUBLISHABLE_KEY } from './src/lib/stripe';
import { getSupabaseConfigError } from './src/lib/supabase/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <View style={configStyles.container}>
      <Text style={configStyles.title}>App configuration required</Text>
      <Text style={configStyles.body}>{message}</Text>
      <Text style={configStyles.hint}>
        After updating .env, rebuild the native app so react-native-config picks up the values.
      </Text>
    </View>
  );
}

export default function App() {
  const configError = getSupabaseConfigError();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      {configError ? (
        <ConfigErrorScreen message={configError} />
      ) : (
        <StripeProvider
          publishableKey={STRIPE_PUBLISHABLE_KEY}
          merchantIdentifier="merchant.com.walkerai.app"
        >
          <QueryClientProvider client={queryClient}>
            <RootNavigator />
          </QueryClientProvider>
        </StripeProvider>
      )}
    </GestureHandlerRootView>
  );
}

const configStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  hint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
