import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  NativeEventEmitter,
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { GlassButton, GradientBackground } from '@/components/ui';
import { UnsupportedDevice } from '@/components/room-scan';
import { Colors, Typography, Spacing } from '@/constants/theme';

// Use platform-specific native module
const ScanModule = Platform.OS === 'ios'
  ? NativeModules.RoomPlanModule
  : NativeModules.RoomScanModule;
const scanEmitter = new NativeEventEmitter(ScanModule);

type SupportStatus = 'checking' | 'supported' | 'unsupported';

export default function RoomScanScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const fromWizard = route.params?.fromWizard ?? false;
  const [supportStatus, setSupportStatus] = useState<SupportStatus>('checking');
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    checkSupport();
  }, []);

  useEffect(() => {
    const completedSub = scanEmitter.addListener('onScanCompleted', (data) => {
      setIsScanning(false);
      navigation.replace('RoomResults', { scanData: data, fromWizard });
    });

    const errorSub = scanEmitter.addListener('onScanError', (data) => {
      setIsScanning(false);
      // Could show an alert here, for now just go back
      navigation.goBack();
    });

    const cancelSub = scanEmitter.addListener('onScanCancelled', () => {
      setIsScanning(false);
    });

    return () => {
      completedSub.remove();
      errorSub.remove();
      cancelSub.remove();
    };
  }, [navigation]);

  async function checkSupport() {
    try {
      const result = await ScanModule.checkDeviceSupport();
      setSupportStatus(result.supported ? 'supported' : 'unsupported');
    } catch {
      setSupportStatus('unsupported');
    }
  }

  async function handleStartScan() {
    try {
      setIsScanning(true);
      await ScanModule.startScan();
    } catch {
      setIsScanning(false);
    }
  }

  if (supportStatus === 'checking') {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.checkingText}>Checking device capabilities...</Text>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (supportStatus === 'unsupported') {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.container}>
          <UnsupportedDevice
            onManualMeasurement={() => navigation.replace('ManualMeasurement')}
            onGoBack={() => navigation.goBack()}
          />
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <GlassButton
            label=""
            variant="ghost"
            size="sm"
            onPress={() => navigation.goBack()}
            icon={<Ionicons name="arrow-back" size={22} color="#FFFFFF" />}
          />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.iconWrapper}>
            <Ionicons name="scan-outline" size={72} color="#06B6D4" />
          </View>

          <Text style={styles.title}>Measure Your Room</Text>
          <Text style={styles.description}>
            Point your camera around the room and move slowly. The scanner will automatically
            capture walls, doors, windows, and furniture.
          </Text>

          <View style={styles.tips}>
            <TipItem icon="sunny-outline" text="Make sure the room is well lit" />
            <TipItem icon="walk-outline" text="Walk slowly around the entire room" />
            <TipItem icon="phone-portrait-outline" text="Keep the phone steady while scanning" />
          </View>
        </View>

        {/* CTA */}
        <View style={styles.bottom}>
          <GlassButton
            label={isScanning ? 'Scanning...' : 'Start Scanning'}
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleStartScan}
            loading={isScanning}
            icon={!isScanning ? <Ionicons name="scan" size={20} color="#000" /> : undefined}
          />
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

function TipItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.tipRow}>
      <Ionicons name={icon} size={18} color={Colors.text.secondary} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  checkingText: { ...Typography.bodySecondary, marginTop: Spacing.sm },
  header: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  iconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: { ...Typography.h1, marginBottom: Spacing.sm, textAlign: 'center' },
  description: {
    ...Typography.bodySecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  tips: { width: '100%' },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  tipText: { ...Typography.body, marginLeft: 12, color: Colors.text.secondary },
  bottom: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
});
