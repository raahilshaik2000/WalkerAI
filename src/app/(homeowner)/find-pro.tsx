import React, { useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { FAKE_PROS, ProContractor } from '@/components/dashboard/data';

const FILTERS = ['All', 'Kitchen', 'Bathroom'] as const;
type Filter = (typeof FILTERS)[number];

export default function FindProScreen() {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<Filter>('All');

  const filtered = FAKE_PROS.filter((p) => {
    if (filter === 'All') return true;
    if (filter === 'Kitchen') return p.specialty === 'kitchen' || p.specialty === 'both';
    return p.specialty === 'bathroom' || p.specialty === 'both';
  });

  const renderPro = ({ item }: { item: ProContractor }) => (
    <GlassCard style={styles.card}>
      <View style={styles.cardTop}>
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{item.name}</Text>
            {item.verified && (
              <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
            )}
          </View>
          <Text style={styles.location}>
            <Ionicons name="location-outline" size={11} color={Colors.text.tertiary} />
            {' '}{item.location}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Ionicons name="star" size={13} color="#F59E0B" />
          <Text style={styles.statText}>{item.rating}</Text>
          <Text style={styles.statSub}>({item.reviewCount})</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="briefcase-outline" size={13} color={Colors.text.tertiary} />
          <Text style={styles.statText}>{item.completedProjects}</Text>
          <Text style={styles.statSub}>projects</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="cash-outline" size={13} color={Colors.text.tertiary} />
          <Text style={styles.statText}>{item.priceRange}</Text>
        </View>
      </View>

      <View style={styles.specialtyRow}>
        {(item.specialty === 'kitchen' || item.specialty === 'both') && (
          <View style={[styles.specialtyPill, { backgroundColor: '#F59E0B22' }]}>
            <Ionicons name="restaurant-outline" size={11} color="#F59E0B" />
            <Text style={[styles.specialtyText, { color: '#F59E0B' }]}>Kitchen</Text>
          </View>
        )}
        {(item.specialty === 'bathroom' || item.specialty === 'both') && (
          <View style={[styles.specialtyPill, { backgroundColor: '#60A5FA22' }]}>
            <Ionicons name="water-outline" size={11} color="#60A5FA" />
            <Text style={[styles.specialtyText, { color: '#60A5FA' }]}>Bathroom</Text>
          </View>
        )}
      </View>
    </GlassCard>
  );

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.title}>Find a Pro</Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Filters */}
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <AnimatedPressable
              key={f}
              style={[styles.filterPill, filter === f && styles.filterActive]}
              haptic
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f === 'All' ? 'All Pros' : `${f} Specialists`}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderPro}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#fff' },
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  filterActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary },
  filterTextActive: { color: '#000' },
  list: { paddingHorizontal: 16, gap: 12, paddingBottom: 100 },
  card: { marginBottom: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  name: { fontSize: 16, fontWeight: '700', color: '#fff' },
  location: { fontSize: 12, color: Colors.text.tertiary },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  statSub: { fontSize: 12, color: Colors.text.tertiary },
  specialtyRow: { flexDirection: 'row', gap: 8 },
  specialtyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  specialtyText: { fontSize: 11, fontWeight: '600' },
});
