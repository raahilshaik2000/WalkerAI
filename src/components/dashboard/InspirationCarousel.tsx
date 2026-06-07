import React, { useCallback } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { AnimatedPressable } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { InspirationItem, INSPIRATION_ITEMS } from './data';
import { SectionHeader } from './SectionHeader';
import { useStaggeredEntrance } from './useStaggeredEntrance';

const CARD_WIDTH = 200;

export function InspirationCarousel() {
  const navigation = useNavigation<any>();
  const animatedStyle = useStaggeredEntrance(4);

  const renderItem = useCallback(
    ({ item }: { item: InspirationItem }) => (
      <AnimatedPressable style={styles.card} scaleTo={0.96} haptic onPress={() => navigation.navigate('InspirationDetail', { item })}>
        <Image source={{ uri: item.imageUrl }} style={styles.image} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.gradient}
        />

        {/* Category pill */}
        <View style={[styles.categoryPill, { backgroundColor: item.categoryColor + '30' }]}>
          <Text style={[styles.categoryText, { color: item.categoryColor }]}>
            {item.categoryLabel}
          </Text>
        </View>

        {/* Bottom content */}
        <View style={styles.bottom}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        </View>
      </AnimatedPressable>
    ),
    [navigation],
  );

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <SectionHeader title="Get Inspired" onPress={() => navigation.navigate('BrowseIdeas')} />
      <FlatList
        data={INSPIRATION_ITEMS}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.listOuter}
        contentContainerStyle={styles.list}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  listOuter: { marginHorizontal: -16 },
  list: { gap: 12, paddingHorizontal: 16 },
  card: {
    width: CARD_WIDTH,
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.surface.default,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
  },
  categoryPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
});
