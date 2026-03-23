import React, { useState } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { GradientBackground } from '@/components/ui';
import {
  DashboardHeader,
  HeroCTA,
  QuickActions,
  ProjectsCarousel,
  InspirationCarousel,
  NewsAndUpdates,
  ActivityTimeline,
} from '@/components/dashboard';

export default function HomeownerDashboard() {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <Animated.ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
          }
        >
          <DashboardHeader />
          <HeroCTA />
          <QuickActions />
          <ProjectsCarousel />
          <InspirationCarousel />
          <NewsAndUpdates />
          <ActivityTimeline />
        </Animated.ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 150,
  },
});
