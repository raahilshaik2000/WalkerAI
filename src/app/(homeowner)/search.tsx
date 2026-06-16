import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { formatGcProjectType } from '@/lib/gc-project-type';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';

interface Project {
  id: string;
  room_type: string | null;
  status: string;
  address: string | null;
  city: string | null;
}

export default function SearchScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setErrorMessage(null);
    supabase
      .from('projects')
      .select('id, room_type, status, address, city')
      .eq('homeowner_id', user.id)
      .not('status', 'eq', 'diy_saved')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setProjects([]);
          setErrorMessage(error.message);
          return;
        }
        setProjects((data as Project[]) ?? []);
      });
  }, [user]);

  const q = query.toLowerCase().trim();
  const results = q
    ? projects.filter((p) => {
        const title = formatGcProjectType(null, p.room_type).toLowerCase();
        const location = [p.address, p.city].filter(Boolean).join(' ').toLowerCase();
        return title.includes(q) || location.includes(q);
      })
    : [];

  const getTitle = (p: Project) =>
    formatGcProjectType(null, p.room_type);

  const getLocation = (p: Project) =>
    [p.address, p.city].filter(Boolean).join(', ') || 'Address pending';

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <View style={styles.inputWrap}>
            <Ionicons name="search" size={16} color={Colors.text.tertiary} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Search your projects..."
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

        {errorMessage ? (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyText}>Could not load projects: {errorMessage}</Text>
          </View>
        ) : q.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyText}>Search your projects by room type or address</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No projects found for "{query}"</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <AnimatedPressable
                style={styles.row}
                haptic
                onPress={() => navigation.navigate('ProjectDetail', {
                  screen: 'ProjectDetailMain',
                  params: { id: item.id },
                })}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name="home-outline" size={22} color={Colors.text.tertiary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{getTitle(item)}</Text>
                  <Text style={styles.rowSub}>{getLocation(item)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
              </AnimatedPressable>
            )}
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface.default, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.surface.border,
    paddingHorizontal: 12, height: 44,
  },
  input: { flex: 1, fontSize: 14, color: '#fff', padding: 0 },
  list: { paddingHorizontal: 16, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface.default, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.surface.border, padding: 12,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 2 },
  rowSub: { fontSize: 12, color: Colors.text.tertiary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, color: Colors.text.tertiary, textAlign: 'center' },
});
