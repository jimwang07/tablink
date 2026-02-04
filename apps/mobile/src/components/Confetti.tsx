import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COLORS = [
  '#2DD36F', // primary green
  '#F2C94C', // yellow
  '#56CCF2', // light blue
  '#FF6B6B', // coral
  '#DDA0DD', // plum
  '#FFD700', // gold
];

type ConfettiPieceProps = {
  index: number;
  color: string;
  startX: number;
  delay: number;
  duration: number;
  wobbleAmount: number;
  rotationSpeed: number;
  size: number;
  onFinish?: () => void;
  isLast: boolean;
};

function ConfettiPiece({
  index,
  color,
  startX,
  delay,
  duration,
  wobbleAmount,
  rotationSpeed,
  size,
  onFinish,
  isLast,
}: ConfettiPieceProps) {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withTiming(SCREEN_HEIGHT + 100, {
        duration,
        easing: Easing.linear,
      }, (finished) => {
        if (finished && isLast && onFinish) {
          runOnJS(onFinish)();
        }
      })
    );

    translateX.value = withDelay(
      delay,
      withTiming(wobbleAmount, {
        duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );

    rotate.value = withDelay(
      delay,
      withTiming(rotationSpeed * 360, {
        duration,
        easing: Easing.linear,
      })
    );

    opacity.value = withDelay(
      delay + duration * 0.7,
      withTiming(0, {
        duration: duration * 0.3,
        easing: Easing.out(Easing.ease),
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          left: startX,
          width: size,
          height: size * 0.6,
          backgroundColor: color,
          borderRadius: size * 0.15,
        },
        animatedStyle,
      ]}
    />
  );
}

type ConfettiProps = {
  count?: number;
  duration?: number;
  rainDuration?: number;
  colors?: string[];
  onAnimationEnd?: () => void;
};

export function Confetti({
  count = 80,
  duration = 2000,
  rainDuration = 2000,
  colors = CONFETTI_COLORS,
  onAnimationEnd,
}: ConfettiProps) {
  const pieces = React.useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      color: colors[Math.floor(Math.random() * colors.length)],
      startX: Math.random() * SCREEN_WIDTH,
      delay: Math.random() * rainDuration, // spread pieces over rainDuration
      duration: duration + Math.random() * 500, // vary fall speeds
      wobbleAmount: (Math.random() - 0.5) * 100, // side-to-side movement
      rotationSpeed: 2 + Math.random() * 4, // rotation amount
      size: 8 + Math.random() * 8, // vary sizes
    }));
  }, [count, duration, rainDuration, colors]);

  // Find the piece that will finish last (highest delay + duration)
  const lastToFinishIndex = React.useMemo(() => {
    let maxEndTime = 0;
    let lastIndex = 0;
    pieces.forEach((piece, index) => {
      const endTime = piece.delay + piece.duration;
      if (endTime > maxEndTime) {
        maxEndTime = endTime;
        lastIndex = index;
      }
    });
    return lastIndex;
  }, [pieces]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((piece, index) => (
        <ConfettiPiece
          key={piece.id}
          index={piece.id}
          color={piece.color}
          startX={piece.startX}
          delay={piece.delay}
          duration={piece.duration}
          wobbleAmount={piece.wobbleAmount}
          rotationSpeed={piece.rotationSpeed}
          size={piece.size}
          onFinish={onAnimationEnd}
          isLast={index === lastToFinishIndex}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  confettiPiece: {
    position: 'absolute',
    top: -20,
  },
});
