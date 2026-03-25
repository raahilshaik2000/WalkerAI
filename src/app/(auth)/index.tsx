import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Colors, Spacing } from '@/constants/theme';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { WalkerLogo } from '@/components/ui/WalkerLogo';

const { width } = Dimensions.get('window');

const VALUE_PROPS = [
  'Upload a photo, get a design in seconds',
  'AI-powered renovation planning',
  'Matched with verified local pros',
];

function ValuePropRow({
  text,
  style,
}: {
  text: string;
  style: Animated.AnimateStyle<any>;
}) {
  return (
    <Animated.View style={[styles.valuePropRow, style]}>
      <View style={styles.valuePropBar} />
      <Text style={styles.valuePropText}>{text}</Text>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const navigation = useNavigation<any>();

  // Animation shared values
  const glowProgress = useSharedValue(0);
  const glowPulse = useSharedValue(0);
  const topBarProgress = useSharedValue(0);
  const headline1Progress = useSharedValue(0);
  const headline2Progress = useSharedValue(0);
  const subtitleProgress = useSharedValue(0);
  const vp1Progress = useSharedValue(0);
  const vp2Progress = useSharedValue(0);
  const vp3Progress = useSharedValue(0);
  const ctaProgress = useSharedValue(0);
  const signInProgress = useSharedValue(0);

  useEffect(() => {
    // Glow
    glowProgress.value = withDelay(0, withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) }));
    glowPulse.value = withDelay(2000, withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    ));

    // Staggered entrance
    topBarProgress.value = withDelay(200, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    headline1Progress.value = withDelay(450, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    headline2Progress.value = withDelay(650, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    subtitleProgress.value = withDelay(900, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    vp1Progress.value = withDelay(1050, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    vp2Progress.value = withDelay(1150, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    vp3Progress.value = withDelay(1250, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    ctaProgress.value = withDelay(1400, withSpring(1, { damping: 18, stiffness: 180 }));
    signInProgress.value = withDelay(1500, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
  }, []);

  // Animated styles
  const glowStyle = useAnimatedStyle(() => {
    const baseOpacity = interpolate(glowProgress.value, [0, 1], [0, 0.18]);
    const pulseAdd = interpolate(glowPulse.value, [0, 1], [0, 0.06]);
    return {
      opacity: baseOpacity + pulseAdd,
      transform: [{ scale: interpolate(glowProgress.value, [0, 1], [0.8, 1]) }],
    };
  });

  const topBarStyle = useAnimatedStyle(() => ({
    opacity: topBarProgress.value,
    transform: [{ translateY: interpolate(topBarProgress.value, [0, 1], [-8, 0]) }],
  }));

  const headline1Style = useAnimatedStyle(() => ({
    opacity: headline1Progress.value,
    transform: [{ translateY: interpolate(headline1Progress.value, [0, 1], [20, 0]) }],
  }));

  const headline2Style = useAnimatedStyle(() => ({
    opacity: headline2Progress.value,
    transform: [{ translateY: interpolate(headline2Progress.value, [0, 1], [20, 0]) }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleProgress.value,
    transform: [{ translateY: interpolate(subtitleProgress.value, [0, 1], [10, 0]) }],
  }));

  const vp1Style = useAnimatedStyle(() => ({
    opacity: vp1Progress.value,
    transform: [{ translateX: interpolate(vp1Progress.value, [0, 1], [-12, 0]) }],
  }));

  const vp2Style = useAnimatedStyle(() => ({
    opacity: vp2Progress.value,
    transform: [{ translateX: interpolate(vp2Progress.value, [0, 1], [-12, 0]) }],
  }));

  const vp3Style = useAnimatedStyle(() => ({
    opacity: vp3Progress.value,
    transform: [{ translateX: interpolate(vp3Progress.value, [0, 1], [-12, 0]) }],
  }));

  const vpStyles = [vp1Style, vp2Style, vp3Style];

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaProgress.value,
    transform: [{ translateY: interpolate(ctaProgress.value, [0, 1], [30, 0]) }],
  }));

  const signInStyle = useAnimatedStyle(() => ({
    opacity: signInProgress.value,
  }));

  return (
    <View style={styles.container}>
      {/* Orange ambient glow with pulse */}
      <Animated.View style={[styles.glowOrb, glowStyle]}>
        <LinearGradient
          colors={['rgba(255, 107, 0, 0.22)', 'rgba(255, 69, 0, 0.06)', 'transparent']}
          style={styles.glowGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      {/* Bottom vignette */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={styles.bottomVignette}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Top: Logo left-aligned */}
          <Animated.View style={[styles.topBar, topBarStyle]}>
            <WalkerLogo size={32} />
            <Text style={styles.logoText}>WalkerAI</Text>
          </Animated.View>

          {/* Hero section */}
          <View style={styles.heroSection}>
            {/* Headline — two separately animated lines */}
            <View style={styles.headlineBlock}>
              <Animated.Text style={[styles.headline, headline1Style]}>
                Your renovation,
              </Animated.Text>
              <Animated.Text style={[styles.headline, styles.headlineAccent, headline2Style]}>
                reimagined.
              </Animated.Text>
            </View>

            {/* Subtitle */}
            <Animated.Text style={[styles.subtitle, subtitleStyle]}>
              AI design meets verified contractors.
            </Animated.Text>

            {/* Value propositions */}
            <View style={styles.valueProps}>
              {VALUE_PROPS.map((text, i) => (
                <ValuePropRow key={i} text={text} style={vpStyles[i]} />
              ))}
            </View>
          </View>

          {/* CTA section */}
          <View style={styles.ctaSection}>
            <Animated.View style={ctaStyle}>
              <AnimatedPressable
                style={styles.primaryButton}
                onPress={() => navigation.navigate('Register')}
                haptic
                scaleTo={0.975}
              >
                <LinearGradient
                  colors={['#FFFFFF', '#EBEBEB']}
                  style={styles.primaryGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                >
                  <Text style={styles.primaryButtonText}>Get Started</Text>
                  <Text style={styles.arrowIcon}>→</Text>
                </LinearGradient>
              </AnimatedPressable>
            </Animated.View>

            <Animated.View style={signInStyle}>
              <AnimatedPressable
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('Login')}
                scaleTo={0.98}
              >
                <Text style={styles.signInText}>
                  Already have an account?{' '}
                  <Text style={styles.signInAccent}>Sign in</Text>
                </Text>
              </AnimatedPressable>
            </Animated.View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },

  // Glow
  glowOrb: {
    position: 'absolute',
    top: -120,
    left: -60,
    width: width + 120,
    height: 500,
  },
  glowGradient: {
    flex: 1,
    borderRadius: 250,
  },

  // Bottom vignette
  bottomVignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 280,
  },

  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },

  // Top bar — left-aligned
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: Spacing.xs,
  },
  logoText: {
    fontSize: 19,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: -0.3,
  },

  // Hero
  heroSection: {
    flex: 1,
    justifyContent: 'center',
  },
  headlineBlock: {
    marginBottom: 16,
  },
  headline: {
    fontSize: 46,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: -1.5,
    lineHeight: 54,
  },
  headlineAccent: {
    color: '#FF6B00',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
    lineHeight: 24,
    letterSpacing: -0.2,
    marginBottom: 32,
  },

  // Value props
  valueProps: {
    gap: 14,
  },
  valuePropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  valuePropBar: {
    width: 2,
    height: 20,
    backgroundColor: '#FF6B00',
    borderRadius: 1,
  },
  valuePropText: {
    fontSize: 14,
    color: Colors.text.secondary,
    letterSpacing: -0.1,
    lineHeight: 20,
  },

  // CTA
  ctaSection: {
    gap: 14,
    paddingTop: Spacing.lg,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 8,
  },
  primaryGradient: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    gap: 8,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  arrowIcon: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '400',
  },
  secondaryButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInText: {
    fontSize: 15,
    color: Colors.text.secondary,
    letterSpacing: -0.1,
  },
  signInAccent: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
