import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { formatCad, formatStatusLabel } from '@/lib/formatters';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground, GlassCard, StatusBadge } from '@/components/ui';
import { TradeEmptyState, TradeScreenHeader } from '@/components/company/TradeUI';

interface ApprovalRow {
  id: string;
  description: string;
  cost_delta: number | null;
  status: string;
  signed_by_homeowner: boolean;
  signed_by_company: boolean;
  project_id: string;
  project?: {
    room_type: string | null;
    city: string | null;
    address: string | null;
  } | Array<{
    room_type: string | null;
    city: string | null;
    address: string | null;
  }> | null;
}

function getProject(row: ApprovalRow) {
  return Array.isArray(row.project) ? row.project[0] ?? null : row.project ?? null;
}

function formatRoom(roomType?: string | null) {
  if (!roomType) return 'Renovation';
  return `${roomType.charAt(0).toUpperCase()}${roomType.slice(1)} Renovation`;
}

export default function GeneralContractorApprovals() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      setErrorMessage('You need to be signed in to view approvals.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      const { data: gc, error: profileError } = await supabase
        .from('general_contractors')
        .select('id')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!gc?.id) {
        setApprovals([]);
        return;
      }

      const { data: assignments, error: assignmentError } = await supabase
        .from('general_contractor_projects')
        .select('project_id')
        .eq('general_contractor_id', gc.id)
        .neq('status', 'removed');
      if (assignmentError) throw assignmentError;

      const projectIds = (assignments ?? []).map((row) => row.project_id).filter(Boolean);
      if (projectIds.length === 0) {
        setApprovals([]);
        return;
      }

      const { data, error } = await supabase
        .from('change_orders')
        .select(`
          id, description, cost_delta, status, signed_by_homeowner, signed_by_company, project_id,
          project:projects ( room_type, city, address )
        `)
        .in('project_id', projectIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setApprovals((data ?? []) as ApprovalRow[]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load approvals.');
      setApprovals([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <TradeScreenHeader title="Approvals" subtitle="Homeowner decisions that gate managed project changes" />

          {errorMessage ? (
            <TradeEmptyState icon="wifi-off" title="Could not load approvals" body={errorMessage} />
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading approvals...</Text>
            </GlassCard>
          ) : approvals.length === 0 ? (
            <TradeEmptyState
              icon="clipboard-check-outline"
              title="No approval requests"
              body="Change orders and other homeowner decisions for GC-managed projects will appear here."
            />
          ) : approvals.map((approval) => {
            const project = getProject(approval);
            const needsHomeowner = approval.status === 'proposed' && approval.signed_by_company && !approval.signed_by_homeowner;
            return (
              <TouchableOpacity
                key={approval.id}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('GeneralContractorProjectDetail', { id: approval.project_id })}
              >
                <GlassCard style={[styles.card, needsHomeowner && styles.needsAction]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.iconWrap}>
                      <Icon name={needsHomeowner ? 'clock-alert-outline' : 'clipboard-text-outline'} size={20} color={needsHomeowner ? Colors.warning : Colors.text.secondary} />
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.projectTitle}>{formatRoom(project?.room_type)}</Text>
                      <Text style={styles.projectMeta}>{project?.city || project?.address || 'Managed project'}</Text>
                    </View>
                    <StatusBadge label={formatStatusLabel(approval.status)} variant={needsHomeowner ? 'pending' : approval.status === 'approved' ? 'completed' : 'neutral'} dot />
                  </View>
                  <Text style={styles.description}>{approval.description}</Text>
                  {approval.cost_delta != null ? (
                    <Text style={styles.costText}>Documented cost change: {formatCad(Math.abs(approval.cost_delta))}</Text>
                  ) : null}
                  {needsHomeowner ? (
                    <Text style={styles.waitingText}>Waiting for homeowner approval</Text>
                  ) : null}
                </GlassCard>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 120 },
  card: { marginBottom: Spacing.sm },
  needsAction: { borderColor: 'rgba(245,158,11,0.45)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  projectTitle: { ...Typography.h3 },
  projectMeta: { ...Typography.caption, marginTop: 2 },
  description: { ...Typography.body, marginBottom: 8 },
  costText: { ...Typography.caption, color: Colors.text.secondary },
  waitingText: { ...Typography.caption, color: Colors.warning, marginTop: 8, fontWeight: '700' },
  bodyText: { ...Typography.bodySecondary },
});
