import React, { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
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

export default function InspirationDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const item: InspirationItem = route.params?.item;
  const [saved, setSaved] = useState(false);

  const similar = ALL_INSPIRATION_ITEMS.filter((i) => i.id !== item.id).slice(0, 4);

  return (
    <GradientBackground>
      <View style={styles.container}>
        {/* Hero image */}
        <Image source={{ uri: item.imageUrl }} style={styles.hero} />
        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.8)']}
          style={styles.heroGradient}
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

        {/* Bottom content */}
        <View style={styles.bottom}>
          <View style={[styles.pill, { backgroundColor: item.categoryColor + '30' }]}>
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
          <FlatList
            data={similar}
            keyExtractor={(i) => i.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.similarList}
            renderItem={({ item: sim }) => (
              <AnimatedPressable
                style={styles.similarCard}
                scaleTo={0.96}
                haptic
                onPress={() => navigation.replace('InspirationDetail', { item: sim })}
              >
                <Image source={{ uri: sim.imageUrl }} style={styles.similarImage} />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.7)']}
                  style={styles.similarGradient}
                />
                <Text style={styles.similarTitle} numberOfLines={1}>{sim.title}</Text>
              </AnimatedPressable>
            )}
          />
        </View>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.55,
    resizeMode: 'cover',
  },
  heroGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.55,
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
  bottom: {
    flex: 1,
    marginTop: -40,
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    marginBottom: 10,
  },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  savesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  savesText: { fontSize: 13, color: Colors.text.secondary },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  similarList: { gap: 10, paddingBottom: 40 },
  similarCard: {
    width: 140,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.surface.default,
  },
  similarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  similarGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 50,
  },
  similarTitle: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
});
