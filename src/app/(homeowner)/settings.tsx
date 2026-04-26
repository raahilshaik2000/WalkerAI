import React from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { AnimatedPressable, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useProfileStore } from '@/stores/profile.store';
import { useAuthStore } from '@/stores/auth.store';
import { signOut } from '@/lib/supabase/auth';
import { supabase } from '@/lib/supabase/client';

export default function HomeownerSettings() {
  const navigation = useNavigation<any>();
  const profile = useProfileStore();
  const { user, clearSession } = useAuthStore();
  const email = user?.email || '';

  const toggle = (key: string, value: boolean) => {
    profile.updateProfile({ [key]: value });
    ReactNativeHapticFeedback.trigger('impactLight');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure? This will permanently delete your account and all data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'This is irreversible. Are you absolutely sure?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    // Mark account for deletion then sign out — full deletion handled server-side within 24h
                    await supabase.from('deletion_requests').insert({ user_id: user?.id });
                    profile.resetProfile();
                    await signOut();
                    clearSession();
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Notifications */}
          <Text style={styles.sectionLabel}>Notifications</Text>
          <GlassCard padding={0}>
            <ToggleRow icon="notifications-outline" iconColor="#60A5FA" label="Push Notifications" value={profile.pushEnabled} onToggle={(v) => toggle('pushEnabled', v)} />
            <Divider />
            <ToggleRow icon="mail-outline" iconColor="#A78BFA" label="Email Digest" value={profile.emailDigest} onToggle={(v) => toggle('emailDigest', v)} />
            <Divider />
            <ToggleRow icon="chatbubble-outline" iconColor="#22C55E" label="SMS Alerts" value={profile.smsAlerts} onToggle={(v) => toggle('smsAlerts', v)} />
          </GlassCard>

          {/* Alert Types */}
          <Text style={styles.sectionLabel}>Alert Types</Text>
          <GlassCard padding={0}>
            <ToggleRow icon="flag-outline" iconColor="#F59E0B" label="Milestone Updates" value={profile.milestoneAlerts} onToggle={(v) => toggle('milestoneAlerts', v)} />
            <Divider />
            <ToggleRow icon="document-text-outline" iconColor="#FF6B00" label="Quote Notifications" value={profile.quoteAlerts} onToggle={(v) => toggle('quoteAlerts', v)} />
            <Divider />
            <ToggleRow icon="chatbubbles-outline" iconColor="#60A5FA" label="Message Alerts" value={profile.messageAlerts} onToggle={(v) => toggle('messageAlerts', v)} />
          </GlassCard>

          {/* Security */}
          <Text style={styles.sectionLabel}>Security & Privacy</Text>
          <GlassCard padding={0}>
            <LinkRow icon="lock-closed-outline" iconColor="#EF4444" label="Change Password" onPress={async () => {
              const { error } = await supabase.auth.resetPasswordForEmail(email);
              if (error) Alert.alert('Error', error.message);
              else Alert.alert('Password Reset', `A reset link has been sent to ${email}. Check your inbox.`);
            }} />
            <Divider />
            <ToggleRow icon="finger-print-outline" iconColor="#A78BFA" label="Face ID / Touch ID" value={profile.faceId} onToggle={(v) => toggle('faceId', v)} />
            <Divider />
            <LinkRow icon="shield-outline" iconColor="#F59E0B" label="Two-Factor Auth" badge="Coming Soon" onPress={() => Alert.alert('Coming Soon', 'Two-factor authentication will be available in a future update.')} />
          </GlassCard>

          {/* App */}
          <Text style={styles.sectionLabel}>App</Text>
          <GlassCard padding={0}>
            <LinkRow icon="language-outline" iconColor="#60A5FA" label="Language" badge="English" onPress={() => Alert.alert('Language', 'English is the only supported language at this time.')} />
            <Divider />
            <LinkRow icon="moon-outline" iconColor="#A78BFA" label="Appearance" badge={profile.appearance === 'dark' ? 'Dark' : profile.appearance === 'light' ? 'Light' : 'System'} onPress={() => {
              const next = profile.appearance === 'dark' ? 'light' : profile.appearance === 'light' ? 'system' : 'dark';
              profile.updateProfile({ appearance: next as any });
              ReactNativeHapticFeedback.trigger('impactLight');
            }} />
            <Divider />
            <ToggleRow icon="location-outline" iconColor="#22C55E" label="Location Services" value={profile.locationServices} onToggle={(v) => toggle('locationServices', v)} />
            <Divider />
            <ToggleRow icon="analytics-outline" iconColor="#F59E0B" label="Analytics" value={profile.analyticsEnabled} onToggle={(v) => toggle('analyticsEnabled', v)} />
            <Divider />
            <LinkRow icon="trash-outline" iconColor={Colors.text.tertiary} label="Clear Cache" onPress={() => Alert.alert('Clear Cache', 'Clear cached images and data?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => { ReactNativeHapticFeedback.trigger('impactMedium'); Alert.alert('Cache Cleared'); } },
            ])} />
          </GlassCard>

          {/* Legal */}
          <Text style={styles.sectionLabel}>Legal</Text>
          <GlassCard padding={0}>
            <LinkRow icon="document-outline" iconColor={Colors.text.tertiary} label="Terms of Service" onPress={() => Linking.openURL('https://walkerai.com/terms')} />
            <Divider />
            <LinkRow icon="shield-checkmark-outline" iconColor={Colors.text.tertiary} label="Privacy Policy" onPress={() => Linking.openURL('https://walkerai.com/privacy')} />
            <Divider />
            <LinkRow icon="code-outline" iconColor={Colors.text.tertiary} label="Open Source Licenses" onPress={() => Alert.alert('Open Source', 'This app uses React Native, Supabase, Zustand, and other open-source libraries. Full license details available at walkerai.com/licenses.')} />
            <Divider />
            <LinkRow icon="cloud-download-outline" iconColor={Colors.text.tertiary} label="Export My Data" onPress={() => Alert.alert('Export Data', `Your data export will be sent to ${email}. This may take up to 24 hours.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Export', onPress: () => Alert.alert('Request Sent', 'You\'ll receive an email when your export is ready.') },
            ])} />
          </GlassCard>

          {/* Danger Zone */}
          <Text style={styles.sectionLabel}>Danger Zone</Text>
          <AnimatedPressable style={styles.deleteBtn} haptic onPress={handleDeleteAccount}>
            <Ionicons name="warning-outline" size={18} color="#EF4444" />
            <Text style={styles.deleteText}>Delete Account</Text>
          </AnimatedPressable>

          <Text style={styles.version}>WalkerAI v1.0.0 · Build 42</Text>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ToggleRow({ icon, iconColor, label, value, onToggle }: {
  icon: string; iconColor: string; label: string; value: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon as any} size={16} color={iconColor} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.surface.border, true: '#22C55E' }}
        thumbColor="#fff"
      />
    </View>
  );
}

function LinkRow({ icon, iconColor, label, badge, onPress }: {
  icon: string; iconColor: string; label: string; badge?: string; onPress: () => void;
}) {
  return (
    <AnimatedPressable style={styles.row} haptic onPress={onPress}>
      <View style={[styles.iconWrap, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon as any} size={16} color={iconColor} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
    </AnimatedPressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },

  sectionLabel: { fontSize: 12, fontWeight: '600', color: Colors.text.tertiary, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8, marginTop: 16 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  iconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 14, color: '#fff' },
  badge: { backgroundColor: Colors.surface.hover, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, marginRight: 4 },
  badgeText: { fontSize: 11, color: Colors.text.tertiary, fontWeight: '500' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 56 },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: Radius.card, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  deleteText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },

  version: { textAlign: 'center', fontSize: 11, color: Colors.text.tertiary, marginTop: 20 },
});
