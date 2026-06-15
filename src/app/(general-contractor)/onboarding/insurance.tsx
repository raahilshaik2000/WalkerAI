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
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';

export default function GeneralContractorInsuranceOnboarding() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [documentUrl, setDocumentUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFinish = async () => {
    if (!documentUrl.trim()) {
      Alert.alert('Insurance required', 'Add an insurance document link before submitting for review.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in again before continuing.');
      return;
    }

    setLoading(true);
    try {
      const { data: gc, error: profileError } = await supabase
        .from('general_contractors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!gc?.id) {
        navigation.navigate('GeneralContractorBusinessOnboarding');
        return;
      }

      const { error } = await supabase
        .from('general_contractors')
        .update({ insurance_doc_url: documentUrl.trim() })
        .eq('id', gc.id);
      if (error) throw error;
      navigation.navigate('GeneralContractorTabs', { screen: 'GeneralContractorProfile' });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save insurance details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>

            <View style={styles.progressRow}>
              {[1, 2, 3].map((step) => (
                <View key={step} style={[styles.progressDot, styles.progressDotActive]} />
              ))}
            </View>

            <Text style={styles.stepLabel}>STEP 3 OF 3</Text>
            <Text style={styles.title}>Insurance</Text>
            <Text style={styles.subtitle}>
              Insurance is required before a GC account can be reviewed for managed projects.
            </Text>

            <GlassCard style={styles.card}>
              <GlassInput
                label="Insurance Document URL"
                value={documentUrl}
                onChangeText={setDocumentUrl}
                autoCorrect={false}
                autoCapitalize="none"
                keyboardType="url"
                hint="Use a secure document link until native upload is wired for GC files."
              />
            </GlassCard>

            <GlassButton label="Submit for Review" onPress={handleFinish} loading={loading} fullWidth size="lg" />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboard: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  backButton: { marginBottom: Spacing.sm },
  progressRow: { flexDirection: 'row', gap: 4, marginBottom: Spacing.lg },
  progressDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.glass.surface,
  },
  progressDotActive: { backgroundColor: Colors.success },
  stepLabel: { ...Typography.label, color: Colors.success, marginBottom: 8 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  card: { marginBottom: Spacing.md },
});
