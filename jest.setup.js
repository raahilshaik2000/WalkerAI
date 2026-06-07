/* eslint-env jest */

import 'react-native-gesture-handler/jestSetup';

const ReactNative = require('react-native');
const { NativeModules } = ReactNative;

Object.defineProperty(ReactNative, 'InteractionManager', {
  configurable: true,
  value: {
    createInteractionHandle: jest.fn(() => 1),
    clearInteractionHandle: jest.fn(),
    runAfterInteractions: jest.fn((task) => {
      if (typeof task === 'function') task();
      return { cancel: jest.fn() };
    }),
  },
});

NativeModules.RoomPlanModule = {
  addListener: jest.fn(),
  removeListeners: jest.fn(),
  checkDeviceSupport: jest.fn(() => Promise.resolve({ supported: false })),
  startScan: jest.fn(() => Promise.resolve()),
};

NativeModules.RoomScanModule = NativeModules.RoomPlanModule;

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, Image, ScrollView } = require('react-native');
  const createAnimatedComponent = (Component) => React.forwardRef((props, ref) => (
    React.createElement(Component, { ...props, ref })
  ));
  return {
    __esModule: true,
    default: {
      View,
      Text,
      Image,
      ScrollView,
      createAnimatedComponent,
    },
    useSharedValue: (value) => ({ value }),
    useAnimatedStyle: (factory) => factory(),
    withTiming: (value) => value,
    withDelay: (_delay, value) => value,
    withSpring: (value) => value,
    withRepeat: (value) => value,
    withSequence: (...values) => values[values.length - 1],
    interpolate: (value, inputRange, outputRange) => {
      if (value <= inputRange[0]) return outputRange[0];
      return outputRange[outputRange.length - 1];
    },
    Easing: {
      out: (fn) => fn,
      in: (fn) => fn,
      inOut: (fn) => fn,
      ease: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      linear: jest.fn(),
    },
    createAnimatedComponent,
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  mergeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-haptic-feedback', () => ({
  trigger: jest.fn(),
}));

jest.mock('react-native-config', () => ({
  STRIPE_PUBLISHABLE_KEY: 'pk_test_mock',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
}));

jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }) => children,
  useStripe: () => ({
    initPaymentSheet: jest.fn().mockResolvedValue({}),
    presentPaymentSheet: jest.fn().mockResolvedValue({}),
  }),
}));
