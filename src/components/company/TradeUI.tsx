import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

type Tone = 'default' | 'success' | 'warning' | 'muted';

const toneColor: Record<Tone, string> = {
  default: Colors.text.primary,
  success: Colors.success,
  warning: Colors.warning,
  muted: Colors.text.secondary,
};

export function TradeScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function TradeMetricStrip({
  items,
  style,
}: {
  items: Array<{ label: string; value: string | number; tone?: Tone }>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.metricStrip, style]}>
      {items.map((item, index) => (
        <View key={item.label} style={[styles.metricItem, index > 0 && styles.metricDivider]}>
          <Text style={[styles.metricValue, { color: toneColor[item.tone ?? 'default'] }]}>
            {item.value}
          </Text>
          <Text style={styles.metricLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function TradeSection({
  title,
  children,
  action,
  style,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function TradePanel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function TradeActionTile({
  label,
  icon,
  meta,
  onPress,
}: {
  label: string;
  icon: string;
  meta?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionTile} onPress={onPress} activeOpacity={0.82}>
      <Icon name={icon} size={22} color={Colors.text.primary} />
      <Text style={styles.actionLabel}>{label}</Text>
      {meta ? <Text style={styles.actionMeta}>{meta}</Text> : null}
    </TouchableOpacity>
  );
}

export function TradeEmptyState({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={Colors.text.tertiary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: Spacing.md,
  },
  headerTitle: {
    ...Typography.h1,
    marginBottom: 4,
  },
  headerSubtitle: {
    ...Typography.bodySecondary,
  },
  metricStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.card,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  metricItem: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  metricDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.surface.border,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 3,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.label,
    color: Colors.text.secondary,
  },
  panel: {
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.card,
    padding: 16,
  },
  actionTile: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.card,
    padding: 16,
    gap: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  actionMeta: {
    ...Typography.caption,
    color: Colors.text.tertiary,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 72,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginBottom: 16,
  },
  emptyTitle: {
    ...Typography.h3,
    marginBottom: 8,
  },
  emptyBody: {
    ...Typography.bodySecondary,
    textAlign: 'center',
  },
});
