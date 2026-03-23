import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { AnimatedPressable } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { NewsItem, NEWS_ITEMS } from './data';
import { SectionHeader } from './SectionHeader';
import { useStaggeredEntrance } from './useStaggeredEntrance';

const TAG_LABELS: Record<string, string> = {
  new: 'NEW',
  tip: 'TIP',
  update: 'UPDATE',
  seasonal: 'SEASONAL',
};

export function NewsAndUpdates() {
  const navigation = useNavigation<any>();
  const animatedStyle = useStaggeredEntrance(5);

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <SectionHeader title="News & Updates" />

      <View style={styles.cards}>
        {NEWS_ITEMS.map((item, i) => (
          <AnimatedPressable key={item.id} style={styles.card} haptic onPress={() => navigation.navigate('NewsDetail', { item })}>
            <View style={[styles.iconWrap, { backgroundColor: item.iconBgColor + '22' }]}>
              <Ionicons name={item.icon as any} size={18} color={item.iconBgColor} />
            </View>
            <View style={styles.content}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <View style={[styles.tag, { backgroundColor: item.tagColor + '22' }]}>
                  <Text style={[styles.tagText, { color: item.tagColor }]}>
                    {TAG_LABELS[item.tag]}
                  </Text>
                </View>
              </View>
              <Text style={styles.subtitle} numberOfLines={2}>{item.subtitle}</Text>
            </View>
          </AnimatedPressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  cards: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  content: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  tagText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.text.tertiary,
    lineHeight: 17,
  },
});
