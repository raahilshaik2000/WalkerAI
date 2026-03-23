import React, { useRef, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  PROJECTS_LIST,
  ALL_INSPIRATION_ITEMS,
  DashboardProject,
  InspirationItem,
} from '@/components/dashboard/data';

type Result =
  | { type: 'project'; data: DashboardProject }
  | { type: 'idea'; data: InspirationItem };

export default function SearchScreen() {
  const navigation = useNavigation<any>();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');

  const q = query.toLowerCase().trim();
  const results: Result[] = q
    ? [
        ...PROJECTS_LIST.filter(
          (p) => p.title.toLowerCase().includes(q) || p.address.toLowerCase().includes(q),
        ).map((p) => ({ type: 'project' as const, data: p })),
        ...ALL_INSPIRATION_ITEMS.filter((i) =>
          i.title.toLowerCase().includes(q),
        ).map((i) => ({ type: 'idea' as const, data: i })),
      ]
    : [];

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <View style={styles.inputWrap}>
            <Ionicons name="search" size={16} color={Colors.text.tertiary} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Search projects, ideas..."
              placeholderTextColor={Colors.text.tertiary}
              value={query}
              onChangeText={setQuery}
              autoFocus
              selectionColor={Colors.accent}
            />
            {query.length > 0 && (
              <AnimatedPressable onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={18} color={Colors.text.tertiary} />
              </AnimatedPressable>
            )}
          </View>
        </View>

        {/* Results */}
        {q.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyText}>Search your projects and ideas</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No results for "{query}"</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) =>
              item.type === 'project' ? `p-${item.data.id}` : `i-${item.data.id}`
            }
            contentContainerStyle={styles.list}
            renderItem={({ item }) =>
              item.type === 'project' ? (
                <AnimatedPressable
                  style={styles.row}
                  haptic
                  onPress={() =>
                    navigation.navigate('ProjectDetailView', { project: item.data })
                  }
                >
                  <Image source={{ uri: item.data.coverImage }} style={styles.thumb} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{item.data.title}</Text>
                    <Text style={styles.rowSub}>{item.data.address}</Text>
                  </View>
                  <View style={[styles.typePill, { backgroundColor: '#22C55E22' }]}>
                    <Text style={[styles.typeText, { color: '#22C55E' }]}>Project</Text>
                  </View>
                </AnimatedPressable>
              ) : (
                <AnimatedPressable
                  style={styles.row}
                  haptic
                  onPress={() =>
                    navigation.navigate('InspirationDetail', { item: item.data })
                  }
                >
                  <Image source={{ uri: item.data.imageUrl }} style={styles.thumb} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{item.data.title}</Text>
                    <Text style={styles.rowSub}>{item.data.categoryLabel}</Text>
                  </View>
                  <View style={[styles.typePill, { backgroundColor: '#A78BFA22' }]}>
                    <Text style={[styles.typeText, { color: '#A78BFA' }]}>Idea</Text>
                  </View>
                </AnimatedPressable>
              )
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    padding: 0,
  },
  list: { paddingHorizontal: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: 12,
  },
  thumb: { width: 48, height: 48, borderRadius: 10 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 2 },
  rowSub: { fontSize: 12, color: Colors.text.tertiary },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  typeText: { fontSize: 10, fontWeight: '700' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: { fontSize: 14, color: Colors.text.tertiary },
});
