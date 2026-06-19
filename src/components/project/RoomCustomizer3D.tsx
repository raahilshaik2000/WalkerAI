import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  findNodeHandle,
  Modal,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  requireNativeComponent,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { RoomType } from '@/constants/enums';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import type { SurfaceSelection } from '@/stores/project-wizard.store';
import {
  getCustomizableSurfaces,
  mergeSurfaceSelections,
  type SurfaceOption,
} from '@/lib/room-customizer';
import { GlassCard } from '@/components/ui';

interface NativeRoomCustomizerProps {
  measurementData?: string;
  roomType?: string;
  onSurfaceTap?: (e: NativeSyntheticEvent<{ surfaceId: string }>) => void;
  onLayout?: ViewProps['onLayout'];
  style?: StyleProp<ViewStyle>;
}

const NativeRoomCustomizer = Platform.OS === 'ios'
  ? requireNativeComponent<NativeRoomCustomizerProps>('RoomCustomizerView')
  : null;

interface Props {
  roomType: RoomType | null;
  scanData: unknown;
  selections: Record<string, SurfaceSelection>;
  answers?: Record<string, unknown>;
  onSelect: (selection: SurfaceSelection) => void;
}

function pbrForMaterial(material: string): { roughness: number; metalness: number } {
  const m = material.toLowerCase();
  if (m.includes('chrome') || m.includes('nickel') || m.includes('brass')) {
    return { roughness: 0.15, metalness: 0.85 };
  }
  if (m.includes('matte black')) return { roughness: 0.4, metalness: 0.6 };
  if (m.includes('plumbing fixtures')) return { roughness: 0.2, metalness: 0.8 };
  if (m.includes('quartz') || m.includes('porcelain') || m.includes('marble')) {
    return { roughness: 0.2, metalness: 0.05 };
  }
  if (m.includes('granite') || m.includes('quartzite')) {
    return { roughness: 0.3, metalness: 0.1 };
  }
  if (m.includes('terrazzo') || m.includes('stone')) return { roughness: 0.5, metalness: 0.05 };
  if (m.includes('hardwood') || m.includes('oak') || m.includes('walnut') || m.includes('vinyl')) {
    return { roughness: 0.6, metalness: 0.05 };
  }
  if (m.includes('paint') || m.includes('limewash') || m.includes('shaker') || m.includes('slab')) {
    return { roughness: 0.5, metalness: 0 };
  }
  if (m.includes('tile')) return { roughness: 0.35, metalness: 0.08 };
  return { roughness: 0.5, metalness: 0.05 };
}

export function RoomCustomizer3D({ roomType, scanData, selections, answers = {}, onSelect }: Props) {
  const nativeRef = useRef<unknown>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const [activeSurfaceId, setActiveSurfaceId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nativeLayoutVersion, setNativeLayoutVersion] = useState(0);

  const surfaces = useMemo(() => getCustomizableSurfaces(roomType), [roomType]);
  const mergedSelections = useMemo(
    () => mergeSurfaceSelections(roomType, selections, answers),
    [roomType, selections, answers],
  );
  const measurementJSON = useMemo(
    () => (scanData ? JSON.stringify(scanData) : undefined),
    [scanData],
  );

  const applyMaterialToNative = useCallback((surfaceId: string, option: SurfaceOption) => {
    const tag = findNodeHandle(nativeRef.current as React.Component | null);
    if (tag == null) return;
    const { roughness, metalness } = pbrForMaterial(option.material);
    const args = [surfaceId, option.colorHex, option.material, roughness, metalness];
    const manager = (UIManager as unknown as Record<string, { Commands?: Record<string, number> }>)[
      'RoomCustomizerView'
    ];
    const commandId = manager?.Commands?.setSurfaceMaterial;
    if (typeof commandId === 'number') {
      UIManager.dispatchViewManagerCommand(tag, commandId, args);
    } else {
      // Fabric / new arch: dispatch by method name
      UIManager.dispatchViewManagerCommand(
        tag,
        'setSurfaceMaterial' as unknown as number,
        args,
      );
    }
  }, []);

  const handleNativeLayout = useCallback(() => {
    setNativeLayoutVersion((version) => version + 1);
  }, []);

  // Push initial / merged selections to native so the scene matches state on
  // mount, after native layout, and whenever selections change.
  useEffect(() => {
    surfaces.forEach((surface) => {
      const sel = mergedSelections[surface.id];
      if (!sel) return;
      applyMaterialToNative(surface.id, {
        material: sel.material,
        colorName: sel.colorName,
        colorHex: sel.colorHex,
        answerId: sel.answerId,
      });
    });
  }, [surfaces, mergedSelections, nativeLayoutVersion, applyMaterialToNative]);

  const openSheet = useCallback((surfaceId: string) => {
    setActiveSurfaceId(surfaceId);
    setSheetOpen(true);
    Animated.timing(sheetAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [sheetAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setSheetOpen(false);
      setActiveSurfaceId(null);
    });
  }, [sheetAnim]);

  const handleNativeTap = useCallback((e: NativeSyntheticEvent<{ surfaceId: string }>) => {
    const id = e.nativeEvent.surfaceId;
    if (!id) return;
    // Only open sheet for surfaces we have a material library for
    if (surfaces.some((s) => s.id === id)) {
      openSheet(id);
    }
  }, [surfaces, openSheet]);

  const activeSurface = surfaces.find((s) => s.id === activeSurfaceId) ?? null;

  const handleOption = (option: SurfaceOption) => {
    if (!activeSurface) return;
    onSelect({
      surfaceId: activeSurface.id,
      surfaceLabel: activeSurface.label,
      material: option.material,
      colorName: option.colorName,
      colorHex: option.colorHex,
      answerId: option.answerId,
    });
    applyMaterialToNative(activeSurface.id, option);
    closeSheet();
  };

  if (Platform.OS !== 'ios' || !NativeRoomCustomizer || !measurementJSON) {
    return null;
  }

  const sheetTranslate = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });

  return (
    <>
      <GlassCard style={styles.card}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Customize in 3D</Text>
            <Text style={styles.subtitle}>
              Tap a surface in the model to choose a finish. Drag to rotate the room.
            </Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="cube" size={14} color={Colors.accent} />
            <Text style={styles.badgeText}>3D V1</Text>
          </View>
        </View>

        <View style={styles.viewerWrap}>
          <NativeRoomCustomizer
            ref={nativeRef as React.RefObject<never>}
            measurementData={measurementJSON}
            roomType={roomType ?? ''}
            onSurfaceTap={handleNativeTap}
            onLayout={handleNativeLayout}
            style={styles.viewer}
          />
        </View>

        <View style={styles.legend}>
          {surfaces.map((surface) => {
            const sel = mergedSelections[surface.id];
            return (
              <TouchableOpacity
                key={surface.id}
                style={styles.legendItem}
                onPress={() => openSheet(surface.id)}
                activeOpacity={0.85}
              >
                <View style={[styles.legendSwatch, { backgroundColor: sel.colorHex }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>{surface.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </GlassCard>

      <Modal
        transparent
        visible={sheetOpen}
        animationType="none"
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.backdrop} onPress={closeSheet}>
          <Animated.View
            style={[
              styles.sheet,
              { transform: [{ translateY: sheetTranslate }] },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.sheetHandle} />
            {activeSurface ? (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>{activeSurface.label}</Text>
                  <TouchableOpacity onPress={closeSheet} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={22} color={Colors.text.secondary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.optionsWrap}>
                  {activeSurface.options.map((option) => {
                    const current = mergedSelections[activeSurface.id];
                    const selected = current.material === option.material && current.colorName === option.colorName;
                    return (
                      <TouchableOpacity
                        key={`${option.material}-${option.colorName}`}
                        style={[styles.optionRow, selected && styles.optionRowSelected]}
                        onPress={() => handleOption(option)}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.optionSwatch, { backgroundColor: option.colorHex }]} />
                        <View style={styles.optionText}>
                          <Text style={styles.optionMaterial}>{option.material}</Text>
                          <Text style={styles.optionColor}>{option.colorName}</Text>
                        </View>
                        {selected ? <Ionicons name="checkmark-circle" size={20} color={Colors.accent} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.lg, padding: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  title: { ...Typography.h3 },
  subtitle: { ...Typography.caption, marginTop: 3, lineHeight: 17 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.28)',
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    minHeight: 28,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  viewerWrap: {
    height: 480,
    borderRadius: Radius.item,
    overflow: 'hidden',
    backgroundColor: Colors.bg.primary,
    marginBottom: 12,
  },
  viewer: { flex: 1 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    minHeight: 32,
    maxWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  legendLabel: { fontSize: 12, color: Colors.text.secondary, fontWeight: '600', flexShrink: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 28,
    minHeight: 320,
    borderTopWidth: 1,
    borderColor: Colors.glass.border,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surface.border,
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: { ...Typography.h3 },
  optionsWrap: { gap: 8 },
  optionRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
  },
  optionRowSelected: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
  },
  optionSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  optionText: { flex: 1 },
  optionMaterial: { fontSize: 13, fontWeight: '700', color: Colors.text.primary },
  optionColor: { ...Typography.caption, marginTop: 1 },
});
