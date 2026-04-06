import { useCallback, useMemo, useState } from 'react';
import { Alert, View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { colors } from '@/src/theme';
import { useSubscription } from '@/src/providers/RevenueCatProvider';
import type { ScanUsage } from '@/src/services/scanLimitService';

type Props = {
  usage: ScanUsage;
  onDismiss: () => void;
};

export function ScanLimitPaywall({ usage, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const { offerings, restorePurchases } = useSubscription();
  const [selectedId, setSelectedId] = useState<string>('annual');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const monthly = offerings?.current?.monthly ?? null;
  const annual = offerings?.current?.annual ?? null;

  // Display prices: use RC data when available, otherwise show defaults
  const monthlyPrice = monthly?.product.priceString ?? '$4.99';
  const annualPrice = annual?.product.priceString ?? '$29.99';
  const annualPerMonth = annual?.product.pricePerMonthString ?? '$2.49';

  const savingsPercent = useMemo(() => {
    const monthlyVal = monthly?.product.price ?? 4.99;
    const annualVal = annual?.product.price ?? 29.99;
    const yearlyAtMonthlyRate = monthlyVal * 12;
    if (yearlyAtMonthlyRate <= 0) return null;
    const pct = Math.round(((yearlyAtMonthlyRate - annualVal) / yearlyAtMonthlyRate) * 100);
    return pct > 0 ? pct : null;
  }, [monthly, annual]);

  const selectedPackage: PurchasesPackage | null =
    selectedId === 'annual' ? (annual ?? monthly) : (monthly ?? annual);

  const handlePurchase = useCallback(async () => {
    if (!selectedPackage || isPurchasing) return;
    setIsPurchasing(true);
    try {
      await Purchases.purchasePackage(selectedPackage);
      onDismiss();
    } catch (err: any) {
      if (err?.userCancelled) return;
      console.error('[Paywall] purchase error:', err);
      Alert.alert('Purchase Failed', err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  }, [selectedPackage, isPurchasing, onDismiss]);

  const handleRestore = useCallback(async () => {
    setIsRestoring(true);
    try {
      await restorePurchases();
      onDismiss();
    } catch {
      Alert.alert('Restore Failed', 'No previous purchases found.');
    } finally {
      setIsRestoring(false);
    }
  }, [restorePurchases, onDismiss]);

  return (
    <View style={s.overlay}>
      <Animated.View
        entering={FadeIn.duration(250)}
        style={[s.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
      >
        {/* Close */}
        <Pressable style={s.closeButton} onPress={onDismiss} hitSlop={16}>
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>

        {/* Header */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)} style={s.header}>
          <View style={s.premiumBadge}>
            <Ionicons name="diamond-outline" size={14} color={colors.primary} />
            <Text style={s.premiumBadgeText}>PREMIUM</Text>
          </View>

          <Text style={s.title}>
            <Text style={s.titleBase}>Tab</Text>
            <Text style={s.titleAccent}>link</Text>
            <Text style={s.titleBase}> Premium</Text>
          </Text>

          <Text style={s.subtitle}>
            Unlimited scans. No monthly caps.{'\n'}Split every receipt, every time.
          </Text>
        </Animated.View>

        {/* Usage context */}
        <Animated.View entering={FadeInDown.delay(160).duration(500)} style={s.usageContext}>
          <View style={s.usageBarTrack}>
            <View
              style={[
                s.usageBarFill,
                { width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` },
              ]}
            />
          </View>
          <Text style={s.usageLabel}>
            {usage.used}/{usage.limit} free scans used this month
          </Text>
        </Animated.View>

        {/* Features */}
        <Animated.View entering={FadeInDown.delay(240).duration(500)} style={s.features}>
          {[
            { icon: 'infinite-outline' as const, text: 'Unlimited receipt scans' },
            { icon: 'flash-outline' as const, text: 'Priority OCR processing' },
            { icon: 'sparkles-outline' as const, text: 'Early access to new features' },
          ].map((f, i) => (
            <View key={i} style={s.featureRow}>
              <View style={s.featureIconWrap}>
                <Ionicons name={f.icon} size={16} color={colors.primary} />
              </View>
              <Text style={s.featureText}>{f.text}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Plan cards */}
        <Animated.View entering={FadeInDown.delay(320).duration(500)} style={s.plans}>
          <Pressable
            style={[
              s.planCard,
              selectedId === 'annual' && s.planCardSelected,
            ]}
            onPress={() => setSelectedId('annual')}
          >
            {savingsPercent && (
              <View style={s.saveBadge}>
                <Text style={s.saveBadgeText}>SAVE {savingsPercent}%</Text>
              </View>
            )}
            <View style={s.planRadioRow}>
              <View style={[s.planRadio, selectedId === 'annual' && s.planRadioSelected]}>
                {selectedId === 'annual' && <View style={s.planRadioDot} />}
              </View>
              <Text style={s.planPeriod}>Yearly</Text>
            </View>
            <Text style={s.planPrice}>{annualPrice}</Text>
            <Text style={s.planUnit}>/year</Text>
            <Text style={s.planMonthlyEquiv}>{annualPerMonth}/mo</Text>
          </Pressable>

          <Pressable
            style={[
              s.planCard,
              selectedId === 'monthly' && s.planCardSelected,
            ]}
            onPress={() => setSelectedId('monthly')}
          >
            <View style={s.planRadioRow}>
              <View style={[s.planRadio, selectedId === 'monthly' && s.planRadioSelected]}>
                {selectedId === 'monthly' && <View style={s.planRadioDot} />}
              </View>
              <Text style={s.planPeriod}>Monthly</Text>
            </View>
            <Text style={s.planPrice}>{monthlyPrice}</Text>
            <Text style={s.planUnit}>/month</Text>
          </Pressable>
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={FadeInUp.delay(400).duration(500)} style={s.ctaArea}>
          <Pressable
            style={({ pressed }) => [
              s.ctaButton,
              (isPurchasing || !selectedPackage) && s.ctaButtonDisabled,
              pressed && s.ctaButtonPressed,
            ]}
            onPress={handlePurchase}
            disabled={isPurchasing || !selectedPackage}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#080A0C" size="small" />
            ) : (
              <Text style={s.ctaText}>Subscribe Now</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.restoreButton, pressed && { opacity: 0.5 }]}
            onPress={handleRestore}
            disabled={isRestoring}
          >
            <Text style={s.restoreText}>
              {isRestoring ? 'Restoring...' : 'Restore Purchases'}
            </Text>
          </Pressable>

          <Text style={s.legal}>
            Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period.
          </Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────── */

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },

  /* Close */
  closeButton: {
    position: 'absolute',
    top: 58,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Header */
  header: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.15)',
    marginBottom: 20,
  },
  premiumBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  titleBase: {
    color: colors.text,
  },
  titleAccent: {
    color: colors.primary,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },

  /* Usage */
  usageContext: {
    marginBottom: 24,
    gap: 8,
  },
  usageBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.danger,
  },
  usageLabel: {
    color: colors.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },

  /* Features */
  features: {
    gap: 14,
    marginBottom: 28,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },

  /* Plans */
  plans: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  planCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(52, 211, 153, 0.04)',
  },
  saveBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
  },
  saveBadgeText: {
    color: '#080A0C',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  planPeriod: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  planPrice: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  planUnit: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  planMonthlyEquiv: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  planRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  planRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioSelected: {
    borderColor: colors.primary,
  },
  planRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },

  /* CTA */
  ctaArea: {
    marginTop: 'auto',
    alignItems: 'center',
    gap: 12,
  },
  ctaButton: {
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaButtonPressed: {
    opacity: 0.9,
    shadowOpacity: 0.15,
  },
  ctaButtonDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    color: '#080A0C',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  restoreButton: {
    paddingVertical: 8,
  },
  restoreText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  legal: {
    color: 'rgba(90, 99, 113, 0.6)',
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
