import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { AnimatedPressable, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { ALL_INSPIRATION_ITEMS, InspirationItem } from '@/components/dashboard/data';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.5;

export default function InspirationDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const item: InspirationItem = route.params?.item;
  const [saved, setSaved] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const images = item.images?.length ? item.images : [item.imageUrl];
  const similar = ALL_INSPIRATION_ITEMS.filter((i) => i.id !== item.id).slice(0, 6);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(idx);
  };

  return (
    <GradientBackground>
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Image carousel */}
          <View style={styles.heroWrapper}>
            <FlatList
              data={images}
              keyExtractor={(_, i) => `img-${i}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              renderItem={({ item: uri }) => (
                <Image source={{ uri }} style={styles.heroImage} />
              )}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.7)']}
              style={styles.heroGradient}
              pointerEvents="none"
            />

            {/* Top bar */}
            <SafeAreaView style={styles.topBar}>
              <AnimatedPressable style={styles.iconBtn} haptic onPress={() => navigation.goBack()}>
                <Ionicons name="arrow-back" size={20} color="#fff" />
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.iconBtn}
                haptic
                onPress={() => setSaved(!saved)}
              >
                <Ionicons
                  name={saved ? 'heart' : 'heart-outline'}
                  size={20}
                  color={saved ? '#EF4444' : '#fff'}
                />
              </AnimatedPressable>
            </SafeAreaView>

            {/* Page dots */}
            {images.length > 1 && (
              <View style={styles.dotsContainer}>
                {images.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === activeIndex && styles.dotActive]}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.content}>
            <View style={[styles.pill, { backgroundColor: item.categoryColor + '20' }]}>
              <Text style={[styles.pillText, { color: item.categoryColor }]}>
                {item.categoryLabel}
              </Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <View style={styles.savesRow}>
              <Ionicons name="heart" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.savesText}>
                {(saved ? item.saves + 1 : item.saves).toLocaleString()} saves
              </Text>
            </View>

            {/* Similar Ideas */}
            <Text style={styles.sectionTitle}>Similar Ideas</Text>
            <View style={styles.similarGrid}>
              {similar.map((sim) => (
                <AnimatedPressable
                  key={sim.id}
                  style={styles.similarCard}
                  scaleTo={0.96}
                  haptic
                  onPress={() => navigation.replace('InspirationDetail', { item: sim })}
                >
                  <Image source={{ uri: sim.imageUrl }} style={styles.similarImage} />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.75)']}
                    style={styles.similarGradient}
                  />
                  <Text style={styles.similarTitle} numberOfLines={1}>{sim.title}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Hero carousel
  heroWrapper: {
    height: HERO_HEIGHT,
    width: SCREEN_WIDTH,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    resizeMode: 'cover',
  },
  heroGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Page dots
  dotsContainer: {
    position: 'absolute',
    bottom: 52,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
    borderRadius: 3,
  },

  // Content area
  content: {
    marginTop: -32,
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 60,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    marginBottom: 12,
  },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '700', color: '#fff', letterSpacing: -0.3, marginBottom: 8 },
  savesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  savesText: { fontSize: 13, color: Colors.text.secondary },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 14,
  },

  // Similar grid (2 columns)
  similarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  similarCard: {
    width: (SCREEN_WIDTH - 40 - 10) / 2,
    height: 130,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface.default,
  },
  similarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  similarGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
  },
  similarTitle: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});
