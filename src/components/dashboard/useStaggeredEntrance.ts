import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const STAGGER_DELAY = 80;
const DURATION = 400;
const TRANSLATE_Y = 20;

export function useStaggeredEntrance(sectionIndex: number) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(TRANSLATE_Y);

  useEffect(() => {
    const delay = sectionIndex * STAGGER_DELAY;
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) }),
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: DURATION, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return animatedStyle;
}
