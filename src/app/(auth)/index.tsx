import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1A1A' }]} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>WalkerAI</Text>
          </View>

          {/* Headline */}
          <View style={styles.heroSection}>
            <Text style={styles.headline}>Your renovation,{'\n'}reimagined.</Text>
            <Text style={styles.subtext}>
              Upload photos. Get an AI-powered design. Connect with verified local contractors — instantly.
            </Text>
          </View>

          {/* CTAs */}
          <View style={styles.ctaSection}>
            <View
              style={styles.primaryButton}
              onTouchEnd={() => navigation.navigate('Register')}
            >
              <View style={styles.primaryGradient}>
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </View>
            </View>

            <Text
              style={styles.signInLink}
              onPress={() => navigation.navigate('Login')}
            >
              Already have an account? <Text style={styles.signInLinkAccent}>Sign in</Text>
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'space-between',
    paddingVertical: Spacing.xl,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  headline: {
    fontSize: 42,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: -0.84,
    lineHeight: 50,
    marginBottom: Spacing.sm,
  },
  subtext: {
    fontSize: 16,
    color: Colors.text.secondary,
    lineHeight: 26,
  },
  ctaSection: {
    gap: Spacing.sm,
  },
  primaryButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  primaryGradient: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  signInLink: {
    textAlign: 'center',
    fontSize: 15,
    color: Colors.text.secondary,
  },
  signInLinkAccent: {
    color: Colors.accent,
    fontWeight: '600',
  },
});
