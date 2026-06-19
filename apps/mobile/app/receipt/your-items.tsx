import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

function parseCurrencyInput(value: string) {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function getItemQuantity(quantity: number) {
  return quantity > 0 ? quantity : 1;
}

function calculateClaimAmount(itemPrice: number, itemQuantity: number, portion: number) {
  return (itemPrice * portion) / getItemQuantity(itemQuantity);
}

type HostClaimDraft = {
  portion: number;
  amount: number;
};

export default function YourItemsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { pendingReceipt, setPendingReceipt } = usePendingReceipt();
  const [hostClaims, setHostClaims] = useState<Record<number, HostClaimDraft>>({});
  const [isSharing, setIsSharing] = useState(false);
  const [showShareSuccess, setShowShareSuccess] = useState(false);
  const [sharedReceiptId, setSharedReceiptId] = useState<string | null>(null);
  const [hasPaymentMethods, setHasPaymentMethods] = useState<boolean | null>(null);
  const [coverEditorIndex, setCoverEditorIndex] = useState<number | null>(null);
  const [customCoverInput, setCustomCoverInput] = useState('');
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
      Object.values(hostClaims).reduce((total, claim) => total + claim.amount, 0),
    [hostClaims]
  );

  const toggleItem = useCallback((index: number) => {
    setHostClaims((current) => {
      const item = items[index];
      if (!item) return current;

      const next = { ...current };
      if (next[index]) {
        delete next[index];
      } else {
        const portion = Math.min(1, getItemQuantity(item.quantity));
        next[index] = {
          portion,
          amount: calculateClaimAmount(item.price, item.quantity, portion),
        };
      }
      return next;
    });
  }, [items]);

  const adjustClaimPortion = useCallback((index: number, delta: number) => {
    setHostClaims((current) => {
      const item = items[index];
      const currentClaim = current[index];
      if (!item || !currentClaim) return current;

      const maxPortion = getItemQuantity(item.quantity);
      const nextPortion = Math.min(Math.max(0, currentClaim.portion + delta), maxPortion);
      const next = { ...current };
      if (nextPortion <= 0) {
        delete next[index];
      } else {
        next[index] = {
          portion: nextPortion,
          amount: calculateClaimAmount(item.price, item.quantity, nextPortion),
        };
      }
      return next;
    });
  }, [items]);

  const updateClaimAmount = useCallback((index: number, amount: number) => {
    setHostClaims((current) => {
      const item = items[index];
      const claim = current[index];
      if (!item || !claim) return current;

      const maxAmount = calculateClaimAmount(item.price, item.quantity, claim.portion);
      const nextAmount = Math.min(Math.max(0.01, amount), maxAmount);
      return {
        ...current,
        [index]: {
          ...claim,
          amount: nextAmount,
        },
      };
    });
  }, [items]);

  const openCoverEditor = useCallback((index: number) => {
    const claim = hostClaims[index];
    if (!claim) return;
    setCoverEditorIndex(index);
    setCustomCoverInput(claim.amount.toFixed(2));
  }, [hostClaims]);

  const applyCustomCoverAmount = useCallback(() => {
    if (coverEditorIndex === null) return;

    const parsedAmount = parseCurrencyInput(customCoverInput);
    if (parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Enter an amount greater than $0.00.');
      return;
    }

    updateClaimAmount(coverEditorIndex, parsedAmount);
    setCoverEditorIndex(null);
  }, [coverEditorIndex, customCoverInput, updateClaimAmount]);

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
      if (Object.keys(hostClaims).length === 0) return { success: true };

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
        .map((item) => {
          const claim = hostClaims[item.position ?? -1];
          if (!claim) return null;
          return {
            item_id: item.id,
            participant_id: ownerParticipant.id,
            portion: claim.portion,
            amount_cents: Math.round(claim.amount * 100),
            status: 'paid' as const,
            paid_at: paidAt,
            confirmation_method: 'host',
          };
        })
        .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim));

      if (claims.length === 0) return { success: true };

      const { error: claimsError } = await supabase.from('item_claims').insert(claims);

      if (claimsError) {
        return { success: false, error: claimsError.message };
      }

      return { success: true };
    },
    [hostClaims]
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
              const claim = hostClaims[index];
              const isSelected = Boolean(claim);
              const itemQuantity = getItemQuantity(item.quantity);
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
                    <Text style={s.itemMeta}>Qty {formatQuantity(itemQuantity)}</Text>
                  </View>
                  <View style={s.itemTrailing}>
                    <View style={s.priceLine}>
                      {isSelected && itemQuantity > 1 ? (
                        <View style={s.quantityStepper}>
                          <Pressable
                            onPress={(event) => {
                              event.stopPropagation();
                              adjustClaimPortion(index, -1);
                            }}
                            style={({ pressed }) => [s.quantityButton, pressed && s.pressed]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={s.quantityButtonText}>-</Text>
                          </Pressable>
                          <Text style={s.quantityValue}>
                            {formatQuantity(claim.portion)}/{formatQuantity(itemQuantity)}
                          </Text>
                          <Pressable
                            onPress={(event) => {
                              event.stopPropagation();
                              adjustClaimPortion(index, 1);
                            }}
                            style={({ pressed }) => [
                              s.quantityButton,
                              claim.portion >= itemQuantity && s.quantityButtonDisabled,
                              pressed && s.pressed,
                            ]}
                            disabled={claim.portion >= itemQuantity}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={s.quantityButtonText}>+</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      <Text style={s.itemPrice}>{formatCurrency(item.price)}</Text>
                    </View>
                    {isSelected ? (
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          openCoverEditor(index);
                        }}
                        style={({ pressed }) => [s.coveringLine, pressed && s.pressed]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={s.coveringText}>You&apos;re covering {formatCurrency(claim.amount)}</Text>
                        <Ionicons name="pencil" size={12} color="#FBBF24" />
                      </Pressable>
                    ) : null}
                  </View>
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

      <Modal
        visible={coverEditorIndex !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setCoverEditorIndex(null)}
      >
        <Pressable style={s.successModalBackdrop} onPress={() => setCoverEditorIndex(null)}>
          <Pressable style={s.coverModalContent} onPress={(event) => event.stopPropagation()}>
            {(() => {
              const item = coverEditorIndex !== null ? items[coverEditorIndex] : undefined;
              const claim = coverEditorIndex !== null ? hostClaims[coverEditorIndex] : undefined;
              if (!item || !claim || coverEditorIndex === null) return null;

              const selectedValue = calculateClaimAmount(item.price, item.quantity, claim.portion);
              const options = [
                { label: '1/3', amount: selectedValue / 3 },
                { label: 'Half', amount: selectedValue / 2 },
                { label: 'Full', amount: selectedValue },
              ];

              return (
                <>
                  <View style={s.coverModalHeader}>
                    <View>
                      <Text style={s.coverModalOverline}>Cover Amount</Text>
                      <Text style={s.coverModalTitle} numberOfLines={1}>{item.name || 'Untitled item'}</Text>
                    </View>
                    <Pressable
                      onPress={() => setCoverEditorIndex(null)}
                      style={({ pressed }) => [s.coverModalClose, pressed && s.pressed]}
                    >
                      <Ionicons name="close" size={22} color={colors.text} />
                    </Pressable>
                  </View>
                  <Text style={s.coverModalContext}>
                    Selected value {formatCurrency(selectedValue)}
                  </Text>
                  <View style={s.coverOptionGrid}>
                    {options.map(option => (
                      <Pressable
                        key={option.label}
                        style={({ pressed }) => [s.coverOptionButton, pressed && s.pressed]}
                        onPress={() => {
                          updateClaimAmount(coverEditorIndex, option.amount);
                          setCoverEditorIndex(null);
                        }}
                      >
                        <Text style={s.coverOptionLabel}>{option.label}</Text>
                        <Text style={s.coverOptionAmount}>{formatCurrency(option.amount)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.coverCustomRow}>
                    <TextInput
                      value={customCoverInput}
                      onChangeText={setCustomCoverInput}
                      keyboardType="decimal-pad"
                      placeholder="Custom"
                      placeholderTextColor={colors.muted}
                      style={s.coverCustomInput}
                    />
                    <Pressable style={s.coverApplyButton} onPress={applyCustomCoverAmount}>
                      <Text style={s.coverApplyText}>Apply</Text>
                    </Pressable>
                  </View>
                  <Text style={s.coverMaxText}>Max {formatCurrency(selectedValue)}</Text>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
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
    textAlign: 'right',
  },
  itemTrailing: {
    alignItems: 'flex-end',
    gap: 6,
    minWidth: 136,
    paddingVertical: 16,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  coveringLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    justifyContent: 'flex-end',
  },
  coveringText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  quantityStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  quantityButton: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  quantityButtonDisabled: {
    opacity: 0.35,
  },
  quantityButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  quantityValue: {
    minWidth: 32,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
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
  coverModalContent: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 14,
  },
  coverModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  coverModalOverline: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  coverModalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    maxWidth: 260,
  },
  coverModalClose: {
    padding: 2,
  },
  coverModalContext: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  coverOptionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  coverOptionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    alignItems: 'center',
    gap: 3,
  },
  coverOptionLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  coverOptionAmount: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  coverCustomRow: {
    flexDirection: 'row',
    gap: 10,
  },
  coverCustomInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    color: colors.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  coverApplyButton: {
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  coverApplyText: {
    color: '#04110D',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  coverMaxText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'right',
  },
});
