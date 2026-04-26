import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { GradientBackground } from '@/components/ui';
import { Colors } from '@/constants/theme';

export default function FindProScreen() {
  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Find a Pro</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="construct-outline" size={48} color={Colors.text.tertiary} />
          <Text style={styles.emptyTitle}>Coming soon</Text>
          <Text style={styles.emptySub}>
            WalkerAI automatically matches you with vetted contractors based on your project. Direct contractor browsing is on the roadmap.
          </Text>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptySub: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 20 },
});
