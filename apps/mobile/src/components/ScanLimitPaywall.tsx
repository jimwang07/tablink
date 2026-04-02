import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme';
import type { ScanUsage } from '@/src/services/scanLimitService';

type Props = {
  usage: ScanUsage;
  onDismiss: () => void;
};

export function ScanLimitPaywall({ usage, onDismiss }: Props) {
  return (
    <View style={s.overlay}>
      <Animated.View entering={FadeInDown.duration(400).springify()} style={s.card}>
        {/* Close button */}
        <Pressable style={s.closeButton} onPress={onDismiss} hitSlop={12}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>

        {/* Icon */}
        <View style={s.iconContainer}>
          <Ionicons name="scan" size={28} color={colors.primary} />
        </View>

        {/* Usage indicator */}
        <View style={s.usageRow}>
          {Array.from({ length: usage.limit }, (_, i) => (
            <View
              key={i}
              style={[s.usageDot, i < usage.used && s.usageDotUsed]}
            />
          ))}
        </View>
        <Text style={s.usageText}>
          {usage.used} of {usage.limit} free scans used this month
        </Text>

        {/* Heading */}
        <Text style={s.title}>Upgrade to Pro</Text>
        <Text style={s.description}>
          Get unlimited receipt scans and never worry about limits.
        </Text>

        {/* Features */}
        <View style={s.features}>
          {[
            'Unlimited receipt scans',
            'Priority processing',
            'Early access to new features',
          ].map((feature) => (
            <View key={feature} style={s.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Text style={s.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Subscribe button (placeholder) */}
        <Pressable
          style={({ pressed }) => [s.subscribeButton, pressed && s.subscribeButtonPressed]}
          onPress={() => {
            // TODO: RevenueCat integration
          }}
        >
          <Text style={s.subscribeButtonText}>Subscribe</Text>
        </Pressable>

        <Text style={s.priceHint}>Coming soon</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 100,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
  },

  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },

  usageRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  usageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  usageDotUsed: {
    backgroundColor: colors.primary,
  },
  usageText: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 20,
  },

  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },

  features: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },

  subscribeButton: {
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  subscribeButtonPressed: {
    opacity: 0.85,
  },
  subscribeButtonText: {
    color: '#04110D',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  priceHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 10,
  },
});
