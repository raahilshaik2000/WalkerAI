import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { documentKindFromPath } from '@/lib/document-preview';
import { getSignedUrl } from '@/lib/supabase/storage';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GlassCard, GradientBackground, ListItemSkeleton } from '@/components/ui';

interface Warranty {
  id: string;
  document_url: string;
  expiry_date: string | null;
  created_at: string;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const diff = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return 'Expired';
  if (diff === 0) return 'Expires today';
  return `${diff}d left`;
}

export default function ProjectWarrantiesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');

  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchWarranties = useCallback(async () => {
    if (!projectId) {
      setErrorMessage('Project is missing. Reopen warranties from the project page.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase
      .from('warranties')
      .select('id, document_url, expiry_date, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      setWarranties([]);
      setPreviewUrls({});
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Warranty[];
    const previews: Record<string, string> = {};
    await Promise.all(rows.map(async (warranty) => {
      try {
        previews[warranty.id] = /^https?:\/\//i.test(warranty.document_url)
          ? warranty.document_url
          : await getSignedUrl('warranties', warranty.document_url, 3600);
      } catch {
        // Keep the document row visible even if the private preview cannot be minted.
      }
    }));

    setWarranties(rows);
    setPreviewUrls(previews);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchWarranties();
    if (!projectId) return;
    const channel = supabase
      .channel(`warranties:${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranties', filter: `project_id=eq.${projectId}` }, fetchWarranties)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchWarranties, projectId]);

  const handleOpenDocument = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open document', 'Please try again in a moment.');
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.title}>Warranties</Text>
            <View style={styles.headerSpacer} />
          </View>

          <Text style={styles.subtitle}>
            Warranty cards, labels, and product coverage photos uploaded by your contractor appear here after closeout.
          </Text>

          {loading ? (
            Array.from({ length: 2 }).map((_, index) => (
              <ListItemSkeleton key={index} style={styles.skeleton} />
            ))
          ) : errorMessage ? (
            <GlassCard style={styles.emptyCard}>
              <Icon name="alert-circle-outline" size={42} color={Colors.error} />
              <Text style={styles.emptyTitle}>Could not load warranties</Text>
              <Text style={styles.emptyBody}>{errorMessage}</Text>
              <GlassButton label="Try Again" onPress={fetchWarranties} size="sm" style={styles.retryButton} />
            </GlassCard>
          ) : warranties.length === 0 ? (
            <GlassCard style={styles.emptyCard}>
              <Icon name="shield-check-outline" size={42} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No warranties uploaded</Text>
              <Text style={styles.emptyBody}>
                Ask your contractor to upload warranty cards, product coverage photos, or closeout labels when the project is complete.
              </Text>
            </GlassCard>
          ) : warranties.map((warranty) => {
            const previewUrl = previewUrls[warranty.id];
            const documentKind = documentKindFromPath(warranty.document_url);
            const expiry = formatDate(warranty.expiry_date);
            const remaining = daysUntil(warranty.expiry_date);

            return (
              <GlassCard key={warranty.id} style={styles.warrantyCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.iconCircle}>
                    <Icon name="shield-check-outline" size={20} color={Colors.success} />
                  </View>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle}>Warranty document</Text>
                    <Text style={styles.cardMeta}>Uploaded {formatDate(warranty.created_at)}</Text>
                  </View>
                </View>

                {previewUrl && documentKind === 'image' ? (
                  <Image source={{ uri: previewUrl }} style={styles.preview} resizeMode="cover" />
                ) : previewUrl ? (
                  <TouchableOpacity
                    style={styles.documentRow}
                    onPress={() => handleOpenDocument(previewUrl)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.documentIcon}>
                      <Icon
                        name={documentKind === 'pdf' ? 'file-pdf-box' : 'file-document-outline'}
                        size={26}
                        color={Colors.accent}
                      />
                    </View>
                    <View style={styles.documentTextWrap}>
                      <Text style={styles.documentTitle}>
                        {documentKind === 'pdf' ? 'Open warranty PDF' : 'Open warranty document'}
                      </Text>
                      <Text style={styles.documentSubtitle}>Secure closeout document</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.previewUnavailable}>
                    <Icon name="file-lock-outline" size={28} color={Colors.text.tertiary} />
                    <Text style={styles.previewUnavailableText}>Preview unavailable</Text>
                  </View>
                )}

                {expiry ? (
                  <View style={styles.expiryRow}>
                    <Text style={styles.expiryLabel}>Coverage expiry</Text>
                    <Text style={styles.expiryValue}>
                      {expiry}{remaining ? ` · ${remaining}` : ''}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.noExpiry}>No expiry date provided</Text>
                )}
              </GlassCard>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  headerSpacer: { width: 22 },
  title: { ...Typography.h2 },
  subtitle: { ...Typography.bodySecondary, lineHeight: 22, marginBottom: Spacing.md },
  skeleton: { marginBottom: 10 },
  emptyCard: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 10 },
  emptyTitle: { ...Typography.h3, textAlign: 'center' },
  emptyBody: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
  retryButton: { marginTop: 8 },
  warrantyCard: { marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleWrap: { flex: 1 },
  cardTitle: { ...Typography.h3 },
  cardMeta: { ...Typography.caption, marginTop: 2 },
  preview: { width: '100%', height: 190, borderRadius: Radius.item, marginBottom: 12 },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    padding: 12,
    marginBottom: 12,
  },
  documentIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentTextWrap: { flex: 1 },
  documentTitle: { color: Colors.text.primary, fontSize: 14, fontWeight: '700' },
  documentSubtitle: { ...Typography.caption, marginTop: 2 },
  previewUnavailable: {
    height: 120,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  previewUnavailableText: { ...Typography.caption },
  expiryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  expiryLabel: { ...Typography.bodySecondary },
  expiryValue: { color: Colors.text.primary, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  noExpiry: { ...Typography.caption },
});
