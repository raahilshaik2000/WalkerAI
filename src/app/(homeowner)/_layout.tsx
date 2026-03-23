;
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { BlurView } from '@react-native-community/blur';

export default function HomeownerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <BlurView blurType="dark" blurAmount={60} style={StyleSheet.absoluteFill} />
        ),
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.text.secondary,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="Home" focused={focused} color={color} icon="⌂" />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="Alerts" focused={focused} color={color} icon="🔔" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="Profile" focused={focused} color={color} icon="👤" />
          ),
        }}
      />
      {/* Hidden routes — accessible via navigation, not tab bar */}
      <Tabs.Screen name="project" options={{ href: null }} />
    </Tabs>
  );
}

function TabIcon({
  label,
  focused,
  color,
  icon,
}: {
  label: string;
  focused: boolean;
  color: string;
  icon: string;
}) {
  return (
    <View style={[styles.tabItem, focused && styles.tabItemActive]}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      {focused && <Text style={[styles.tabLabel, { color }]}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    borderRadius: 30,
    height: 64,
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    opacity: 0.5,
    flexDirection: 'row',
    gap: 6,
  },
  tabItemActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
