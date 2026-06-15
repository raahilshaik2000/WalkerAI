import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { FloatingTabBar } from '@/components/ui/FloatingTabBar';
import NotificationsScreen from '@/app/notifications';

import GeneralContractorDashboard from '@/app/(general-contractor)/index';
import GeneralContractorApprovals from '@/app/(general-contractor)/approvals';
import GeneralContractorProfile from '@/app/(general-contractor)/profile';
import GeneralContractorProjectDetail from '@/app/(general-contractor)/project/[id]/index';
import GeneralContractorBusinessOnboarding from '@/app/(general-contractor)/onboarding/business';
import GeneralContractorLicenseOnboarding from '@/app/(general-contractor)/onboarding/license';
import GeneralContractorInsuranceOnboarding from '@/app/(general-contractor)/onboarding/insurance';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function icon(name: string, focused: boolean, color: string) {
  return <Ionicons name={focused ? name : `${name}-outline`} size={22} color={color} />;
}

function GeneralContractorTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarShowLabel: false }}
    >
      <Tab.Screen
        name="GeneralContractorProjects"
        component={GeneralContractorDashboard}
        options={{ tabBarIcon: ({ color, focused }) => icon('briefcase', focused, color) }}
      />
      <Tab.Screen
        name="GeneralContractorApprovals"
        component={GeneralContractorApprovals}
        options={{ tabBarIcon: ({ color, focused }) => icon('checkmark-done-circle', focused, color) }}
      />
      <Tab.Screen
        name="GeneralContractorProfile"
        component={GeneralContractorProfile}
        options={{ tabBarIcon: ({ color, focused }) => icon('person', focused, color) }}
      />
    </Tab.Navigator>
  );
}

export function GeneralContractorNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GeneralContractorTabs" component={GeneralContractorTabs} />
      <Stack.Screen name="GeneralContractorProjectDetail" component={GeneralContractorProjectDetail} />
      <Stack.Screen name="GeneralContractorBusinessOnboarding" component={GeneralContractorBusinessOnboarding} />
      <Stack.Screen name="GeneralContractorLicenseOnboarding" component={GeneralContractorLicenseOnboarding} />
      <Stack.Screen name="GeneralContractorInsuranceOnboarding" component={GeneralContractorInsuranceOnboarding} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
