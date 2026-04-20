import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';

export default function SupplierLicenseOnboarding() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [licenseNumber, setLicenseNumber] = useState('');
  const [docUri, setDocUri] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickDoc = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.assets?.[0]) {
      setDocUri(result.assets[0].uri ?? null);
      setDocName(result.assets[0].fileName ?? 'license.jpg');
    }
  };

  const handleNext = async () => {
    if (!licenseNumber.trim()) {
      Alert.alert('Required', 'Please enter your business license number.');
      return;
    }
    setLoading(true);
    try {
      let docUrl: string | null = null;
      if (docUri) {
        const ext = docName?.split('.').pop() ?? 'jpg';
        const path = `supplier-licenses/${user!.id}/license.${ext}`;
        const response = await fetch(docUri);
        const blob = await response.blob();
        const { error: uploadError } = await supabase.storage.from('company-docs').upload(path, blob, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('company-docs').getPublicUrl(path);
        docUrl = urlData.publicUrl;
      }

      const { error } = await supabase
        .from('suppliers')
        .update({ license_number: licenseNumber.trim(), license_doc_url: docUrl })
        .eq('user_id', user!.id);
      if (error) throw error;
      navigation.navigate('SupplierCategoriesOnboarding');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>

          <View style={styles.stepRow}>
            {[1, 2, 3].map((s) => (
              <View key={s} style={[styles.stepDot, s <= 2 && styles.stepDotActive]} />
            ))}
          </View>

          <Text style={styles.title}>Business License</Text>
          <Text style={styles.subtitle}>Required to verify your supply business</Text>

          <GlassCard style={styles.card}>
            <GlassInput
              label="License Number"
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              autoCapitalize="characters"
              containerStyle={{ marginBottom: Spacing.md }}
            />

            <Text style={styles.docLabel}>License Document (optional)</Text>
            <TouchableOpacity style={styles.uploadBox} onPress={pickDoc} activeOpacity={0.7}>
              <Ionicons name={docUri ? 'checkmark-circle' : 'cloud-upload-outline'} size={32} color={docUri ? '#34D399' : Colors.text.secondary} />
              <Text style={[styles.uploadText, docUri && { color: '#34D399' }]}>
                {docUri ? docName : 'Tap to upload photo of license'}
              </Text>
            </TouchableOpacity>
          </GlassCard>

          <GlassButton label="Next — Categories" onPress={handleNext} loading={loading} fullWidth size="lg" />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  back: { marginBottom: Spacing.md },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  stepDotActive: { backgroundColor: Colors.accent, width: 24 },
  title: { ...Typography.h1, marginBottom: 6 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  card: { padding: Spacing.md, marginBottom: Spacing.lg },
  docLabel: { fontSize: 13, color: Colors.text.secondary, marginBottom: 10 },
  uploadBox: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
    borderRadius: Radius.item,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  uploadText: { fontSize: 14, color: Colors.text.secondary, textAlign: 'center' },
});
