import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContainer, createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuthStore } from '@/stores/auth.store';
import { useProfileStore } from '@/stores/profile.store';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { FloatingTabBar } from '@/components/ui/FloatingTabBar';
import type { UserRole } from '@/constants/enums';
import { toRootNotificationRoute } from '@/lib/notifications/navigation';
import { initPushForUser, deactivatePushForUser, setPushDeepLinkHandler, setPushCurrentRole } from '@/lib/push';

// Shared navigation ref so the push module can deep-link without prop-drilling.
const navigationRef = createNavigationContainerRef();

// Auth screens
import WelcomeScreen from '@/app/(auth)/index';
import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';

// Homeowner screens
import HomeownerDashboard from '@/app/(homeowner)/index';
import HomeownerProjects from '@/app/(homeowner)/projects';
import HomeownerMessages from '@/app/(homeowner)/messages';
import NotificationsScreen from '@/app/notifications';
import HomeownerProfile from '@/app/(homeowner)/profile';
import HomeownerSettings from '@/app/(homeowner)/settings';
import SearchScreen from '@/app/(homeowner)/search';
import FindProScreen from '@/app/(homeowner)/find-pro';
import BrowseIdeasScreen from '@/app/(homeowner)/browse-ideas';
import ScheduleScreen from '@/app/(homeowner)/schedule';
import InspirationDetailScreen from '@/app/(homeowner)/inspiration-detail';
import NewsDetailScreen from '@/app/(homeowner)/news-detail';
import ChatScreen from '@/app/(homeowner)/chat';
import EditProfileScreen from '@/app/(homeowner)/edit-profile';
import MyReviewsScreen from '@/app/(homeowner)/my-reviews';
import SavedAddressesScreen from '@/app/(homeowner)/saved-addresses';
import RoomScanScreen from '@/app/(homeowner)/room-scan';
import RoomResultsScreen from '@/app/(homeowner)/room-results';
import ManualMeasurementScreen from '@/app/(homeowner)/manual-measurement';

// Homeowner project create screens
import RoomTypeStep from '@/app/(homeowner)/project/create/room-type';
import AddressStep from '@/app/(homeowner)/project/create/address';
import AnalyzingStep from '@/app/(homeowner)/project/create/analyzing';
import BriefStep from '@/app/(homeowner)/project/create/brief';
import MaterialDetailScreen from '@/app/(homeowner)/project/create/material-detail';
import ConfirmStep from '@/app/(homeowner)/project/create/confirm';
import PhotosStep from '@/app/(homeowner)/project/create/photos';
import MeasurementsStep from '@/app/(homeowner)/project/create/measurements';
import QuestionnaireStep from '@/app/(homeowner)/project/create/questionnaire';
import RendersStep from '@/app/(homeowner)/project/create/renders';

// DIY screens
import DIYStartScreen from '@/app/(homeowner)/project/create/diy-start';
import DIYPhotosScreen from '@/app/(homeowner)/project/create/diy-photos';
import DIYDetailsScreen from '@/app/(homeowner)/project/create/diy-details';
import DIYGeneratingScreen from '@/app/(homeowner)/project/create/diy-generating';
import DIYGuideScreen from '@/app/(homeowner)/diy-guide';

// Homeowner project detail screens
import ProjectDetail from '@/app/(homeowner)/project/[id]/index';
import ProjectChangeOrders from '@/app/(homeowner)/project/[id]/change-orders';
import ProjectMessages from '@/app/(homeowner)/project/[id]/messages';
import ProjectMilestones from '@/app/(homeowner)/project/[id]/milestones';
import ProjectPermits from '@/app/(homeowner)/project/[id]/permits';
import ProjectQuote from '@/app/(homeowner)/project/[id]/quote';
import ProjectReview from '@/app/(homeowner)/project/[id]/review';
import ProjectMaterials from '@/app/(homeowner)/project/[id]/materials';
import ProjectSchedule from '@/app/(homeowner)/project/[id]/schedule';
import ProjectWarranties from '@/app/(homeowner)/project/[id]/warranties';
import ProjectConcierge from '@/app/(homeowner)/project/[id]/concierge';

// Supplier navigator
import { SupplierNavigator } from '@/navigation/SupplierNavigator';
import { GeneralContractorNavigator } from '@/navigation/GeneralContractorNavigator';

// Company screens
import CompanyDashboard from '@/app/(company)/index';
import CompanyCalendar from '@/app/(company)/calendar';
import CompanyEarnings from '@/app/(company)/earnings';
import CompanyProfile from '@/app/(company)/profile';
import PendingVerification from '@/app/(company)/pending-verification';

// Company onboarding
import BusinessOnboarding from '@/app/(company)/onboarding/business';
import InsuranceOnboarding from '@/app/(company)/onboarding/insurance';
import LicenseOnboarding from '@/app/(company)/onboarding/license';

// Company job detail
import JobDetail from '@/app/(company)/job/[id]/index';
import JobChangeOrders from '@/app/(company)/job/[id]/change-orders';
import JobMessages from '@/app/(company)/job/[id]/messages';
import JobMilestones from '@/app/(company)/job/[id]/milestones';
import JobQuoteBuilder from '@/app/(company)/job/[id]/quote-builder';
import JobMaterials from '@/app/(company)/job/[id]/materials';
import JobWarranties from '@/app/(company)/job/[id]/warranties';
import JobReview from '@/app/(company)/job/[id]/review';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const AuthStack = createStackNavigator();
const HomeownerStack = createStackNavigator();
const CompanyStack = createStackNavigator();
const ProjectCreateStack = createStackNavigator();
const ProjectDetailStack = createStackNavigator();
const JobDetailStack = createStackNavigator();
const DIYCreateStack = createStackNavigator();

function isMissingUserProfileColumn(message: string | undefined | null) {
  const text = message ?? '';
  return /column .*(avatar_url|address|city|province|postal_code|full_name|phone).* does not exist/i.test(text)
    || /could not find .* column .* users .* schema cache/i.test(text)
    || /could not find .* users .* column .* schema cache/i.test(text);
}

function icon(name: string, focused: boolean, color: string) {
  return <Ionicons name={focused ? name : `${name}-outline`} size={22} color={color} />;
}

function HomeownerTabs() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [navRef, setNavRef] = useState<any>(null);

  const handleOption = useCallback((route: string) => {
    setSheetVisible(false);
    setTimeout(() => navRef?.navigate(route), 150);
  }, [navRef]);

  return (
    <>
      <Tab.Navigator
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false, tabBarShowLabel: false }}
      >
        <Tab.Screen name="Dashboard" component={HomeownerDashboard} options={{ tabBarIcon: ({ color, focused }) => icon('home', focused, color) }} />
        <Tab.Screen name="Projects" component={HomeownerProjects} options={{ tabBarIcon: ({ color, focused }) => icon('folder', focused, color) }} />
        <Tab.Screen name="Post" component={HomeownerProjects} listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            setNavRef(navigation);
            setSheetVisible(true);
          },
        })} />
        <Tab.Screen name="Messages" component={HomeownerMessages} options={{ tabBarIcon: ({ color, focused }) => icon('chatbubbles', focused, color) }} />
        <Tab.Screen name="Profile" component={HomeownerProfile} options={{ tabBarIcon: ({ color, focused }) => icon('person', focused, color) }} />
      </Tab.Navigator>

      {/* Custom bottom sheet */}
      <Modal visible={sheetVisible} transparent animationType="fade" onRequestClose={() => setSheetVisible(false)}>
        <Pressable style={sheetStyles.overlay} onPress={() => setSheetVisible(false)}>
          <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={sheetStyles.handle} />
            <Text style={sheetStyles.title}>Start a New Project</Text>
            <Text style={sheetStyles.subtitle}>What would you like to do?</Text>

            <TouchableOpacity style={sheetStyles.option} activeOpacity={0.7} onPress={() => handleOption('ProjectCreate')}>
              <View style={[sheetStyles.optionIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                <Ionicons name="add-circle-outline" size={22} color="#fff" />
              </View>
              <View style={sheetStyles.optionBody}>
                <Text style={sheetStyles.optionTitle}>Post a Project</Text>
                <Text style={sheetStyles.optionSub}>Get quotes from local contractors</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>

            <TouchableOpacity style={sheetStyles.option} activeOpacity={0.7} onPress={() => handleOption('DIYCreate')}>
              <View style={[sheetStyles.optionIcon, { backgroundColor: 'rgba(52,211,153,0.15)' }]}>
                <Ionicons name="hammer-outline" size={22} color="#34D399" />
              </View>
              <View style={sheetStyles.optionBody}>
                <Text style={sheetStyles.optionTitle}>DIY Guide</Text>
                <Text style={sheetStyles.optionSub}>Get a step-by-step guide powered by AI</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>

            <TouchableOpacity style={sheetStyles.cancelBtn} activeOpacity={0.7} onPress={() => setSheetVisible(false)}>
              <Text style={sheetStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 20 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  optionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  optionBody: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 2 },
  optionSub: { fontSize: 13, color: 'rgba(255,255,255,0.45)' },
  cancelBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cancelText: { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
});

function CompanyTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarShowLabel: false }}
    >
      <Tab.Screen name="Jobs" component={CompanyDashboard} options={{ tabBarIcon: ({ color, focused }) => icon('briefcase', focused, color) }} />
      <Tab.Screen name="Calendar" component={CompanyCalendar} options={{ tabBarIcon: ({ color, focused }) => icon('calendar', focused, color) }} />
      <Tab.Screen name="Earnings" component={CompanyEarnings} options={{ tabBarIcon: ({ color, focused }) => icon('cash', focused, color) }} />
      <Tab.Screen name="CompanyProfile" component={CompanyProfile} options={{ tabBarIcon: ({ color, focused }) => icon('person', focused, color) }} />
    </Tab.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function ProjectCreateNavigator() {
  return (
    <ProjectCreateStack.Navigator screenOptions={{ headerShown: false }}>
      <ProjectCreateStack.Screen name="RoomType" component={RoomTypeStep} />
      <ProjectCreateStack.Screen name="Photos" component={PhotosStep} />
      <ProjectCreateStack.Screen name="Measurements" component={MeasurementsStep} />
      <ProjectCreateStack.Screen name="Analyzing" component={AnalyzingStep} />
      <ProjectCreateStack.Screen name="Questionnaire" component={QuestionnaireStep} />
      <ProjectCreateStack.Screen name="Renders" component={RendersStep} />
      <ProjectCreateStack.Screen name="Brief" component={BriefStep} />
      <ProjectCreateStack.Screen name="MaterialDetail" component={MaterialDetailScreen} />
      <ProjectCreateStack.Screen name="Address" component={AddressStep} />
      <ProjectCreateStack.Screen name="Confirm" component={ConfirmStep} />
    </ProjectCreateStack.Navigator>
  );
}

function DIYCreateNavigator() {
  return (
    <DIYCreateStack.Navigator screenOptions={{ headerShown: false }}>
      <DIYCreateStack.Screen name="DIYStart" component={DIYStartScreen} />
      <DIYCreateStack.Screen name="DIYPhotos" component={DIYPhotosScreen} />
      <DIYCreateStack.Screen name="DIYDetails" component={DIYDetailsScreen} />
      <DIYCreateStack.Screen name="DIYGenerating" component={DIYGeneratingScreen} />
      <DIYCreateStack.Screen name="DIYGuide" component={DIYGuideScreen} />
    </DIYCreateStack.Navigator>
  );
}

function ProjectDetailNavigator() {
  return (
    <ProjectDetailStack.Navigator screenOptions={{ headerShown: false }}>
      <ProjectDetailStack.Screen name="ProjectDetailMain" component={ProjectDetail} />
      <ProjectDetailStack.Screen name="ChangeOrders" component={ProjectChangeOrders} />
      <ProjectDetailStack.Screen name="Messages" component={ProjectMessages} />
      <ProjectDetailStack.Screen name="Milestones" component={ProjectMilestones} />
      <ProjectDetailStack.Screen name="Permits" component={ProjectPermits} />
      <ProjectDetailStack.Screen name="Quote" component={ProjectQuote} />
      <ProjectDetailStack.Screen name="Review" component={ProjectReview} />
      <ProjectDetailStack.Screen name="Materials" component={ProjectMaterials} />
      <ProjectDetailStack.Screen name="ProjectSchedule" component={ProjectSchedule} />
      <ProjectDetailStack.Screen name="Warranties" component={ProjectWarranties} />
      <ProjectDetailStack.Screen name="Concierge" component={ProjectConcierge} />
    </ProjectDetailStack.Navigator>
  );
}

function HomeownerNavigator() {
  return (
    <HomeownerStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeownerStack.Screen name="HomeownerTabs" component={HomeownerTabs} />
      <HomeownerStack.Screen name="ProjectCreate" component={ProjectCreateNavigator} />
      <HomeownerStack.Screen name="DIYCreate" component={DIYCreateNavigator} />
      <HomeownerStack.Screen name="ProjectDetail" component={ProjectDetailNavigator} />
      <HomeownerStack.Screen name="Settings" component={HomeownerSettings} />
      <HomeownerStack.Screen name="Notifications" component={NotificationsScreen} />
      <HomeownerStack.Screen name="Search" component={SearchScreen} />
      <HomeownerStack.Screen name="FindPro" component={FindProScreen} />
      <HomeownerStack.Screen name="BrowseIdeas" component={BrowseIdeasScreen} />
      <HomeownerStack.Screen name="Schedule" component={ScheduleScreen} />
      <HomeownerStack.Screen name="InspirationDetail" component={InspirationDetailScreen} />
      <HomeownerStack.Screen name="NewsDetail" component={NewsDetailScreen} />
      <HomeownerStack.Screen name="DIYGuide" component={DIYGuideScreen} />
      <HomeownerStack.Screen name="Chat" component={ChatScreen} />
      <HomeownerStack.Screen name="EditProfile" component={EditProfileScreen} />
      <HomeownerStack.Screen name="MyReviews" component={MyReviewsScreen} />
      <HomeownerStack.Screen name="SavedAddresses" component={SavedAddressesScreen} />
      <HomeownerStack.Screen name="RoomScan" component={RoomScanScreen} />
      <HomeownerStack.Screen name="RoomResults" component={RoomResultsScreen} />
      <HomeownerStack.Screen name="ManualMeasurement" component={ManualMeasurementScreen} />
    </HomeownerStack.Navigator>
  );
}

function JobDetailNavigator() {
  return (
    <JobDetailStack.Navigator screenOptions={{ headerShown: false }}>
      <JobDetailStack.Screen name="JobDetailMain" component={JobDetail} />
      <JobDetailStack.Screen name="JobChangeOrders" component={JobChangeOrders} />
      <JobDetailStack.Screen name="JobMessages" component={JobMessages} />
      <JobDetailStack.Screen name="JobMilestones" component={JobMilestones} />
      <JobDetailStack.Screen name="QuoteBuilder" component={JobQuoteBuilder} />
      <JobDetailStack.Screen name="JobMaterials" component={JobMaterials} />
      <JobDetailStack.Screen name="JobWarranties" component={JobWarranties} />
      <JobDetailStack.Screen name="JobReview" component={JobReview} />
    </JobDetailStack.Navigator>
  );
}

function CompanyNavigator() {
  return (
    <CompanyStack.Navigator screenOptions={{ headerShown: false }}>
      <CompanyStack.Screen name="CompanyTabs" component={CompanyTabs} />
      <CompanyStack.Screen name="PendingVerification" component={PendingVerification} />
      <CompanyStack.Screen name="BusinessOnboarding" component={BusinessOnboarding} />
      <CompanyStack.Screen name="LicenseOnboarding" component={LicenseOnboarding} />
      <CompanyStack.Screen name="InsuranceOnboarding" component={InsuranceOnboarding} />
      <CompanyStack.Screen name="Notifications" component={NotificationsScreen} />
      <CompanyStack.Screen name="JobDetail" component={JobDetailNavigator} />
    </CompanyStack.Navigator>
  );
}

export function RootNavigator() {
  const { session, role, hydrated, setSession, setHydrated, setRole } = useAuthStore();
  const updateProfile = useProfileStore((state) => state.updateProfile);
  const resetProfile = useProfileStore((state) => state.resetProfile);
  const [authRoleResolved, setAuthRoleResolved] = useState(false);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);

  const applySession = useCallback(async (nextSession: typeof session) => {
    setAuthRoleResolved(false);
    setAuthErrorMessage(null);
    setSession(nextSession);
    if (!nextSession?.user?.id) {
      setRole(null);
      resetProfile();
      setHydrated(true);
      setAuthRoleResolved(true);
      return;
    }

    let userResult: any = await supabase
      .from('users')
      .select('role, full_name, phone, avatar_url, address, city, province, postal_code')
      .eq('id', nextSession.user.id)
      .maybeSingle();

    if (userResult.error && isMissingUserProfileColumn(userResult.error.message)) {
      userResult = await supabase
        .from('users')
        .select('role, full_name, phone, avatar_url')
        .eq('id', nextSession.user.id)
        .maybeSingle();
    }

    if (userResult.error && isMissingUserProfileColumn(userResult.error.message)) {
      userResult = await supabase
        .from('users')
        .select('role, full_name, phone')
        .eq('id', nextSession.user.id)
        .maybeSingle();
    }

    if (userResult.error && isMissingUserProfileColumn(userResult.error.message)) {
      userResult = await supabase
        .from('users')
        .select('role')
        .eq('id', nextSession.user.id)
        .maybeSingle();
    }

    if (userResult.error) {
      setAuthErrorMessage(formatAppSafeErrorMessage(userResult.error, 'Could not load your account. Please try again.'));
      setRole(null);
      resetProfile();
      setHydrated(true);
      setAuthRoleResolved(true);
      return;
    }

    const data = userResult.data;
    if (data) {
      updateProfile({
        displayName: data.full_name ?? '',
        phone: data.phone ?? '',
        avatarUri: data.avatar_url ?? null,
        address: data.address ?? '',
        city: data.city ?? '',
        province: data.province ?? '',
      });
    }
    setRole((data?.role as UserRole | undefined) ?? null);
    setHydrated(true);
    setAuthRoleResolved(true);
  }, [resetProfile, setHydrated, setRole, setSession, updateProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      applySession(newSession);
    });
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      applySession(existingSession);
    });
    return () => subscription.unsubscribe();
  }, [applySession]);

  // Push notification wiring. Effect runs once on mount to teach the push
  // service how to deep-link. A separate effect handles per-session init/
  // deactivate so signing out properly deactivates this device's APNs token.
  useEffect(() => {
    setPushDeepLinkHandler((route) => {
      if (!route || !navigationRef.isReady()) return;
      const rootRoute = toRootNotificationRoute(route, role);
      if (!rootRoute) return;
      // CommonActions.navigate bypasses the strict per-stack typing the
      // direct navigationRef.navigate enforces; routes come from a runtime
      // string lookup, so static types don't help here anyway.
      navigationRef.dispatch(CommonActions.navigate({ name: rootRoute.name, params: rootRoute.params }));
    });
  }, [role]);

  const lastPushUserId = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    setPushCurrentRole(role);
    const currentUserId = session?.user?.id ?? null;
    const previousUserId = lastPushUserId.current;
    if (currentUserId && currentUserId !== previousUserId) {
      // New session (sign-in or session resume). Register APNs.
      initPushForUser(currentUserId, role).catch((err) => {
        console.warn('[push] initPushForUser failed:', err);
      });
    } else if (!currentUserId && previousUserId) {
      // Signed out — mark this device's tokens inactive so push doesn't
      // continue delivering to a device whose user is gone.
      deactivatePushForUser(previousUserId).catch((err) => {
        console.warn('[push] deactivatePushForUser failed:', err);
      });
    }
    lastPushUserId.current = currentUserId;
  }, [hydrated, session?.user?.id, role]);

  if (!hydrated || !authRoleResolved) return null;

  if (session && authErrorMessage) {
    return (
      <View style={roleFallbackStyles.container}>
        <Text style={roleFallbackStyles.title}>Account temporarily unavailable</Text>
        <Text style={roleFallbackStyles.body}>{authErrorMessage}</Text>
        <View style={roleFallbackStyles.actionRow}>
          <TouchableOpacity style={roleFallbackStyles.secondaryButton} onPress={() => applySession(session)}>
            <Text style={roleFallbackStyles.secondaryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={roleFallbackStyles.button} onPress={() => supabase.auth.signOut()}>
            <Text style={roleFallbackStyles.buttonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const resolvedRole = role === 'homeowner'
    || role === 'company'
    || role === 'supplier'
    || role === 'general_contractor'
    ? role
    : null;
  if (session && !resolvedRole) {
    return (
      <View style={roleFallbackStyles.container}>
        <Text style={roleFallbackStyles.title}>Account setup incomplete</Text>
        <Text style={roleFallbackStyles.body}>
          Your account role is missing. Sign out and sign in again, or contact support if this keeps happening.
        </Text>
        <TouchableOpacity style={roleFallbackStyles.button} onPress={() => supabase.auth.signOut()}>
          <Text style={roleFallbackStyles.buttonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={{ dark: true, colors: { primary: '#FF6B00', background: '#000000', card: '#000000', text: '#FFFFFF', border: 'transparent', notification: '#FF6B00' }, fonts: { regular: { fontFamily: 'System', fontWeight: '400' }, medium: { fontFamily: 'System', fontWeight: '500' }, bold: { fontFamily: 'System', fontWeight: '700' }, heavy: { fontFamily: 'System', fontWeight: '900' } } }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : resolvedRole === 'homeowner' ? (
          <Stack.Screen name="Homeowner" component={HomeownerNavigator} />
        ) : resolvedRole === 'supplier' ? (
          <Stack.Screen name="Supplier" component={SupplierNavigator} />
        ) : resolvedRole === 'general_contractor' ? (
          <Stack.Screen name="GeneralContractor" component={GeneralContractorNavigator} />
        ) : (
          <Stack.Screen name="Company" component={CompanyNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const roleFallbackStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  body: { color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: {
    minHeight: 48,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: '#FF6B00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#000', fontSize: 15, fontWeight: '800' },
  secondaryButton: {
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
