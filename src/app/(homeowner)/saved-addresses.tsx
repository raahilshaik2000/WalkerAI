import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassButton, GlassCard, GradientBackground } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';

interface ProjectAddressRow {
  id: string;
  address: string | null;
  city: string | null;
  province: string | null;
  room_type: string;
  status: string;
  created_at: string;
}

interface SavedAddress {
  key: string;
  address: string;
  projectCount: number;
  rooms: string[];
  latestProjectId: string;
  latestCreatedAt: string;
}

function formatRoom(roomType: string) {
  return roomType.replace(/_/g, ' ');
}

function formatAddress(row: ProjectAddressRow) {
  return [row.address, row.city, row.province].filter(Boolean).join(', ');
}

export default function SavedAddressesScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<ProjectAddressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    if (!user?.id) {
      setProjects([]);
      setErrorMessage('Sign in to view saved addresses.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setErrorMessage(null);
    const { data, error } = await supabase
      .from('projects')
      .select('id, address, city, province, room_type, status, created_at')
      .eq('homeowner_id', user.id)
      .not('address', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      setProjects([]);
      setErrorMessage(error.message);
    } else {
      setProjects((data as ProjectAddressRow[]) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const addresses = useMemo(() => {
    const byAddress = new Map<string, SavedAddress>();

    for (const project of projects) {
      const address = formatAddress(project);
      if (!address) continue;
      const key = address.toLowerCase();
      const existing = byAddress.get(key);
      if (existing) {
        existing.projectCount += 1;
        if (!existing.rooms.includes(project.room_type)) existing.rooms.push(project.room_type);
        if (new Date(project.created_at) > new Date(existing.latestCreatedAt)) {
          existing.latestCreatedAt = project.created_at;
          existing.latestProjectId = project.id;
        }
      } else {
        byAddress.set(key, {
          key,
          address,
          projectCount: 1,
          rooms: [project.room_type],
          latestProjectId: project.id,
          latestCreatedAt: project.created_at,
        });
      }
    }

    return Array.from(byAddress.values());
  }, [projects]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAddresses();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Saved Addresses</Text>
          <View style={{ width: 22 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
          >
            {errorMessage ? (
              <View style={styles.empty}>
                <Ionicons name="alert-circle-outline" size={42} color={Colors.text.tertiary} />
                <Text style={styles.emptyTitle}>Could not load addresses</Text>
                <Text style={styles.emptyText}>{errorMessage}</Text>
              </View>
            ) : addresses.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="location-outline" size={42} color={Colors.text.tertiary} />
                <Text style={styles.emptyTitle}>No saved addresses yet</Text>
                <Text style={styles.emptyText}>Addresses appear here after you create a project.</Text>
              </View>
            ) : (
              addresses.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('ProjectDetail', { screen: 'ProjectDetailMain', params: { id: item.latestProjectId } })}
                >
                  <GlassCard style={styles.card}>
                    <View style={styles.row}>
                      <View style={styles.iconWrap}>
                        <Ionicons name="location" size={18} color="#60A5FA" />
                      </View>
                      <View style={styles.info}>
                        <Text style={styles.address}>{item.address}</Text>
                        <Text style={styles.projects}>
                          {item.projectCount} project{item.projectCount === 1 ? '' : 's'} · {item.rooms.map(formatRoom).join(' · ')}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              ))
            )}

            <GlassButton
              label="Start Project at New Address"
              onPress={() => navigation.navigate('ProjectCreate')}
              variant="secondary"
              fullWidth
              haptic
              size="md"
              icon={<Ionicons name="add-circle-outline" size={18} color="#fff" />}
              style={{ marginTop: 12 }}
            />
          </ScrollView>
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 100 },
  card: { marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#60A5FA18', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  address: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 3 },
  projects: { fontSize: 12, color: Colors.text.tertiary, textTransform: 'capitalize' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text.primary },
  emptyText: { fontSize: 14, color: Colors.text.secondary, textAlign: 'center', lineHeight: 20 },
});
