import React from 'react';
import { StatusBar, LogBox } from 'react-native';

LogBox.ignoreLogs([
  'InteractionManager',
  'Sending `onAnimatedValueUpdate`',
]);
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import Config from 'react-native-config';
import { RootNavigator } from './src/navigation/RootNavigator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider
        publishableKey={Config.STRIPE_PUBLISHABLE_KEY ?? ''}
        merchantIdentifier="merchant.com.walkerai.app"
      >
        <QueryClientProvider client={queryClient}>
          <StatusBar barStyle="light-content" />
          <RootNavigator />
        </QueryClientProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}
