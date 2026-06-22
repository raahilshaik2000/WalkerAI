import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { AnimatedPressable, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { ALL_INSPIRATION_ITEMS, InspirationCategory, InspirationItem } from '@/components/dashboard/data';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_GAP = 10;
const PADDING = 16;
const COLUMN_WIDTH = (SCREEN_WIDTH - PADDING * 2 - COLUMN_GAP) / 2;

const CATEGORY_FILTERS: { id: InspirationCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'photos', label: 'Photos' },
  { id: 'ai_render', label: 'Concepts' },
  { id: 'pro_work', label: 'Pro Work' },
];

function BrowseIdeaCard({ item, onPress }: { item: InspirationItem; onPress: () => void }) {
  const [imageError, setImageError] = useState(false);
  const height = item.id.charCodeAt(1) % 2 === 0 ? 220 : 180;
  return (
    <AnimatedPressable
      style={[styles.card, { height }]}
      scaleTo={0.96}
      haptic
      onPress={onPress}
    >
      {!imageError ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.image}
          onError={() => setImageError(true)}
        />
      ) : (
        <View style={styles.imageFallback} />
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.gradient} />
      <View style={[styles.pill, { backgroundColor: item.categoryColor + '30' }]}>
        <Text style={[styles.pillText, { color: item.categoryColor }]}>{item.categoryLabel}</Text>
      </View>
      <View style={styles.bottom}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
      </View>
    </AnimatedPressable>
  );
}

export default function BrowseIdeasScreen() {
  const navigation = useNavigation<any>();
  const [category, setCategory] = useState<InspirationCategory | 'all'>('all');

  const filtered = useMemo(
    () =>
      category === 'all'
        ? ALL_INSPIRATION_ITEMS
        : ALL_INSPIRATION_ITEMS.filter((i) => i.category === category),
    [category],
  );

  const renderItem = ({ item }: { item: InspirationItem }) => (
    <BrowseIdeaCard
      item={item}
      onPress={() => navigation.navigate('InspirationDetail', { item })}
    />
  );

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Browse Ideas</Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Filters */}
        <View style={styles.filters}>
          {CATEGORY_FILTERS.map((f) => (
            <AnimatedPressable
              key={f.id}
              style={[styles.filterPill, category === f.id && styles.filterActive]}
              haptic
              onPress={() => setCategory(f.id)}
            >
              <Text style={[styles.filterText, category === f.id && styles.filterTextActive]}>
                {f.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
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
  filterActive: { backgroundColor: '#fff', borderColor: '#fff' },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.text.secondary },
  filterTextActive: { color: '#000' },
  list: { paddingHorizontal: PADDING, paddingBottom: 100 },
  columnWrapper: { gap: COLUMN_GAP, marginBottom: COLUMN_GAP },
  card: {
    width: COLUMN_WIDTH,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface.default,
  },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  imageFallback: { width: '100%', height: '100%', backgroundColor: Colors.surface.hover },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
  },
  pill: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  pillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  title: { fontSize: 13, fontWeight: '600', color: '#fff', marginBottom: 3 },
});
