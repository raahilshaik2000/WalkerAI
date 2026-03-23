import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const POST_TAB_NAMES = ['Post'];

// Tab labels for active state
const TAB_LABELS: Record<string, string> = {
  Dashboard: 'Home',
  Projects: 'Projects',
  Messages: 'Messages',
  Profile: 'Profile',
  Jobs: 'Jobs',
  Calendar: 'Calendar',
  Earnings: 'Earnings',
  CompanyProfile: 'Profile',
};

// Pill geometry
const PILL_PADDING_V = 10;
const TAB_HEIGHT = 46;
const PILL_HEIGHT = PILL_PADDING_V * 2 + TAB_HEIGHT; // 66pt
const PILL_RADIUS = PILL_HEIGHT / 2; // true capsule = 33

// Active indicator: pill shape, margin inside each tab slot
const IND_H_MARGIN = 6;
const IND_HEIGHT = TAB_HEIGHT - 2;  // 44pt — nearly full pill height
const IND_RADIUS = IND_HEIGHT / 2;  // true pill
const IND_TOP = (PILL_HEIGHT - IND_HEIGHT) / 2;

const SLIDE_DURATION = 300;
const SLIDE_EASING = Easing.out(Easing.cubic);

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [rowWidth, setRowWidth] = useState(0);
  const tabCount = state.routes.length;
  const tabWidth = rowWidth / tabCount;
  const indWidth = tabWidth - IND_H_MARGIN * 2;

  const indicatorX = useSharedValue(-999);

  useEffect(() => {
    if (tabWidth > 0) {
      const targetX = state.index * tabWidth + IND_H_MARGIN;
      if (indicatorX.value === -999) {
        indicatorX.value = targetX;
      } else {
        indicatorX.value = withTiming(targetX, { duration: SLIDE_DURATION, easing: SLIDE_EASING });
      }
    }
  }, [state.index, tabWidth]);

  const indicatorAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <View
      style={[styles.outerWrapper, { bottom: Math.max(insets.bottom, 8) + 12 }]}
      pointerEvents="box-none"
    >
      <View style={styles.shadowRing} pointerEvents="auto">
        <View style={styles.pill}>

          {/* Layer 1: Native iOS blur — frosted glass */}
          <BlurView
            blurType="chromeMaterialDark"
            blurAmount={28}
            reducedTransparencyFallbackColor="#1C1C1C"
            style={StyleSheet.absoluteFill}
          />

          {/* Layer 2: Semi-transparent dark tint */}
          <View style={[StyleSheet.absoluteFill, styles.pillTint]} pointerEvents="none" />

          {/* Layer 3: Top specular shimmer — glass catching light */}
          <LinearGradient
            colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.topShimmer}
            pointerEvents="none"
          />

          {/* Layer 4: 1pt bright specular line at top edge */}
          <View style={styles.specularLine} pointerEvents="none" />

          {/* Layer 5: Border ring */}
          <View style={[StyleSheet.absoluteFill, styles.pillBorder]} pointerEvents="none" />

          {/* Tab row */}
          <View
            style={styles.tabRow}
            onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
          >
            {/* Sliding pill indicator — behind icons, spans full tab slot */}
            {indWidth > 0 && (
              <Animated.View
                style={[
                  styles.indicator,
                  { width: indWidth, height: IND_HEIGHT, borderRadius: IND_RADIUS, top: IND_TOP },
                  indicatorAnimStyle,
                ]}
                pointerEvents="none"
              />
            )}

            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key];
              const isFocused = state.index === index;
              const isPost = POST_TAB_NAMES.includes(route.name);
              const label = TAB_LABELS[route.name];
              const color = isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.4)';

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              };

              if (isPost) {
                return (
                  <TouchableOpacity
                    key={route.key}
                    style={styles.tabItem}
                    onPress={onPress}
                    activeOpacity={0.82}
                  >
                    <View style={styles.postBtn}>
                      <Ionicons name="add" size={24} color="#000000" />
                    </View>
                  </TouchableOpacity>
                );
              }

              return (
                <TouchableOpacity
                  key={route.key}
                  style={styles.tabItem}
                  onPress={onPress}
                  activeOpacity={0.75}
                >
                  {options.tabBarIcon?.({ focused: isFocused, color, size: 22 })}
                </TouchableOpacity>
              );
            })}
          </View>

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
  },

  shadowRing: {
    borderRadius: PILL_RADIUS,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },

  pill: {
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
  },

  pillTint: {
    backgroundColor: 'rgba(20, 20, 20, 0.72)',
  },

  topShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderTopLeftRadius: PILL_RADIUS,
    borderTopRightRadius: PILL_RADIUS,
  },

  specularLine: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 0.5,
  },

  pillBorder: {
    borderRadius: PILL_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  tabRow: {
    flexDirection: 'row',
    paddingVertical: PILL_PADDING_V,
    alignItems: 'center',
  },

  // The sliding pill indicator — sits behind icon + label
  indicator: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },

  tabItem: {
    flex: 1,
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0,
  },

  // Solid white circle — the + action button
  postBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
