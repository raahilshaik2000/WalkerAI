import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassButton, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { PROJECTS_LIST } from '@/components/dashboard/data';

export default function SavedAddressesScreen() {
  const navigation = useNavigation<any>();

  // Deduplicate addresses from projects
  const addresses = Array.from(
    new Map(PROJECTS_LIST.map((p) => [p.address, { address: p.address, projects: PROJECTS_LIST.filter((pp) => pp.address === p.address).map((pp) => pp.title) }])).values(),
  );

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Saved Addresses</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {addresses.map((item, i) => (
            <GlassCard key={i} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name="location" size={18} color="#60A5FA" />
                </View>
                <View style={styles.info}>
                  <Text style={styles.address}>{item.address}</Text>
                  <Text style={styles.projects}>
                    {item.projects.join(' · ')}
                  </Text>
                </View>
              </View>
            </GlassCard>
          ))}

          <GlassButton
            label="Add New Address"
            onPress={() => Alert.alert('Add Address', 'Address management coming soon. Addresses are automatically saved from your projects.')}
            variant="secondary"
            fullWidth
            haptic
            size="md"
            icon={<Ionicons name="add-circle-outline" size={18} color="#fff" />}
            style={{ marginTop: 12 }}
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#60A5FA18', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  address: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 3 },
  projects: { fontSize: 12, color: Colors.text.tertiary },
});
