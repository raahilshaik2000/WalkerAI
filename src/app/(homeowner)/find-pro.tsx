import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { GradientBackground } from '@/components/ui';
import { Colors } from '@/constants/theme';

export default function FindProScreen() {
  const navigation = useNavigation<any>();
  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Find a Pro</Text>
          <View style={{ width: 36 }} />
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptySub: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 20 },
});
