import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { AnimatedPressable, GlassButton, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';

interface Thread {
  projectId: string;
  projectTitle: string;
  contractorName: string;
  lastMessage: string;
  lastMessageTime: string;
  lastSentAt: string;
}

interface ProjectThreadRow {
  id: string;
  room_type: string | null;
  companies?: { name: string | null } | Array<{ name: string | null }> | null;
}

interface SlotThreadRow {
  project_id: string;
  assigned_company_id: string | null;
  fulfillment_type?: 'walker_ai' | 'external' | null;
  external_trade_name?: string | null;
  external_trade_company?: string | null;
  companies?: { name: string | null } | Array<{ name: string | null }> | null;
}

interface GcThreadRow {
  project_id: string;
  status: string;
  general_contractor?: { business_name: string | null } | Array<{ business_name: string | null }> | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function firstJoinedRow<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function projectTitle(roomType: string | null) {
  return roomType
    ? `${roomType.charAt(0).toUpperCase()}${roomType.slice(1)} Renovation`
    : 'Project';
}

export default function HomeownerMessages() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchThreads = useCallback(async (mode: 'initial' | 'refresh' | 'background' = 'initial') => {
    if (!user) {
      setThreads([]);
      setErrorMessage('Sign in to view your messages.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (mode === 'refresh') setRefreshing(true);
    else if (mode === 'initial') setLoading(true);
    setErrorMessage(null);

    // Include projects with any real project participant: legacy contractor,
    // trade slot company, external GC-managed trade, or assigned GC.
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, room_type, companies!assigned_company_id(name)')
      .eq('homeowner_id', user.id)
      .order('created_at', { ascending: false });

    if (projectsError) {
      setThreads([]);
      setErrorMessage(projectsError.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const projectRows = (projects ?? []) as ProjectThreadRow[];
    const ownedProjectIds = projectRows.map((p) => p.id);
    if (!ownedProjectIds.length) {
      setThreads([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [slotResult, gcResult] = await Promise.all([
      supabase
        .from('project_slots')
        .select(`
          project_id, assigned_company_id, fulfillment_type,
          external_trade_name, external_trade_company,
          companies!assigned_company_id(name)
        `)
        .in('project_id', ownedProjectIds)
        .or('assigned_company_id.not.is.null,fulfillment_type.eq.external'),
      supabase
        .from('general_contractor_projects')
        .select('project_id, status, general_contractor:general_contractors(business_name)')
        .in('project_id', ownedProjectIds)
        .in('status', ['invited', 'active', 'completed']),
    ]);

    if (slotResult.error || gcResult.error) {
      setThreads([]);
      setErrorMessage(slotResult.error?.message ?? gcResult.error?.message ?? 'Could not load message participants.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const slotsByProject = new Map<string, SlotThreadRow[]>();
    for (const slot of (slotResult.data ?? []) as SlotThreadRow[]) {
      const rows = slotsByProject.get(slot.project_id) ?? [];
      rows.push(slot);
      slotsByProject.set(slot.project_id, rows);
    }

    const gcsByProject = new Map<string, GcThreadRow[]>();
    for (const assignment of (gcResult.data ?? []) as GcThreadRow[]) {
      const rows = gcsByProject.get(assignment.project_id) ?? [];
      rows.push(assignment);
      gcsByProject.set(assignment.project_id, rows);
    }

    const participantNameForProject = (project: ProjectThreadRow): string | null => {
      const assignedCompany = firstJoinedRow(project.companies);
      if (assignedCompany?.name) return assignedCompany.name;

      const gc = gcsByProject.get(project.id)?.[0];
      const gcProfile = firstJoinedRow(gc?.general_contractor);
      if (gcProfile?.business_name) return gcProfile.business_name;

      const slotNames = (slotsByProject.get(project.id) ?? [])
        .map((slot) => {
          if (slot.fulfillment_type === 'external') {
            return slot.external_trade_company ?? slot.external_trade_name ?? null;
          }
          return firstJoinedRow(slot.companies)?.name ?? null;
        })
        .filter((name): name is string => Boolean(name));
      if (slotNames.length === 1) return slotNames[0];
      if (slotNames.length > 1) return `${slotNames.length} project participants`;
      return null;
    };

    const threadProjects = projectRows
      .map((project) => ({ project, participantName: participantNameForProject(project) }))
      .filter((row) => !!row.participantName);

    if (!threadProjects.length) {
      setThreads([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const projectIds = threadProjects.map(({ project }) => project.id);

    // Get latest message per project
    const { data: msgs, error: messagesError } = await supabase
      .from('messages')
      .select('project_id, body, sent_at, attachment_url')
      .in('project_id', projectIds)
      .order('sent_at', { ascending: false })
      .limit(500);

    if (messagesError) {
      setThreads([]);
      setErrorMessage(messagesError.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Build latest-per-project map
    const latestMsg: Record<string, { body: string | null; sent_at: string; attachment_url: string | null }> = {};
    for (const m of msgs ?? []) {
      if (!latestMsg[m.project_id]) {
        latestMsg[m.project_id] = {
          body: m.body,
          sent_at: m.sent_at,
          attachment_url: m.attachment_url,
        };
      }
    }

    const result: Thread[] = threadProjects.map(({ project, participantName }) => {
      const last = latestMsg[project.id];
      return {
        projectId: project.id,
        projectTitle: projectTitle(project.room_type),
        contractorName: participantName!,
        lastMessage: last ? (last.body || (last.attachment_url ? 'Photo attachment' : 'No message text')) : 'No messages yet',
        lastMessageTime: last ? timeAgo(last.sent_at) : '',
        lastSentAt: last?.sent_at ?? '',
      };
    });

    // Sort: projects with messages first (most recent), then projects without
    result.sort((a, b) => {
      if (!a.lastSentAt && !b.lastSentAt) return 0;
      if (!a.lastSentAt) return 1;
      if (!b.lastSentAt) return -1;
      return new Date(b.lastSentAt).getTime() - new Date(a.lastSentAt).getTime();
    });

    setThreads(result);
    setErrorMessage(null);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(useCallback(() => { fetchThreads(); }, [fetchThreads]));

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('homeowner-messages-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchThreads('background'))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchThreads, user]);

  const filtered = useMemo(() => {
    if (!search.trim()) return threads;
    const q = search.toLowerCase();
    return threads.filter(
      (t) => t.contractorName.toLowerCase().includes(q) || t.projectTitle.toLowerCase().includes(q),
    );
  }, [search, threads]);

  const renderThread = ({ item }: { item: Thread }) => (
    <AnimatedPressable
      style={styles.thread}
      haptic
      onPress={() => navigation.navigate('Chat', {
        projectId: item.projectId,
        contractorName: item.contractorName,
        projectTitle: item.projectTitle,
      })}
    >
      <View style={[styles.avatar, styles.avatarSystem]}>
        <Ionicons name="person" size={18} color={Colors.text.tertiary} />
      </View>

      <View style={styles.threadContent}>
        <Text style={styles.name} numberOfLines={1}>{item.contractorName}</Text>
        <View style={styles.projectPill}>
          <Text style={styles.projectPillText} numberOfLines={1}>{item.projectTitle}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>{item.lastMessage}</Text>
      </View>

      <View style={styles.rightCol}>
        {item.lastMessageTime ? <Text style={styles.time}>{item.lastMessageTime}</Text> : null}
      </View>
    </AnimatedPressable>
  );

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
          <AnimatedPressable haptic onPress={() => setShowSearch(!showSearch)}>
            <Ionicons name={showSearch ? 'close' : 'search-outline'} size={20} color="#fff" />
          </AnimatedPressable>
        </View>

        {showSearch && (
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={Colors.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search conversations..."
              placeholderTextColor={Colors.text.tertiary}
              value={search}
              onChangeText={setSearch}
              autoFocus
              selectionColor={Colors.accent}
            />
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        ) : (
          <FlatList
            data={errorMessage ? [] : filtered}
            keyExtractor={(item) => item.projectId}
            renderItem={renderThread}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchThreads('refresh')} tintColor={Colors.accent} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              errorMessage ? (
                <View style={styles.empty}>
                  <Ionicons name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
                  <Text style={styles.emptyTitle}>Could not load messages</Text>
                  <Text style={styles.emptySub}>{errorMessage}</Text>
                  <GlassButton label="Try Again" onPress={() => fetchThreads()} size="sm" style={{ marginTop: 10 }} />
                </View>
              ) : (
                <View style={styles.empty}>
                  <Ionicons name="chatbubbles-outline" size={48} color={Colors.text.tertiary} />
                  <Text style={styles.emptyTitle}>No conversations</Text>
                  <Text style={styles.emptySub}>Messages with your contractors, GC, and project participants will appear here once a project is accepted</Text>
                </View>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.surface.default, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.surface.border,
    paddingHorizontal: 12, height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#fff', padding: 0 },
  list: { paddingBottom: 150 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 80 },
  thread: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarSystem: { backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center' },
  threadContent: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 3 },
  projectPill: {
    alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: Radius.pill, marginBottom: 3,
    backgroundColor: 'rgba(255,107,0,0.15)',
  },
  projectPillText: { fontSize: 10, fontWeight: '600', color: Colors.accent },
  preview: { fontSize: 13, color: Colors.text.tertiary, lineHeight: 18 },
  rightCol: { alignItems: 'flex-end' },
  time: { fontSize: 11, color: Colors.text.tertiary },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptySub: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 20 },
});
