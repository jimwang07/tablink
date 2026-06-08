import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/hooks/useAuth';
import { usePendingReceipt } from '@/src/hooks/usePendingReceipt';
import { getOrCreateShareLink, saveReceipt, updateReceipt } from '@/src/services/receiptService';
import { getSupabaseClient } from '@/src/lib/supabaseClient';
import { shareTablink } from '@/src/lib/shareTablink';
import { colors } from '@/src/theme';

function formatCurrency(amount: number) {
  if (Number.isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function YourItemsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { pendingReceipt, setPendingReceipt } = usePendingReceipt();
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(() => new Set());
  const [isSharing, setIsSharing] = useState(false);
  const [showShareSuccess, setShowShareSuccess] = useState(false);
  const [sharedReceiptId, setSharedReceiptId] = useState<string | null>(null);
  const [hasPaymentMethods, setHasPaymentMethods] = useState<boolean | null>(null);
  const isClosingRef = useRef(false);

  const TABLINK_BASE_URL = process.env.EXPO_PUBLIC_TABLINK_URL;
  const parsed = pendingReceipt?.parsed;
  const items = useMemo(() => parsed?.items ?? [], [parsed?.items]);

  useEffect(() => {
    if (!pendingReceipt && !isClosingRef.current) {
      router.replace('/(host)/home');
    }
  }, [pendingReceipt, router]);

  useEffect(() => {
    async function checkPaymentMethods() {
      if (!session?.user?.id) return;

      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('user_profiles')
        .select('venmo_handle, cashapp_handle, paypal_handle')
        .eq('user_id', session.user.id)
        .single();

      setHasPaymentMethods(
        Boolean(data?.venmo_handle || data?.cashapp_handle || data?.paypal_handle)
      );
    }

    checkPaymentMethods();
  }, [session?.user?.id]);

  const selectedTotal = useMemo(
    () =>
      items.reduce((total, item, index) => {
        return selectedIndexes.has(index) ? total + item.price : total;
      }, 0),
    [items, selectedIndexes]
  );

  const toggleItem = useCallback((index: number) => {
    setSelectedIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const closeFlow = useCallback(
    (onComplete?: () => void) => {
      isClosingRef.current = true;
      setPendingReceipt(null);
      router.dismiss(3);

      if (onComplete) {
        setTimeout(onComplete, 50);
      }
    },
    [router, setPendingReceipt]
  );

  const claimHostItems = useCallback(
    async (receiptId: string) => {
      if (selectedIndexes.size === 0) return { success: true };

      const supabase = getSupabaseClient();
      const { data: ownerParticipant, error: participantError } = await supabase
        .from('receipt_participants')
        .select('id')
        .eq('receipt_id', receiptId)
        .eq('role', 'owner')
        .single();

      if (participantError || !ownerParticipant) {
        return {
          success: false,
          error: participantError?.message ?? 'Could not find the host participant.',
        };
      }

      const { data: savedItems, error: itemsError } = await supabase
        .from('receipt_items')
        .select('id, price_cents, position')
        .eq('receipt_id', receiptId)
        .order('position', { ascending: true });

      if (itemsError) {
        return { success: false, error: itemsError.message };
      }

      const paidAt = new Date().toISOString();
      const claims = (savedItems ?? [])
        .filter((item) => selectedIndexes.has(item.position ?? -1))
        .map((item) => ({
          item_id: item.id,
          participant_id: ownerParticipant.id,
          portion: 1,
          amount_cents: item.price_cents,
          status: 'paid' as const,
          paid_at: paidAt,
          confirmation_method: 'host',
        }));

      if (claims.length === 0) return { success: true };

      const { error: claimsError } = await supabase.from('item_claims').insert(claims);

      if (claimsError) {
        return { success: false, error: claimsError.message };
      }

      return { success: true };
    },
    [selectedIndexes]
  );

  const handleShareReceipt = useCallback(async () => {
    if (!pendingReceipt || !session?.user?.id || !parsed) {
      Alert.alert('Error', 'You must be signed in to share a receipt.');
      return;
    }

    if (hasPaymentMethods === false) {
      Alert.alert(
        'Set Up Payment Methods',
        'Before sharing a receipt, add your payment info so guests can pay you.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Settings',
            onPress: async () => {
              try {
                const result = await saveReceipt(pendingReceipt, session.user.id);
                if (result.success) {
                  closeFlow(() => {
                    Alert.alert(
                      'Receipt Saved',
                      'Your receipt has been saved as a draft. You can find it on the home screen after setting up your payment info.',
                      [{ text: 'OK', onPress: () => router.push('/(host)/settings') }]
                    );
                  });
                  return;
                }
              } catch (err) {
                console.error('[your-items] Failed to auto-save receipt:', err);
              }
              router.push('/(host)/settings');
            },
          },
        ]
      );
      return;
    }

    setIsSharing(true);
    try {
      if (!TABLINK_BASE_URL) {
        Alert.alert('Configuration Error', 'Missing Tablink share URL configuration.');
        return;
      }

      const result = await saveReceipt(pendingReceipt, session.user.id);

      if (!result.success) {
        Alert.alert('Error', result.error);
        return;
      }

      const claimResult = await claimHostItems(result.receiptId);
      if (!claimResult.success) {
        Alert.alert('Error', claimResult.error || 'Failed to mark your items as paid');
        return;
      }

      const updateResult = await updateReceipt(result.receiptId, { status: 'shared' });
      if (!updateResult.success) {
        Alert.alert('Error', updateResult.error || 'Failed to share receipt');
        return;
      }

      const linkResult = await getOrCreateShareLink(result.receiptId);
      if (!linkResult.success) {
        Alert.alert('Error', linkResult.error || 'Failed to generate share link');
        return;
      }

      const tablinkUrl = `${TABLINK_BASE_URL}/claim/${linkResult.shortCode}`;
      await shareTablink({ tablinkUrl, merchantName: parsed.merchantName });

      setSharedReceiptId(result.receiptId);
      setShowShareSuccess(true);
    } catch (error) {
      console.error('[your-items] Failed to share receipt:', error);
      Alert.alert('Error', 'Failed to share receipt. Please try again.');
    } finally {
      setIsSharing(false);
    }
  }, [
    TABLINK_BASE_URL,
    claimHostItems,
    closeFlow,
    hasPaymentMethods,
    parsed,
    pendingReceipt,
    router,
    session?.user?.id,
  ]);

  const handleViewReceipt = useCallback(() => {
    setShowShareSuccess(false);
    if (sharedReceiptId) {
      closeFlow(() => {
        router.push({
          pathname: '/receipt/[id]',
          params: { id: sharedReceiptId },
        });
      });
    }
  }, [closeFlow, router, sharedReceiptId]);

  const handleGoHome = useCallback(() => {
    setShowShareSuccess(false);
    closeFlow();
  }, [closeFlow]);

  if (!pendingReceipt || !parsed) {
    return null;
  }

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400)} style={s.section}>
          <View style={s.summary}>
            <View style={s.promptRow}>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [s.backButton, pressed && s.pressed]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
              </Pressable>
              <Text style={s.summaryTitle}>Pick the items that you ordered</Text>
            </View>
            <Text style={s.summaryDescription}>
              The remaining items will be split among your guests.
            </Text>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Selected</Text>
              <Text style={s.totalValue}>{formatCurrency(selectedTotal)}</Text>
            </View>
          </View>

          <View style={s.itemList}>
            {items.map((item, index) => {
              const isSelected = selectedIndexes.has(index);
              return (
                <Pressable
                  key={`${item.name}-${index}`}
                  style={({ pressed }) => [
                    s.itemRow,
                    isSelected && s.itemRowSelected,
                    pressed && s.pressed,
                  ]}
                  onPress={() => toggleItem(index)}
                >
                  <View style={[s.itemCheck, isSelected && s.itemCheckSelected]}>
                    {isSelected ? <Ionicons name="checkmark" size={15} color="#04110D" /> : null}
                  </View>
                  <View style={s.itemContent}>
                    <Text style={s.itemName} numberOfLines={1}>
                      {item.name || 'Untitled item'}
                    </Text>
                    <Text style={s.itemMeta}>Qty {item.quantity}</Text>
                  </View>
                  <Text style={s.itemPrice}>{formatCurrency(item.price)}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(50).duration(400)} style={s.actions}>
          <Pressable
            style={({ pressed }) => [
              s.shareButton,
              (isSharing || hasPaymentMethods === null) && s.buttonDisabled,
              pressed && s.pressed,
            ]}
            onPress={handleShareReceipt}
            disabled={isSharing || hasPaymentMethods === null}
          >
            <Ionicons name="share-outline" size={16} color="#04110D" />
            <Text style={s.shareButtonText}>
              {hasPaymentMethods === null ? 'Checking...' : isSharing ? 'Sharing...' : 'Share Tablink'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#04110D" />
          </Pressable>
        </Animated.View>
      </ScrollView>

      <Modal
        visible={showShareSuccess}
        animationType="fade"
        transparent
        onRequestClose={handleGoHome}
      >
        <View style={s.successModalBackdrop}>
          <View style={s.successModalContent}>
            <View style={s.successIconContainer}>
              <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
            </View>
            <Text style={s.successTitle}>Receipt Shared!</Text>
            <Text style={s.successMessage}>
              Your tablink has been created. View your receipt to see claims update in real-time.
            </Text>
            <View style={s.successActions}>
              <Pressable
                style={({ pressed }) => [s.shareButton, pressed && s.pressed]}
                onPress={handleViewReceipt}
              >
                <Ionicons name="receipt-outline" size={16} color="#04110D" />
                <Text style={s.shareButtonText}>View Receipt</Text>
                <Ionicons name="arrow-forward" size={16} color="#04110D" />
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.secondaryButton, pressed && s.pressed]}
                onPress={handleGoHome}
              >
                <Text style={s.secondaryButtonText}>Go Home</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 120,
  },
  backButton: {
    padding: 4,
    flexShrink: 0,
  },
  section: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  summary: {
    gap: 8,
    marginBottom: 6,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
  },
  summaryDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  totalLabel: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  totalValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  itemList: {
    gap: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.background,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    paddingHorizontal: 12,
  },
  itemRowSelected: {
    borderLeftColor: colors.primary,
    backgroundColor: '#131F20',
  },
  itemCheck: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  itemCheckSelected: {
    backgroundColor: colors.primary,
  },
  itemContent: {
    flex: 1,
    paddingVertical: 12,
  },
  itemName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  itemMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  itemPrice: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    width: 70,
    textAlign: 'right',
    paddingVertical: 16,
  },
  actions: {
    paddingVertical: 24,
    gap: 10,
  },
  shareButton: {
    backgroundColor: '#57E6AE',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(87, 230, 174, 0.55)',
    shadowColor: '#57E6AE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  shareButtonText: {
    color: '#04110D',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
  successModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successModalContent: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  successMessage: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  successActions: {
    width: '100%',
    gap: 10,
  },
});
