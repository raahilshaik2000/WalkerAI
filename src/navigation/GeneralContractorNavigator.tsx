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
import GeneralContractorCreateProject from '@/app/(general-contractor)/project/create';
import GeneralContractorSchedule from '@/app/(general-contractor)/project/[id]/schedule';
import GeneralContractorPermits from '@/app/(general-contractor)/project/[id]/permits';
import GeneralContractorPayments from '@/app/(general-contractor)/project/[id]/payments';
import GeneralContractorMaterials from '@/app/(general-contractor)/project/[id]/materials';
import GeneralContractorDiscovery from '@/app/(general-contractor)/project/[id]/discovery';
import GeneralContractorMessages from '@/app/(general-contractor)/project/[id]/messages';
import GeneralContractorCompletion from '@/app/(general-contractor)/project/[id]/completion';
import GeneralContractorTrades from '@/app/(general-contractor)/project/[id]/trades';
import GeneralContractorAssistant from '@/app/(general-contractor)/project/[id]/assistant';
import GeneralContractorBusinessOnboarding from '@/app/(general-contractor)/onboarding/business';
import GeneralContractorLicenseOnboarding from '@/app/(general-contractor)/onboarding/license';
import GeneralContractorInsuranceOnboarding from '@/app/(general-contractor)/onboarding/insurance';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function icon(name: string, focused: boolean, color: string) {
  return <Ionicons name={focused ? name : `${name}-outline`} size={22} color={color} />;
}

function projectsTabIcon({ color, focused }: { color: string; focused: boolean }) {
  return icon('briefcase', focused, color);
}

function approvalsTabIcon({ color, focused }: { color: string; focused: boolean }) {
  return icon('checkmark-done-circle', focused, color);
}

function profileTabIcon({ color, focused }: { color: string; focused: boolean }) {
  return icon('person', focused, color);
}

function renderFloatingTabBar(props: React.ComponentProps<typeof FloatingTabBar>) {
  return <FloatingTabBar {...props} />;
}

function GeneralContractorTabs() {
  return (
    <Tab.Navigator
      tabBar={renderFloatingTabBar}
      screenOptions={{ headerShown: false, tabBarShowLabel: false }}
    >
      <Tab.Screen
        name="GeneralContractorProjects"
        component={GeneralContractorDashboard}
        options={{ tabBarIcon: projectsTabIcon }}
      />
      <Tab.Screen
        name="GeneralContractorApprovals"
        component={GeneralContractorApprovals}
        options={{ tabBarIcon: approvalsTabIcon }}
      />
      <Tab.Screen
        name="GeneralContractorProfile"
        component={GeneralContractorProfile}
        options={{ tabBarIcon: profileTabIcon }}
      />
    </Tab.Navigator>
  );
}

export function GeneralContractorNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GeneralContractorTabs" component={GeneralContractorTabs} />
      <Stack.Screen name="GeneralContractorProjectDetail" component={GeneralContractorProjectDetail} />
      <Stack.Screen name="GeneralContractorSchedule" component={GeneralContractorSchedule} />
      <Stack.Screen name="GeneralContractorPermits" component={GeneralContractorPermits} />
      <Stack.Screen name="GeneralContractorPayments" component={GeneralContractorPayments} />
      <Stack.Screen name="GeneralContractorMaterials" component={GeneralContractorMaterials} />
      <Stack.Screen name="GeneralContractorTrades" component={GeneralContractorTrades} />
      <Stack.Screen name="GeneralContractorDiscovery" component={GeneralContractorDiscovery} />
      <Stack.Screen name="GeneralContractorMessages" component={GeneralContractorMessages} />
      <Stack.Screen name="GeneralContractorCompletion" component={GeneralContractorCompletion} />
      <Stack.Screen name="GeneralContractorAssistant" component={GeneralContractorAssistant} />
      <Stack.Screen name="GeneralContractorCreateProject" component={GeneralContractorCreateProject} />
      <Stack.Screen name="GeneralContractorBusinessOnboarding" component={GeneralContractorBusinessOnboarding} />
      <Stack.Screen name="GeneralContractorLicenseOnboarding" component={GeneralContractorLicenseOnboarding} />
      <Stack.Screen name="GeneralContractorInsuranceOnboarding" component={GeneralContractorInsuranceOnboarding} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
