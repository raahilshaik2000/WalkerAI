import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { FloatingTabBar } from '@/components/ui/FloatingTabBar';

// Supplier screens
import SupplierOrderFeed from '@/app/(supplier)/orders/index';
import SupplierActiveOrders from '@/app/(supplier)/orders/active';
import SupplierOrderDetail from '@/app/(supplier)/orders/[id]/index';
import SupplierCatalog from '@/app/(supplier)/catalog/index';
import AddCatalogItem from '@/app/(supplier)/catalog/add';
import EditCatalogItem from '@/app/(supplier)/catalog/[id]/index';
import SupplierEarnings from '@/app/(supplier)/earnings/index';
import SupplierProfile from '@/app/(supplier)/profile/index';

// Onboarding
import SupplierBusinessOnboarding from '@/app/(supplier)/onboarding/business';
import SupplierLicenseOnboarding from '@/app/(supplier)/onboarding/license';
import SupplierCategoriesOnboarding from '@/app/(supplier)/onboarding/categories';
import SupplierPendingVerification from '@/app/(supplier)/pending-verification';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function icon(name: string, focused: boolean, color: string) {
  return <Ionicons name={focused ? name : `${name}-outline`} size={22} color={color} />;
}

function SupplierTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}

      screenOptions={{ headerShown: false, tabBarShowLabel: false }}
    >
      <Tab.Screen
        name="SupplierOrders"
        component={SupplierOrderFeed}
        options={{ tabBarIcon: ({ color, focused }) => icon('cube', focused, color) }}
      />
      <Tab.Screen
        name="SupplierCatalog"
        component={SupplierCatalog}
        options={{ tabBarIcon: ({ color, focused }) => icon('storefront', focused, color) }}
      />
      <Tab.Screen
        name="SupplierEarnings"
        component={SupplierEarnings}
        options={{ tabBarIcon: ({ color, focused }) => icon('cash', focused, color) }}
      />
      <Tab.Screen
        name="SupplierProfile"
        component={SupplierProfile}
        options={{ tabBarIcon: ({ color, focused }) => icon('person', focused, color) }}
      />
    </Tab.Navigator>
  );
}

export function SupplierNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SupplierTabs" component={SupplierTabs} />
      <Stack.Screen name="SupplierActiveOrders" component={SupplierActiveOrders} />
      <Stack.Screen name="SupplierOrderDetail" component={SupplierOrderDetail} />
      <Stack.Screen name="SupplierAddCatalogItem" component={AddCatalogItem} />
      <Stack.Screen name="SupplierEditCatalogItem" component={EditCatalogItem} />
      <Stack.Screen name="SupplierPendingVerification" component={SupplierPendingVerification} />
      <Stack.Screen name="SupplierBusinessOnboarding" component={SupplierBusinessOnboarding} />
      <Stack.Screen name="SupplierLicenseOnboarding" component={SupplierLicenseOnboarding} />
      <Stack.Screen name="SupplierCategoriesOnboarding" component={SupplierCategoriesOnboarding} />
    </Stack.Navigator>
  );
}
