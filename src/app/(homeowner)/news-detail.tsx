import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { NewsItem, NEWS_DETAIL_CONTENT } from '@/components/dashboard/data';

const TAG_LABELS: Record<string, string> = {
  new: 'NEW',
  tip: 'TIP',
  update: 'UPDATE',
  seasonal: 'SEASONAL',
};

export default function NewsDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const item = route.params?.item as NewsItem | undefined;

  if (!item) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <AnimatedPressable onPress={() => navigation.goBack()} haptic>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </AnimatedPressable>
            <View style={{ width: 22 }} />
          </View>

          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="newspaper-outline" size={28} color={Colors.text.secondary} />
            </View>
            <Text style={styles.emptyTitle}>Article unavailable</Text>
            <Text style={styles.emptyText}>
              This update could not be opened. Go back and choose another article.
            </Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const body = NEWS_DETAIL_CONTENT[item.id] ?? '';

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Icon + tag */}
          <View style={styles.iconRow}>
            <View style={[styles.iconCircle, { backgroundColor: item.iconBgColor + '22' }]}>
              <Ionicons name={item.icon as any} size={28} color={item.iconBgColor} />
            </View>
            <View style={[styles.tag, { backgroundColor: item.tagColor + '22' }]}>
              <Text style={[styles.tagText, { color: item.tagColor }]}>
                {TAG_LABELS[item.tag]}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>

          <View style={styles.divider} />

          {body.split('\n\n').map((paragraph, i) => (
            <Text key={i} style={styles.bodyText}>{paragraph}</Text>
          ))}
        </ScrollView>
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
  scroll: { paddingHorizontal: 20, paddingBottom: 100 },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  tagText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.text.secondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surface.border,
    marginBottom: 20,
  },
  bodyText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 24,
    marginBottom: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 80,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
    textAlign: 'center',
  },
});
