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
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';

// Use platform-specific native module
const ScanModule = Platform.OS === 'ios'
  ? NativeModules.RoomPlanModule
  : NativeModules.RoomScanModule;

type SupportStatus = 'checking' | 'supported' | 'unsupported';
type ScanMode = 'roomplan' | 'ar_measure' | 'unsupported';

export default function RoomScanScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const fromWizard = route.params?.fromWizard ?? false;
  const [supportStatus, setSupportStatus] = useState<SupportStatus>('checking');
  const [supportReason, setSupportReason] = useState<string | null>(null);
  const [supportMode, setSupportMode] = useState<ScanMode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const usesManualAR = supportMode === 'ar_measure';

  useEffect(() => {
    checkSupport();
  }, []);

  useEffect(() => {
    if (!ScanModule) return undefined;

    let scanEmitter: NativeEventEmitter;
    try {
      scanEmitter = new NativeEventEmitter(ScanModule);
    } catch (err) {
      setSupportStatus('unsupported');
      setSupportReason(formatAppSafeErrorMessage(err, 'Room scanning is unavailable on this device.'));
      return undefined;
    }

    const completedSub = scanEmitter.addListener('onScanCompleted', (data) => {
      setIsScanning(false);
      navigation.replace('RoomResults', { scanData: data, fromWizard });
    });

    const errorSub = scanEmitter.addListener('onScanError', (payload?: { error?: string }) => {
      setIsScanning(false);
      setSupportReason(formatAppSafeErrorMessage(payload?.error, 'Room scanning is unavailable on this device.'));
      setSupportStatus('unsupported');
    });

    const cancelSub = scanEmitter.addListener('onScanCancelled', () => {
      setIsScanning(false);
    });

    return () => {
      completedSub.remove();
      errorSub.remove();
      cancelSub.remove();
    };
  }, [fromWizard, navigation]);

  async function checkSupport() {
    if (!ScanModule?.checkDeviceSupport) {
      setSupportStatus('unsupported');
      return;
    }

    try {
      const result = await ScanModule.checkDeviceSupport();
      setSupportReason(result.reason ?? null);
      setSupportMode(result.mode ?? null);
      setSupportStatus(result.supported ? 'supported' : 'unsupported');
    } catch (err) {
      setSupportReason(formatAppSafeErrorMessage(err, 'Room scanning is unavailable on this device.'));
      setSupportStatus('unsupported');
    }
  }

  async function handleStartScan() {
    if (!ScanModule?.startScan) {
      setSupportStatus('unsupported');
      return;
    }

    try {
      setIsScanning(true);
      await ScanModule.startScan();
    } catch (err) {
      setIsScanning(false);
      setSupportReason(formatAppSafeErrorMessage(err, 'Room scanning is unavailable on this device.'));
      setSupportStatus('unsupported');
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
            onManualMeasurement={() => navigation.replace('ManualMeasurement', { fromWizard })}
            onGoBack={() => navigation.goBack()}
            reason={supportReason}
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

          <Text style={styles.title}>{usesManualAR ? 'Measure with AR' : 'Measure Your Room'}</Text>
          <Text style={styles.description}>
            {usesManualAR
              ? 'This device does not have LiDAR, so tap two points for length, width, and ceiling height.'
              : 'Point your camera around the room and move slowly. The scanner will automatically capture walls, doors, windows, and furniture.'}
          </Text>

          <View style={styles.tips}>
            <TipItem icon="sunny-outline" text="Make sure the room is well lit" />
            <TipItem
              icon={usesManualAR ? 'radio-button-on-outline' : 'walk-outline'}
              text={usesManualAR ? 'Tap both ends of each measurement' : 'Walk slowly around the entire room'}
            />
            <TipItem
              icon="phone-portrait-outline"
              text={usesManualAR ? 'Keep the phone steady while tapping points' : 'Keep the phone steady while scanning'}
            />
          </View>
        </View>

        {/* CTA */}
        <View style={styles.bottom}>
          <GlassButton
            label={isScanning ? (usesManualAR ? 'Measuring...' : 'Scanning...') : (usesManualAR ? 'Start AR Measure' : 'Start Scanning')}
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
