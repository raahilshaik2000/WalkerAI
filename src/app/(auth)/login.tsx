import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { signIn } from '@/lib/supabase/auth';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassInput, GradientBackground } from '@/components/ui';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn(normalizedEmail, password);
      // Auth store listener in RootNavigator handles redirect
    } catch (error: unknown) {
      const msg = error instanceof Error
        ? error.message
        : (error as any)?.message ?? JSON.stringify(error);
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-left">
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

            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

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
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              containerStyle={styles.inputSpacing}
            />

            <GlassButton
              label="Sign In"
              onPress={handleLogin}
              loading={loading}
              fullWidth
              size="lg"
              style={styles.submitButton}
            />

            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.switchLink}>
                Don't have an account? <Text style={styles.switchAccent}>Sign up</Text>
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
  inputSpacing: { marginBottom: Spacing.sm },
  submitButton: { marginTop: Spacing.sm, marginBottom: Spacing.md },
  switchLink: { color: Colors.text.secondary, textAlign: 'center', fontSize: 15 },
  switchAccent: { color: Colors.accent, fontWeight: '600' },
});
