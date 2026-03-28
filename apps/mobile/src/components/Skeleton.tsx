import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/src/theme';

export function SkeletonPulse({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0.42);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.82, { duration: 900 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

export function SkeletonBlock({
  width,
  height = 14,
  style,
}: {
  width: number | `${number}%`;
  height?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.block, { width, height }, style]} />;
}

export function ScreenPlaceholder() {
  return (
    <View style={s.screen}>
      <SkeletonPulse>
        <View style={s.stack}>
          <SkeletonBlock width={96} height={14} />
          <SkeletonBlock width={180} height={28} />
          <SkeletonBlock width={132} height={12} />
        </View>
      </SkeletonPulse>
    </View>
  );
}

const s = StyleSheet.create({
  block: {
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  stack: {
    alignItems: 'center',
    gap: 12,
  },
});
