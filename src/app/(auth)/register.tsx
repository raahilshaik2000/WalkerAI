import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { signUp } from '@/lib/supabase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassInput, GradientBackground } from '@/components/ui';
import type { UserRole } from '@/constants/enums';

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const [role, setRole] = useState<UserRole>('homeowner');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const data = await signUp(normalizedEmail, password, role);
      if (!data.session) {
        // Email confirmation required — account created, awaiting verification
        Alert.alert(
          'Check your email',
          `We sent a confirmation link to ${normalizedEmail}. Tap it to activate your account, then sign in.`,
          [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
        );
      }
      // If session exists, root _layout auth listener handles redirect automatically
    } catch (error: unknown) {
      const msg = error instanceof Error
        ? error.message
        : (error as any)?.message ?? JSON.stringify(error);
      Alert.alert('Registration failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Join WalkerAI</Text>

            {/* Role selector */}
            <Text style={styles.roleLabel}>I am a...</Text>
            <View style={styles.roleRow}>
              {([
                { value: 'homeowner', icon: 'home-outline', label: 'Homeowner', sub: 'I want to renovate' },
                { value: 'company', icon: 'hammer-wrench', label: 'Contractor', sub: 'I do renovations' },
                { value: 'supplier', icon: 'truck-delivery-outline', label: 'Supplier', sub: 'I supply materials' },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.roleCard, role === opt.value && styles.roleCardActive]}
                  onPress={() => setRole(opt.value)}
                  activeOpacity={0.8}
                >
                  <Icon
                    name={opt.icon}
                    size={28}
                    color={role === opt.value ? '#FF6B00' : Colors.text.secondary}
                  />
                  <Text style={[styles.roleText, role === opt.value && styles.roleTextActive]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.roleSub}>{opt.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <GlassInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={styles.inputSpacing}
            />

            <GlassInput
              label="Password (min 8 characters)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              containerStyle={styles.inputSpacing}
            />

            <GlassInput
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              containerStyle={styles.inputSpacing}
            />

            <GlassButton
              label="Create Account"
              onPress={handleRegister}
              loading={loading}
              fullWidth
              size="lg"
              style={styles.submitButton}
            />

            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.switchLink}>
                Already have an account?{' '}
                <Text style={styles.switchAccent}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  backButton: { marginBottom: Spacing.lg },
  backText: { color: Colors.text.secondary, fontSize: 15 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  roleLabel: { ...Typography.label, marginBottom: 10 },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: Spacing.lg },
  roleCard: {
    flex: 1,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.item,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 6,
  },
  roleCardActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  roleText: { fontSize: 15, fontWeight: '600', color: Colors.text.secondary },
  roleTextActive: { color: Colors.text.primary },
  roleSub: { fontSize: 12, color: Colors.text.tertiary },
  inputSpacing: { marginBottom: Spacing.sm },
  submitButton: { marginTop: Spacing.sm, marginBottom: Spacing.md },
  switchLink: { color: Colors.text.secondary, textAlign: 'center', fontSize: 15 },
  switchAccent: { color: Colors.accent, fontWeight: '600' },
});
