import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { usePendingReceipt } from '@/src/hooks/usePendingReceipt';
import { useAuth } from '@/src/hooks/useAuth';
import { getOrCreateShareLink, saveReceipt, updateReceipt } from '@/src/services/receiptService';
import { getSupabaseClient } from '@/src/lib/supabaseClient';
import { colors } from '@/src/theme';
import type { ParsedReceiptItem } from '@/src/types/receipt';

const TIP_PRESET_PERCENTS = [15, 18, 20] as const;

type EditableItem = {
  key: string;
  name: string;
  price: string;
  quantity: string;
};

function createItemKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toCurrencyString(value: number) {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

function parseCurrencyInput(value: string) {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function parseQuantityInput(value: string) {
  if (!value) return 1;
  const cleaned = value.replace(/[^0-9.,]/g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0.01, Number(parsed.toFixed(2)));
}

function parsePercentInput(value: string) {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.,]/g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.max(0, Number(parsed.toFixed(2))) : 0;
}

function formatPercentInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value % 1 === 0 ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function formatCurrency(amount: number) {
  if (Number.isNaN(amount)) return '\u2014';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'No date';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildEditableItems(items: ParsedReceiptItem[]): EditableItem[] {
  if (!items.length) {
    return [{ key: createItemKey(), name: '', price: '', quantity: '1' }];
  }
  return items.map((item) => ({
    key: createItemKey(),
    name: item.name,
    price: toCurrencyString(item.price),
    quantity: item.quantity.toString(),
  }));
}

export default function ReceiptReviewScreen() {
  const router = useRouter();
  const { pendingReceipt, setPendingReceipt } = usePendingReceipt();
  const { session } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [showShareSuccess, setShowShareSuccess] = useState(false);
  const [sharedReceiptId, setSharedReceiptId] = useState<string | null>(null);
  const [hasPaymentMethods, setHasPaymentMethods] = useState<boolean | null>(null);
  const isClosingRef = useRef(false);

  // Check if user has payment methods set up
  useEffect(() => {
    async function checkPaymentMethods() {
      if (!session?.user?.id) return;

      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('user_profiles')
        .select('venmo_handle, cashapp_handle, paypal_handle, zelle_identifier')
        .eq('user_id', session.user.id)
        .single();

      if (data) {
        const hasAny = !!(
          data.venmo_handle ||
          data.cashapp_handle ||
          data.paypal_handle ||
          data.zelle_identifier
        );
        setHasPaymentMethods(hasAny);
      } else {
        setHasPaymentMethods(false);
      }
    }

    checkPaymentMethods();
  }, [session?.user?.id]);

  const TABLINK_BASE_URL = process.env.EXPO_PUBLIC_TABLINK_URL || 'http://localhost:3000';

  useEffect(() => {
    if (!pendingReceipt && !isClosingRef.current) {
      router.replace('/(host)/home');
    }
  }, [pendingReceipt, router]);

  const parsed = pendingReceipt?.parsed;
  const imageUri = pendingReceipt?.localUri || pendingReceipt?.publicUrl || '';

  // Editable state
  const [merchantName, setMerchantName] = useState(parsed?.merchantName ?? '');
  const [taxInput, setTaxInput] = useState(toCurrencyString(parsed?.totals.tax ?? 0));
  const [tipInput, setTipInput] = useState(toCurrencyString(parsed?.totals.tip ?? 0));
  const [customTipPercentInput, setCustomTipPercentInput] = useState('');
  const [editableItems, setEditableItems] = useState<EditableItem[]>(() =>
    buildEditableItems(parsed?.items ?? [])
  );

  // Computed values (price is already the line total, not unit price)
  const subtotal = useMemo(() => {
    return editableItems.reduce((total, item) => {
      const price = parseCurrencyInput(item.price);
      return total + price;
    }, 0);
  }, [editableItems]);

  const taxAmount = useMemo(() => parseCurrencyInput(taxInput), [taxInput]);
  const tipAmount = useMemo(() => parseCurrencyInput(tipInput), [tipInput]);
  const grandTotal = useMemo(() => subtotal + taxAmount + tipAmount, [subtotal, taxAmount, tipAmount]);
  const currentTipPercent = useMemo(() => {
    if (subtotal <= 0 || tipAmount <= 0) return 0;
    return Number(((tipAmount / subtotal) * 100).toFixed(2));
  }, [subtotal, tipAmount]);
  const activeTipPreset = useMemo(
    () => TIP_PRESET_PERCENTS.find((percent) => Math.abs(currentTipPercent - percent) < 0.01) ?? null,
    [currentTipPercent]
  );

  useEffect(() => {
    if (subtotal <= 0 || tipAmount <= 0 || activeTipPreset) {
      setCustomTipPercentInput('');
      return;
    }

    setCustomTipPercentInput(formatPercentInput(currentTipPercent));
  }, [activeTipPreset, currentTipPercent, subtotal, tipAmount]);

  const applyTipPercent = useCallback((percent: number) => {
    const safePercent = Math.max(0, Number(percent.toFixed(2)));
    setCustomTipPercentInput(
      TIP_PRESET_PERCENTS.includes(safePercent as (typeof TIP_PRESET_PERCENTS)[number])
        ? ''
        : formatPercentInput(safePercent)
    );
    setTipInput(toCurrencyString(subtotal * (safePercent / 100)));
  }, [subtotal]);

  const handleCustomTipPercentChange = useCallback((value: string) => {
    setCustomTipPercentInput(value);
    setTipInput(toCurrencyString(subtotal * (parsePercentInput(value) / 100)));
  }, [subtotal]);

  const updateItemField = useCallback((key: string, field: keyof EditableItem, value: string) => {
    setEditableItems((current) =>
      current.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setEditableItems((current) => {
      const next = current.filter((item) => item.key !== key);
      return next.length ? next : [{ key: createItemKey(), name: '', price: '', quantity: '1' }];
    });
  }, []);

  const addItem = useCallback(() => {
    setEditableItems((current) => [
      { key: createItemKey(), name: '', price: '', quantity: '1' },
      ...current,
    ]);
  }, []);

  const buildUpdatedParsed = useCallback(() => {
    if (!parsed) return null;

    const items = editableItems.map((item) => ({
      name: item.name.trim() || 'Untitled item',
      price: parseCurrencyInput(item.price),
      quantity: parseQuantityInput(item.quantity),
    }));

    return {
      ...parsed,
      merchantName: merchantName.trim() || null,
      items,
      totals: {
        ...parsed.totals,
        subtotal,
        tax: taxAmount,
        tip: tipAmount,
        total: grandTotal,
        itemsTotal: subtotal,
      },
    };
  }, [parsed, editableItems, merchantName, subtotal, taxAmount, tipAmount, grandTotal]);

  const closeReviewFlow = useCallback(
    (onComplete?: () => void) => {
      isClosingRef.current = true;
      setPendingReceipt(null);
      router.dismiss(2);

      if (onComplete) {
        setTimeout(onComplete, 50);
      }
    },
    [router, setPendingReceipt]
  );

  const handleSaveDraft = useCallback(async () => {
    if (!pendingReceipt || !session?.user?.id) {
      Alert.alert('Error', 'You must be signed in to save a receipt.');
      return;
    }

    setIsSaving(true);
    try {
      const updatedParsed = buildUpdatedParsed();
      if (!updatedParsed) return;

      const updatedReceipt = { ...pendingReceipt, parsed: updatedParsed };
      const result = await saveReceipt(updatedReceipt, session.user.id);

      if (!result.success) {
        Alert.alert('Error', result.error);
        return;
      }

      closeReviewFlow();
    } catch (error) {
      console.error('[review] Failed to save draft:', error);
      Alert.alert('Error', 'Failed to save receipt. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [buildUpdatedParsed, closeReviewFlow, pendingReceipt, session]);

  const handleShareReceipt = useCallback(async () => {
    if (!pendingReceipt || !session?.user?.id) {
      Alert.alert('Error', 'You must be signed in to share a receipt.');
      return;
    }

    // Check if user has payment methods set up
    if (!hasPaymentMethods) {
      Alert.alert(
        'Set Up Payment Methods',
        'Before sharing a receipt, add your payment info (Venmo, CashApp, etc.) so guests can pay you.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Settings',
            onPress: async () => {
              // Auto-save receipt as draft before navigating to settings
              try {
                const updatedParsed = buildUpdatedParsed();
                if (updatedParsed) {
                  const updatedReceipt = { ...pendingReceipt, parsed: updatedParsed };
                  const result = await saveReceipt(updatedReceipt, session.user.id);
                  if (result.success) {
                    closeReviewFlow(() => {
                      Alert.alert(
                        'Receipt Saved',
                        'Your receipt has been saved as a draft. You can find it on the home screen after setting up your payment info.',
                        [{ text: 'OK', onPress: () => router.push('/(host)/settings') }]
                      );
                    });
                    return;
                  }
                }
              } catch (err) {
                console.error('[review] Failed to auto-save receipt:', err);
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
      const updatedParsed = buildUpdatedParsed();
      if (!updatedParsed) return;

      // Save the receipt first
      const updatedReceipt = { ...pendingReceipt, parsed: updatedParsed };
      const result = await saveReceipt(updatedReceipt, session.user.id);

      if (!result.success) {
        Alert.alert('Error', result.error);
        return;
      }

      // Update status to shared
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

      // Generate and share the tablink
      const tablinkUrl = `${TABLINK_BASE_URL}/claim/${linkResult.shortCode}`;
      const merchantDisplay = updatedParsed.merchantName ? ` (${updatedParsed.merchantName})` : '';

      await Share.share({
        message: `Split the bill with me!${merchantDisplay}\n${tablinkUrl}`,
        url: tablinkUrl,
        title: 'Share Tablink',
      });

      // Store the receipt ID and show success modal
      setSharedReceiptId(result.receiptId);
      setShowShareSuccess(true);
    } catch (error) {
      console.error('[review] Failed to share receipt:', error);
      Alert.alert('Error', 'Failed to share receipt. Please try again.');
    } finally {
      setIsSharing(false);
    }
  }, [buildUpdatedParsed, closeReviewFlow, pendingReceipt, session, TABLINK_BASE_URL, hasPaymentMethods, router]);

  const handleViewReceipt = useCallback(() => {
    setShowShareSuccess(false);
    if (sharedReceiptId) {
      closeReviewFlow(() => {
        router.push({
          pathname: '/receipt/[id]',
          params: { id: sharedReceiptId },
        });
      });
    }
  }, [closeReviewFlow, router, sharedReceiptId]);

  const handleGoHome = useCallback(() => {
    setShowShareSuccess(false);
    closeReviewFlow();
  }, [closeReviewFlow]);

  const handleDiscard = useCallback(() => {
    Alert.alert(
      'Discard Receipt',
      'Are you sure you want to discard this receipt?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            closeReviewFlow();
          },
        },
      ]
    );
  }, [closeReviewFlow]);

  const placeholderColor = colors.muted;

  if (!pendingReceipt || !parsed) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(400)} style={s.header}>
          <Pressable onPress={handleDiscard} style={s.backArrow}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <View style={s.headerContent}>
            <Text style={s.title} numberOfLines={1}>
              {merchantName || 'New Receipt'}
            </Text>
            <Text style={s.subtitle}>{formatDate(parsed.purchaseDate)}</Text>
          </View>
          <Text style={[s.statusLabel, { color: colors.primary }]}>NEW</Text>
        </Animated.View>

        {/* Receipt Image */}
        {imageUri ? (
          <Animated.View entering={FadeInDown.delay(50).duration(400)} style={s.imageCard}>
            <Image source={{ uri: imageUri }} style={s.receiptImage} resizeMode="cover" />
            <Pressable
              style={({ pressed }) => [s.expandButton, pressed && s.pressed]}
              onPress={() => setIsImageExpanded(true)}
            >
              <Text style={s.expandButtonText}>View full receipt</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Merchant */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={s.section}>
          <Text style={s.sectionLabel}>MERCHANT</Text>
          <TextInput
            value={merchantName}
            onChangeText={setMerchantName}
            placeholder="Add merchant name"
            placeholderTextColor={placeholderColor}
            style={s.textInput}
          />
        </Animated.View>

        {/* Items */}
        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={s.section}>
          <View style={s.cardHeader}>
            <Text style={s.sectionLabel}>ITEMS</Text>
            <Pressable onPress={addItem}>
              <Text style={s.addButtonText}>+ Add item</Text>
            </Pressable>
          </View>
          {editableItems.map((item) => (
            <Animated.View
              key={item.key}
              style={s.itemWrapper}
              exiting={FadeOut.duration(200)}
              layout={LinearTransition.duration(200)}
            >
              <View style={s.swipeDeleteBehind} />
              <Swipeable
                overshootRight={false}
                rightThreshold={60}
                friction={2}
                onSwipeableWillOpen={() => {
                  Keyboard.dismiss();
                }}
                onSwipeableOpen={(direction) => {
                  if (direction === 'right') {
                    removeItem(item.key);
                  }
                }}
                renderRightActions={() => (
                  <View style={s.swipeDeleteButton}>
                    <Ionicons name="trash" size={22} color="#fff" />
                  </View>
                )}
              >
                <View style={s.itemRow}>
                  <View style={s.itemMainContent}>
                    <View style={s.itemNameRow}>
                      <TextInput
                        value={item.name}
                        onChangeText={(value) => updateItemField(item.key, 'name', value)}
                        placeholder="Item name"
                        placeholderTextColor={placeholderColor}
                        style={s.itemNameInput}
                      />
                      <View style={s.itemQtyGroup}>
                        <Text style={s.itemQtyPrefix}>×</Text>
                        <TextInput
                          value={item.quantity}
                          onChangeText={(value) => updateItemField(item.key, 'quantity', value)}
                          placeholder="1"
                          placeholderTextColor={placeholderColor}
                          keyboardType="decimal-pad"
                          style={s.itemQtyInput}
                        />
                      </View>
                    </View>
                  </View>
                  <TextInput
                    value={item.price}
                    onChangeText={(value) => updateItemField(item.key, 'price', value)}
                    placeholder="0.00"
                    placeholderTextColor={placeholderColor}
                    keyboardType="decimal-pad"
                    style={s.itemPriceInput}
                  />
                </View>
              </Swipeable>
            </Animated.View>
          ))}
          <Text style={s.hint}>Swipe left to delete an item.</Text>
        </Animated.View>

        {/* Totals */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={s.section}>
          <Text style={s.sectionLabel}>TOTALS</Text>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Items subtotal</Text>
            <Text style={s.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Tax</Text>
            <TextInput
              value={taxInput}
              onChangeText={setTaxInput}
              placeholder="0.00"
              placeholderTextColor={placeholderColor}
              keyboardType="decimal-pad"
              style={[s.textInput, s.summaryInput]}
            />
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Tip</Text>
            <TextInput
              value={tipInput}
              onChangeText={setTipInput}
              placeholder="0.00"
              placeholderTextColor={placeholderColor}
              keyboardType="decimal-pad"
              style={[s.textInput, s.summaryInput]}
            />
          </View>
          <View style={s.tipControls}>
            <View style={s.tipPresetRow}>
              {TIP_PRESET_PERCENTS.map((percent) => {
                const isActive = activeTipPreset === percent;
                return (
                  <Pressable
                    key={percent}
                    onPress={() => applyTipPercent(percent)}
                    style={({ pressed }) => [
                      s.tipPresetButton,
                      isActive && s.tipPresetButtonActive,
                      pressed && s.pressed,
                    ]}
                  >
                    <Text style={[s.tipPresetText, isActive && s.tipPresetTextActive]}>{percent}%</Text>
                  </Pressable>
                );
              })}
              <View style={s.tipCustomButton}>
                <Text style={s.tipPresetText}>Custom</Text>
                <TextInput
                  value={customTipPercentInput}
                  onChangeText={handleCustomTipPercentChange}
                  placeholder="0"
                  placeholderTextColor={placeholderColor}
                  keyboardType="decimal-pad"
                  style={s.tipPercentInput}
                />
                <Text style={s.tipPresetText}>%</Text>
              </View>
            </View>
          </View>
          <View style={[s.summaryRow, s.totalRow]}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{formatCurrency(grandTotal)}</Text>
          </View>
        </Animated.View>

        {/* Actions */}
        <Animated.View entering={FadeInDown.delay(250).duration(400)} style={s.actions}>
          <Pressable
            style={({ pressed }) => [
              s.shareButton,
              isSharing && s.buttonDisabled,
              pressed && s.pressed,
            ]}
            onPress={handleShareReceipt}
            disabled={isSharing || isSaving}
          >
            <Ionicons name="share-outline" size={16} color="#04110D" />
            <Text style={s.shareButtonText}>
              {isSharing ? 'Sharing...' : 'Share Receipt'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#04110D" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              s.saveDraftButton,
              isSaving && s.buttonDisabled,
              pressed && s.pressed,
            ]}
            onPress={handleSaveDraft}
            disabled={isSaving || isSharing}
          >
            <Text style={s.saveDraftButtonText}>
              {isSaving ? 'Saving...' : 'Save as Draft'}
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* Full Image Modal */}
      <Modal
        visible={isImageExpanded}
        animationType="fade"
        transparent
        onRequestClose={() => setIsImageExpanded(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalContent}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                resizeMode="contain"
                style={s.modalImage}
              />
            ) : null}
            <Pressable
              style={({ pressed }) => [s.modalCloseButton, pressed && s.pressed]}
              onPress={() => setIsImageExpanded(false)}
            >
              <Text style={s.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Share Success Modal */}
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
              Your tablink has been created. View your receipt to see claims update in real-time as friends claim their items.
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
                style={({ pressed }) => [s.saveDraftButton, pressed && s.pressed]}
                onPress={handleGoHome}
              >
                <Text style={s.saveDraftButtonText}>Go Home</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 120,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  backArrow: {
    padding: 4,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  /* Image */
  imageCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 4,
  },
  receiptImage: {
    width: '100%',
    height: 200,
    backgroundColor: colors.surfaceBorder,
  },
  expandButton: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(8, 10, 12, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  expandButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },

  /* Sections */
  section: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },

  /* Inputs */
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    color: colors.text,
    fontSize: 15,
  },

  /* Items */
  hint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  itemWrapper: {
    position: 'relative',
  },
  swipeDeleteBehind: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 80,
    backgroundColor: colors.danger,
  },
  swipeDeleteButton: {
    width: 80,
    height: '100%',
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  itemMainContent: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemNameInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 4,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  itemQtyGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  itemQtyInput: {
    color: colors.text,
    fontSize: 13,
    width: 28,
    textAlign: 'left',
    paddingVertical: 4,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  itemQtyPrefix: {
    color: colors.muted,
    fontSize: 13,
  },
  itemPriceInput: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    width: 70,
    textAlign: 'right',
    paddingVertical: 4,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },

  /* Totals */
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  summaryInput: {
    width: 120,
    textAlign: 'right',
    paddingRight: 12,
    fontVariant: ['tabular-nums'],
  },
  tipControls: {
    marginTop: 10,
    gap: 10,
  },
  tipPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tipPresetButton: {
    minWidth: 54,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipPresetButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tipPresetText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tipPresetTextActive: {
    color: '#0B0F14',
  },
  tipCustomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 104,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: colors.surface,
  },
  tipPercentInput: {
    minWidth: 24,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontVariant: ['tabular-nums'],
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  totalLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  totalValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  /* Actions */
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
  saveDraftButton: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  saveDraftButtonText: {
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
    opacity: 0.7,
  },

  /* Image modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    gap: 16,
  },
  modalImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: colors.surfaceBorder,
  },
  modalCloseButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  modalCloseText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  /* Share success modal */
  successModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  successMessage: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  successActions: {
    width: '100%',
    gap: 10,
  },
});
