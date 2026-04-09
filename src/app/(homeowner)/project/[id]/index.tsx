import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge, CardSkeleton } from '@/components/ui';
import type { ProjectStatus } from '@/constants/enums';

interface Project {
  id: string;
  address: string;
  room_type: string;
  status: ProjectStatus;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
  created_at: string;
  assigned_company?: {
    name: string;
    rating: number;
    total_reviews: number;
  } | null;
}

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(cents / 100);
}

const STATUS_VARIANT: Record<string, 'pending' | 'dispatching' | 'active' | 'completed' | 'error' | 'neutral'> = {
  draft: 'neutral',
  dispatching: 'dispatching',
  accepted: 'info' as any,
  quoting: 'pending',
  active: 'active',
  completed: 'completed',
  cancelled: 'error',
  disputed: 'error',
};

/** Animated radar sonar for dispatching state */
function DispatchRadar() {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );

    const a1 = pulse(ring1, 0);
    const a2 = pulse(ring2, 600);
    const a3 = pulse(ring3, 1200);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const ringStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 0.3, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
  });

  return (
    <View style={radarStyles.container}>
      {[ring1, ring2, ring3].map((r, i) => (
        <Animated.View key={i} style={[radarStyles.ring, ringStyle(r)]} />
      ))}
      <View style={radarStyles.core}>
        <Text style={radarStyles.coreText}>📡</Text>
      </View>
    </View>
  );
}

const radarStyles = StyleSheet.create({
  container: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: Spacing.md },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1.5, borderColor: Colors.accent },
  core: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255, 107, 0, 0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.success },
  coreText: { fontSize: 22 },
});

export default function ProjectDetailScreen() {
  const route = useRoute<any>();
  const id = route.params?.id;
  const navigation = useNavigation<any>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProject = async () => {
    const { data } = await supabase
      .from('projects')
      .select(`
        id, address, room_type, status, ai_cost_min, ai_cost_max, created_at, assigned_company_id,
        company:companies!assigned_company_id ( name, rating, total_reviews )
      `)
      .eq('id', id)
      .single();
    setProject(data as Project);
    setLoading(false);
  };

  useEffect(() => {
    fetchProject();

    // Realtime subscription for status changes
    const channel = supabase
      .channel(`project:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${id}` }, () => {
        fetchProject();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  if (loading) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.scroll}>
            <CardSkeleton />
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (!project) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={Typography.h2}>Project not found</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const isDispatching = project.status === 'dispatching';

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <StatusBadge
              label={project.status.replace('_', ' ')}
              variant={STATUS_VARIANT[project.status] ?? 'neutral'}
              dot
            />
          </View>

          <Text style={styles.roomType}>{project.room_type === 'kitchen' ? '🍳' : '🚿'} {project.room_type}</Text>
          <Text style={styles.address}>{project.address}</Text>

          {/* Dispatch radar */}
          {isDispatching && (
            <GlassCard style={styles.card}>
              <DispatchRadar />
              <Text style={styles.dispatchTitle}>Finding your contractor</Text>
              <Text style={styles.dispatchSub}>
                We've notified verified contractors nearby. You'll get a notification the moment someone accepts.
              </Text>
            </GlassCard>
          )}

          {/* Assigned company */}
          {project.assigned_company && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Assigned Contractor</Text>
              <Text style={styles.companyName}>{project.assigned_company.name}</Text>
              <Text style={styles.companyRating}>
                ⭐ {project.assigned_company.rating?.toFixed(1) ?? 'New'} · {project.assigned_company.total_reviews} reviews
              </Text>
            </GlassCard>
          )}

          {/* Cost estimate */}
          {project.ai_cost_min && project.ai_cost_max && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>AI Cost Estimate</Text>
              <Text style={styles.costRange}>
                {formatCad(project.ai_cost_min)} – {formatCad(project.ai_cost_max)}
              </Text>
              <Text style={styles.costNote}>Final price set by contractor quote</Text>
            </GlassCard>
          )}

          {/* Action buttons */}
          <View style={styles.actionsGrid}>
            {[
              { label: 'Milestones', icon: '📋', screen: 'Milestones' },
              { label: 'Messages',   icon: '💬', screen: 'Messages'   },
              { label: 'Quote',      icon: '📄', screen: 'Quote'      },
              { label: 'Permits',    icon: '🏛', screen: 'Permits'    },
              { label: 'Changes',    icon: '📝', screen: 'ChangeOrders' },
              { label: 'Review',     icon: '⭐', screen: 'Review'     },
            ].map((action) => (
              <TouchableOpacity
                key={action.label}
                style={styles.actionCard}
                onPress={() => navigation.navigate(action.screen as any, { id })}
                activeOpacity={0.8}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  backBtn: {},
  backText: { color: Colors.text.secondary, fontSize: 15 },
  roomType: { ...Typography.h2, textTransform: 'capitalize', marginBottom: 6 },
  address: { ...Typography.bodySecondary, marginBottom: Spacing.md },
  card: { marginBottom: Spacing.sm },
  dispatchTitle: { ...Typography.h3, textAlign: 'center', marginBottom: 8 },
  dispatchSub: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
  sectionTitle: { ...Typography.label, marginBottom: 10 },
  companyName: { ...Typography.h3, marginBottom: 4 },
  companyRating: { ...Typography.caption },
  costRange: { fontSize: 28, fontWeight: '700', color: Colors.success, letterSpacing: -0.5, marginBottom: 4 },
  costNote: { ...Typography.caption },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    width: '47%',
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: { fontSize: 28 },
  actionLabel: { ...Typography.label },
});
