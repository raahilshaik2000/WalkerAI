import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Polygon, Rect } from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { RoomType } from '@/constants/enums';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import type { SurfaceSelection } from '@/stores/project-wizard.store';
import {
  getCustomizableSurfaces,
  mergeSurfaceSelections,
  sortSurfacesForPreview,
  type SurfaceOption,
} from '@/lib/room-customizer';
import { GlassCard } from '@/components/ui';

interface Props {
  roomType: RoomType | null;
  selections: Record<string, SurfaceSelection>;
  answers?: Record<string, unknown>;
  onSelect: (selection: SurfaceSelection) => void;
}

function shapeForSurface(
  surfaceId: string,
  color: string,
  active: boolean,
  onPress: () => void,
) {
  const commonProps = {
    onPress,
    opacity: active ? 1 : 0.92,
    stroke: active ? Colors.accent : 'rgba(255,255,255,0.08)',
    strokeWidth: active ? 2 : 1,
  } as const;

  switch (surfaceId) {
    case 'cabinets':
      return <Rect x="58" y="58" width="184" height="42" rx="5" fill={color} {...commonProps} />;
    case 'countertops':
    case 'vanity_counter':
      return <Polygon points="54,106 248,106 220,132 78,132" fill={color} {...commonProps} />;
    case 'backsplash':
      return <Rect x="66" y="36" width="168" height="22" rx="3" fill={color} {...commonProps} />;
    case 'flooring':
    case 'floor_tile':
      return <Polygon points="48,146 252,146 286,206 14,206" fill={color} {...commonProps} />;
    case 'walls':
      return <Polygon points="28,24 272,24 252,146 48,146" fill={color} {...commonProps} />;
    case 'vanity':
      return <Rect x="80" y="98" width="140" height="62" rx="8" fill={color} {...commonProps} />;
    case 'shower_tile':
      return <Rect x="42" y="44" width="84" height="116" rx="8" fill={color} {...commonProps} />;
    case 'fixtures':
      return <Rect x="202" y="60" width="28" height="74" rx="14" fill={color} {...commonProps} />;
    default:
      return null;
  }
}

export function RoomMaterialCustomizer({ roomType, selections, answers = {}, onSelect }: Props) {
  const surfaces = useMemo(() => getCustomizableSurfaces(roomType), [roomType]);
  const previewSurfaces = useMemo(() => sortSurfacesForPreview(surfaces), [surfaces]);
  const mergedSelections = useMemo(
    () => mergeSurfaceSelections(roomType, selections, answers),
    [roomType, selections, answers],
  );
  const [activeSurfaceId, setActiveSurfaceId] = useState(surfaces[0]?.id ?? '');
  const activeSurface = surfaces.find((surface) => surface.id === activeSurfaceId) ?? surfaces[0];

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
  };

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Customize finishes</Text>
          <Text style={styles.subtitle}>
            Tap a surface in the preview or choose one below to set the finish for the contractor brief.
          </Text>
        </View>
        <View style={styles.badge}>
          <Ionicons name="cube-outline" size={14} color={Colors.accent} />
          <Text style={styles.badgeText}>Free V1</Text>
        </View>
      </View>

      <View style={styles.preview}>
        <Svg width="100%" height="220" viewBox="0 0 300 220">
          <Rect x="16" y="18" width="268" height="194" rx="18" fill="#111315" />
          <Polygon points="28,24 272,24 252,146 48,146" fill="#25282B" />
          <Polygon points="48,146 252,146 286,206 14,206" fill="#2D2A26" />
          {previewSurfaces.map((surface) => {
            const selection = mergedSelections[surface.id];
            const isActive = activeSurface?.id === surface.id;
            return (
              <React.Fragment key={surface.id}>
                {shapeForSurface(
                  surface.id,
                  selection.colorHex,
                  isActive,
                  () => setActiveSurfaceId(surface.id),
                )}
              </React.Fragment>
            );
          })}
          <Rect x="16" y="18" width="268" height="194" rx="18" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2" />
        </Svg>
      </View>

      <View style={styles.surfaceTabs}>
        {surfaces.map((surface) => {
          const selected = activeSurface?.id === surface.id;
          const finish = mergedSelections[surface.id];
          return (
            <TouchableOpacity
              key={surface.id}
              style={[styles.surfaceTab, selected && styles.surfaceTabActive]}
              onPress={() => setActiveSurfaceId(surface.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.swatch, { backgroundColor: finish.colorHex }]} />
              <Text style={[styles.surfaceLabel, selected && styles.surfaceLabelActive]} numberOfLines={1}>
                {surface.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeSurface ? (
        <View style={styles.options}>
          <Text style={styles.optionHeading}>{activeSurface.label}</Text>
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
      ) : null}
    </GlassCard>
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
  preview: {
    height: 220,
    borderRadius: Radius.item,
    overflow: 'hidden',
    backgroundColor: Colors.bg.primary,
    marginBottom: 12,
  },
  surfaceTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  surfaceTab: {
    minHeight: 36,
    maxWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    paddingHorizontal: 10,
  },
  surfaceTabActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(255, 107, 0, 0.10)',
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  surfaceLabel: { fontSize: 12, color: Colors.text.secondary, fontWeight: '600', flexShrink: 1 },
  surfaceLabelActive: { color: Colors.text.primary },
  options: { gap: 8 },
  optionHeading: { ...Typography.label, color: Colors.text.tertiary, marginBottom: 2 },
  optionRow: {
    minHeight: 52,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  optionText: { flex: 1 },
  optionMaterial: { fontSize: 13, fontWeight: '700', color: Colors.text.primary },
  optionColor: { ...Typography.caption, marginTop: 1 },
});
