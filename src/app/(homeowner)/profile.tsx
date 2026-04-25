import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';
import { useProfileStore } from '@/stores/profile.store';
import { signOut } from '@/lib/supabase/auth';
import { supabase } from '@/lib/supabase/client';

export default function HomeownerProfile() {
  const navigation = useNavigation<any>();
  const { user, clearSession } = useAuthStore();
  const { displayName, avatarUri } = useProfileStore();

  const name = displayName || user?.email?.split('@')[0] || 'Homeowner';
  const email = user?.email || '';
  const initials = name.slice(0, 2).toUpperCase();

  const [totalProjects, setTotalProjects] = useState(0);
  const [completedProjects, setCompletedProjects] = useState(0);
  const [totalBudget, setTotalBudget] = useState(0);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('projects')
        .select('status, ai_cost_max')
        .eq('homeowner_id', user.id)
        .not('status', 'eq', 'diy_saved');
      if (!data) return;
      setTotalProjects(data.length);
      setCompletedProjects(data.filter((p) => p.status === 'completed').length);
      setTotalBudget(data.reduce((s, p) => s + (p.ai_cost_max ?? 0), 0));
    };
    load();
  }, [user]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          clearSession();
        },
      },
    ]);
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Profile</Text>
            <AnimatedPressable haptic onPress={() => navigation.navigate('Settings')}>
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </AnimatedPressable>
          </View>

          {/* Avatar card */}
          <GlassCard style={styles.avatarCard}>
            <View style={styles.avatarRow}>
              <AnimatedPressable onPress={() => navigation.navigate('EditProfile')} haptic>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.initials}>{initials}</Text>
                  </View>
                )}
              </AnimatedPressable>
              <View style={styles.userInfo}>
                <Text style={styles.name}>{name}</Text>
                <Text style={styles.email}>{email}</Text>
                <View style={styles.memberBadge}>
                  <Ionicons name="shield-checkmark" size={11} color="#22C55E" />
                  <Text style={styles.memberText}>Member since 2025</Text>
                </View>
              </View>
            </View>
          </GlassCard>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalProjects}</Text>
              <Text style={styles.statLabel}>Projects</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{completedProjects}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalBudget > 0 ? `$${Math.round(totalBudget / 100000)}k` : '–'}</Text>
              <Text style={styles.statLabel}>Budget</Text>
            </View>
          </View>

          {/* Account */}
          <Text style={styles.sectionLabel}>Account</Text>
          <GlassCard padding={0}>
            <MenuRow icon="person-outline" label="Edit Profile" onPress={() => navigation.navigate('EditProfile')} />
          </GlassCard>

          {/* Activity */}
          <Text style={styles.sectionLabel}>Activity</Text>
          <GlassCard padding={0}>
            <MenuRow icon="folder-outline" label="My Projects" onPress={() => navigation.navigate('HomeownerTabs', { screen: 'Projects' })} />
            <Divider />
            <MenuRow icon="star-outline" label="My Reviews" onPress={() => navigation.navigate('MyReviews')} />
          </GlassCard>

          {/* Support */}
          <Text style={styles.sectionLabel}>Support</Text>
          <GlassCard padding={0}>
            <MenuRow icon="mail-outline" label="Contact Us" onPress={() => Alert.alert('Contact Us', 'Email: support@walkerai.com')} />
          </GlassCard>

          {/* Sign Out */}
          <AnimatedPressable style={styles.signOutBtn} haptic onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </AnimatedPressable>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function MenuRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <AnimatedPressable style={styles.menuRow} haptic onPress={onPress}>
      <Ionicons name={icon as any} size={18} color={Colors.text.secondary} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
    </AnimatedPressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 150 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },

  avatarCard: { marginBottom: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 70, height: 70, borderRadius: 35 },
  avatarPlaceholder: { backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 24, fontWeight: '700', color: Colors.text.secondary },
  userInfo: { flex: 1 },
  name: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 2 },
  email: { fontSize: 13, color: Colors.text.tertiary, marginBottom: 6 },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  memberText: { fontSize: 11, color: Colors.text.tertiary },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface.default, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.surface.border,
    paddingVertical: 16, marginBottom: Spacing.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 2 },
  statLabel: { fontSize: 11, color: Colors.text.tertiary },
  statDivider: { width: 1, height: 30, backgroundColor: Colors.surface.border },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: Colors.text.tertiary, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },

  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuLabel: { flex: 1, fontSize: 15, color: '#fff' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 46 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: Spacing.md, paddingVertical: 14,
    backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: Radius.card,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  signOutText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
});
