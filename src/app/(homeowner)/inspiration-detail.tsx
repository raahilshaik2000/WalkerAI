import React, { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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
  const item = route.params?.item as InspirationItem | undefined;
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullScreenVisible, setFullScreenVisible] = useState(false);
  const [fullScreenIndex, setFullScreenIndex] = useState(0);

  if (!item) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.emptySafe}>
          <View style={styles.emptyHeader}>
            <AnimatedPressable style={styles.iconBtn} haptic onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </AnimatedPressable>
          </View>

          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="images-outline" size={28} color={Colors.text.secondary} />
            </View>
            <Text style={styles.emptyTitle}>Inspiration unavailable</Text>
            <Text style={styles.emptyText}>
              This design concept could not be opened. Go back and choose another idea.
            </Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

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
              renderItem={({ item: uri, index: imgIndex }) => (
                <TouchableOpacity
                  activeOpacity={0.95}
                  onPress={() => {
                    setFullScreenIndex(imgIndex);
                    setFullScreenVisible(true);
                  }}
                >
                  <Image source={{ uri }} style={styles.heroImage} />
                </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => {
                  setFullScreenIndex(activeIndex);
                  setFullScreenVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="expand-outline" size={18} color="#fff" />
              </TouchableOpacity>
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

        {/* Full-Screen Image Viewer Modal */}
        <Modal
          visible={fullScreenVisible}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setFullScreenVisible(false)}
        >
          <View style={styles.fullScreenContainer}>
            <FlatList
              data={images}
              keyExtractor={(_, i) => `fullscreen-img-${i}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={fullScreenIndex}
              getItemLayout={(_, index) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * index,
                index,
              })}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setFullScreenIndex(idx);
              }}
              renderItem={({ item: uri }) => (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => setFullScreenVisible(false)}
                  style={styles.fullScreenImageWrapper}
                >
                  <Image source={{ uri }} style={styles.fullScreenImage} resizeMode="contain" />
                </TouchableOpacity>
              )}
            />

            <View style={styles.fullScreenHeader} pointerEvents="auto">
              <TouchableOpacity
                style={styles.fullScreenCloseBtn}
                onPress={() => setFullScreenVisible(false)}
                activeOpacity={0.7}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
              {images.length > 1 && (
                <Text style={styles.fullScreenCounter}>
                  {fullScreenIndex + 1} / {images.length}
                </Text>
              )}
              <TouchableOpacity
                style={styles.fullScreenDoneBtn}
                onPress={() => setFullScreenVisible(false)}
                activeOpacity={0.7}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Text style={styles.fullScreenDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  iconBtnSpacer: {
    width: 40,
    height: 40,
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
  title: { fontSize: 26, fontWeight: '700', color: '#fff', letterSpacing: -0.3, marginBottom: 28 },
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
  emptySafe: {
    flex: 1,
  },
  emptyHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
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

  // Full-screen Image Viewer
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullScreenHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 28,
    paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  fullScreenCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    elevation: 25,
  },
  fullScreenDoneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    elevation: 25,
  },
  fullScreenDoneText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  fullScreenCounter: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  fullScreenImageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
});
