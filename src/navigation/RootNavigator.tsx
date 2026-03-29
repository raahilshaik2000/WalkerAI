import React, { useEffect } from 'react';
import { ActionSheetIOS } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase/client';
import { FloatingTabBar } from '@/components/ui/FloatingTabBar';

// Auth screens
import WelcomeScreen from '@/app/(auth)/index';
import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';

// Homeowner screens
import HomeownerDashboard from '@/app/(homeowner)/index';
import HomeownerProjects from '@/app/(homeowner)/projects';
import HomeownerMessages from '@/app/(homeowner)/messages';
import HomeownerNotifications from '@/app/(homeowner)/notifications';
import HomeownerProfile from '@/app/(homeowner)/profile';
import HomeownerSettings from '@/app/(homeowner)/settings';
import SearchScreen from '@/app/(homeowner)/search';
import FindProScreen from '@/app/(homeowner)/find-pro';
import BrowseIdeasScreen from '@/app/(homeowner)/browse-ideas';
import ScheduleScreen from '@/app/(homeowner)/schedule';
import InspirationDetailScreen from '@/app/(homeowner)/inspiration-detail';
import NewsDetailScreen from '@/app/(homeowner)/news-detail';
import ProjectDetailViewScreen from '@/app/(homeowner)/project-detail-view';
import DetailMilestonesScreen from '@/app/(homeowner)/project/detail/milestones';
import DetailMessagesScreen from '@/app/(homeowner)/project/detail/messages';
import DetailQuoteScreen from '@/app/(homeowner)/project/detail/quote';
import DetailPermitsScreen from '@/app/(homeowner)/project/detail/permits';
import DetailChangeOrdersScreen from '@/app/(homeowner)/project/detail/change-orders';
import DetailReviewScreen from '@/app/(homeowner)/project/detail/review';
import ChatScreen from '@/app/(homeowner)/chat';
import EditProfileScreen from '@/app/(homeowner)/edit-profile';
import MyReviewsScreen from '@/app/(homeowner)/my-reviews';
import SavedAddressesScreen from '@/app/(homeowner)/saved-addresses';

// Homeowner project create screens
import RoomTypeStep from '@/app/(homeowner)/project/create/room-type';
import AddressStep from '@/app/(homeowner)/project/create/address';
import AnalyzingStep from '@/app/(homeowner)/project/create/analyzing';
import BriefStep from '@/app/(homeowner)/project/create/brief';
import ConfirmStep from '@/app/(homeowner)/project/create/confirm';
import PhotosStep from '@/app/(homeowner)/project/create/photos';
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

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const AuthStack = createStackNavigator();
const HomeownerStack = createStackNavigator();
const CompanyStack = createStackNavigator();
const ProjectCreateStack = createStackNavigator();
const ProjectDetailStack = createStackNavigator();
const JobDetailStack = createStackNavigator();
const DIYCreateStack = createStackNavigator();

function icon(name: string, focused: boolean, color: string) {
  return <Ionicons name={focused ? name : `${name}-outline`} size={22} color={color} />;
}

function HomeownerTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarShowLabel: false }}
    >
      <Tab.Screen name="Dashboard" component={HomeownerDashboard} options={{ tabBarIcon: ({ color, focused }) => icon('home', focused, color) }} />
      <Tab.Screen name="Projects" component={HomeownerProjects} options={{ tabBarIcon: ({ color, focused }) => icon('folder', focused, color) }} />
      <Tab.Screen name="Post" component={HomeownerProjects} listeners={({ navigation }) => ({
        tabPress: (e) => {
        e.preventDefault();
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Post a Project', 'DIY Guide'],
            cancelButtonIndex: 0,
            title: 'Start a New Project',
            message: 'What would you like to do?',
          },
          (index) => {
            if (index === 1) navigation.navigate('ProjectCreate');
            if (index === 2) navigation.navigate('DIYCreate');
          },
        );
      },
      })} />
      <Tab.Screen name="Messages" component={HomeownerMessages} options={{ tabBarIcon: ({ color, focused }) => icon('chatbubbles', focused, color) }} />
      <Tab.Screen name="Profile" component={HomeownerProfile} options={{ tabBarIcon: ({ color, focused }) => icon('person', focused, color) }} />
    </Tab.Navigator>
  );
}

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
    <AuthStack.Navigator screenOptions={{ headerShown: false, animationEnabled: true }}>
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
      <ProjectCreateStack.Screen name="Analyzing" component={AnalyzingStep} />
      <ProjectCreateStack.Screen name="Questionnaire" component={QuestionnaireStep} />
      <ProjectCreateStack.Screen name="Renders" component={RendersStep} />
      <ProjectCreateStack.Screen name="Brief" component={BriefStep} />
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
      <HomeownerStack.Screen name="Notifications" component={HomeownerNotifications} />
      <HomeownerStack.Screen name="Search" component={SearchScreen} />
      <HomeownerStack.Screen name="FindPro" component={FindProScreen} />
      <HomeownerStack.Screen name="BrowseIdeas" component={BrowseIdeasScreen} />
      <HomeownerStack.Screen name="Schedule" component={ScheduleScreen} />
      <HomeownerStack.Screen name="InspirationDetail" component={InspirationDetailScreen} />
      <HomeownerStack.Screen name="NewsDetail" component={NewsDetailScreen} />
      <HomeownerStack.Screen name="ProjectDetailView" component={ProjectDetailViewScreen} />
      <HomeownerStack.Screen name="DetailMilestones" component={DetailMilestonesScreen} />
      <HomeownerStack.Screen name="DetailMessages" component={DetailMessagesScreen} />
      <HomeownerStack.Screen name="DetailQuote" component={DetailQuoteScreen} />
      <HomeownerStack.Screen name="DetailPermits" component={DetailPermitsScreen} />
      <HomeownerStack.Screen name="DetailChangeOrders" component={DetailChangeOrdersScreen} />
      <HomeownerStack.Screen name="DetailReview" component={DetailReviewScreen} />
      <HomeownerStack.Screen name="DIYGuide" component={DIYGuideScreen} />
      <HomeownerStack.Screen name="Chat" component={ChatScreen} />
      <HomeownerStack.Screen name="EditProfile" component={EditProfileScreen} />
      <HomeownerStack.Screen name="MyReviews" component={MyReviewsScreen} />
      <HomeownerStack.Screen name="SavedAddresses" component={SavedAddressesScreen} />
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
      <CompanyStack.Screen name="JobDetail" component={JobDetailNavigator} />
    </CompanyStack.Navigator>
  );
}

export function RootNavigator() {
  const { session, role, hydrated, setSession, setHydrated } = useAuthStore();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setHydrated(true);
    });
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setHydrated(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!hydrated) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : role === 'homeowner' ? (
          <Stack.Screen name="Homeowner" component={HomeownerNavigator} />
        ) : (
          <Stack.Screen name="Company" component={CompanyNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
