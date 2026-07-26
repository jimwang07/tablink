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
import { colors } from '@/src/theme';
import type { ParsedReceiptAdjustment, ParsedReceiptItem } from '@/src/types/receipt';

const TIP_PRESET_PERCENTS = [15, 18, 20] as const;
const OTHER_FEES_LABEL = 'Other fees';

type EditableItem = {
  key: string;
  name: string;
  price: string;
  quantity: string;
};

type EditableAdjustment = {
  key: string;
  type: ParsedReceiptAdjustment['type'];
  label: string;
  amount: string;
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

function buildEditableAdjustments(adjustments: ParsedReceiptAdjustment[]): EditableAdjustment[] {
  const otherFeesTotal = getOtherFeesTotal(adjustments);
  if (otherFeesTotal <= 0) return [];

  return [{
    key: 'other-fees',
    type: 'fee',
    label: OTHER_FEES_LABEL,
    amount: toCurrencyString(otherFeesTotal),
  }];
}

function getDiscountTotal(adjustments: ParsedReceiptAdjustment[]): number {
  return adjustments
    .filter((adjustment) => adjustment.type === 'discount')
    .reduce((sum, adjustment) => sum + Math.abs(adjustment.amount), 0);
}

function getOtherFeesTotal(adjustments: ParsedReceiptAdjustment[]): number {
  return adjustments
    .filter((adjustment) => adjustment.type !== 'discount')
    .reduce((sum, adjustment) => sum + Math.abs(adjustment.amount), 0);
}

function buildStandardAdjustments(discountAmount: number, otherFeesAmount: number): ParsedReceiptAdjustment[] {
  const adjustments: ParsedReceiptAdjustment[] = [];

  if (discountAmount > 0) {
    adjustments.push({
      type: 'discount',
      label: 'Discounts',
      amount: discountAmount,
    });
  }

  if (otherFeesAmount > 0) {
    adjustments.push({
      type: 'fee',
      label: OTHER_FEES_LABEL,
      amount: otherFeesAmount,
    });
  }

  return adjustments;
}

export default function ReceiptReviewScreen() {
  const router = useRouter();
  const { pendingReceipt, setPendingReceipt } = usePendingReceipt();
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const isClosingRef = useRef(false);
  const titleInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!pendingReceipt && !isClosingRef.current) {
      router.replace('/(host)/home');
    }
  }, [pendingReceipt, router]);

  const parsed = pendingReceipt?.parsed;
  const imageUri = pendingReceipt?.localUri || pendingReceipt?.publicUrl || '';
  const uploadedAt = pendingReceipt?.uploadedAt ?? null;

  // Editable state
  const [merchantName, setMerchantName] = useState(parsed?.merchantName ?? '');
  const [taxInput, setTaxInput] = useState(toCurrencyString(parsed?.totals.tax ?? 0));
  const [tipInput, setTipInput] = useState(toCurrencyString(parsed?.totals.tip ?? 0));
  const [showExtraCharges, setShowExtraCharges] = useState(getDiscountTotal(parsed?.adjustments ?? []) > 0);
  const [customTipPercentInput, setCustomTipPercentInput] = useState('');
  const [editableItems, setEditableItems] = useState<EditableItem[]>(() =>
    buildEditableItems(parsed?.items ?? [])
  );
  const [discountInput, setDiscountInput] = useState(toCurrencyString(getDiscountTotal(parsed?.adjustments ?? [])));
  const [editableAdjustments, setEditableAdjustments] = useState<EditableAdjustment[]>(() =>
    buildEditableAdjustments(parsed?.adjustments ?? [])
  );

  // Computed values (price is already the line total, not unit price)
  const subtotal = useMemo(() => {
    return editableItems.reduce((total, item) => {
      const price = parseCurrencyInput(item.price);
      return total + price;
    }, 0);
  }, [editableItems]);

  const adjustmentsTotal = useMemo(() => {
    const otherAdjustmentsTotal = editableAdjustments.reduce((sum, adjustment) => {
      const amount = parseCurrencyInput(adjustment.amount);
      return sum + (adjustment.type === 'discount' ? -amount : amount);
    }, 0);
    return otherAdjustmentsTotal - parseCurrencyInput(discountInput);
  }, [discountInput, editableAdjustments]);
  const taxAmount = useMemo(() => parseCurrencyInput(taxInput), [taxInput]);
  const tipAmount = useMemo(() => parseCurrencyInput(tipInput), [tipInput]);
  const discountAmount = useMemo(() => parseCurrencyInput(discountInput), [discountInput]);
  const otherFeesAmount = useMemo(() => {
    return editableAdjustments.reduce((sum, adjustment) => sum + parseCurrencyInput(adjustment.amount), 0);
  }, [editableAdjustments]);
  const otherFeesInput = editableAdjustments[0]?.amount ?? '0.00';
  const grandTotal = useMemo(
    () => subtotal + adjustmentsTotal + taxAmount + tipAmount,
    [subtotal, adjustmentsTotal, taxAmount, tipAmount]
  );
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

  const updateOtherFeesAmount = useCallback((value: string) => {
    setEditableAdjustments([{
      key: 'other-fees',
      type: 'fee',
      label: OTHER_FEES_LABEL,
      amount: value,
    }]);
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
      adjustments: buildStandardAdjustments(discountAmount, otherFeesAmount),
      totals: {
        ...parsed.totals,
        subtotal,
        tax: taxAmount,
        tip: tipAmount,
        total: grandTotal,
        itemsTotal: subtotal,
      },
    };
  }, [parsed, editableItems, discountAmount, otherFeesAmount, merchantName, subtotal, taxAmount, tipAmount, grandTotal]);

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

  const handleConfirmReceipt = useCallback(() => {
    const updatedParsed = buildUpdatedParsed();
    if (!updatedParsed) return;
    if (updatedParsed.items.length === 0 || updatedParsed.items.every((item) => item.price <= 0)) {
      Alert.alert('Add Items', 'Add at least one receipt item before continuing.');
      return;
    }
    if (pendingReceipt) {
      setPendingReceipt({ ...pendingReceipt, parsed: updatedParsed });
    }
    Keyboard.dismiss();
    router.push('/receipt/your-items');
  }, [buildUpdatedParsed, pendingReceipt, router, setPendingReceipt]);

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
            <View style={s.titleEditRow}>
              <TextInput
                ref={titleInputRef}
                value={merchantName}
                onChangeText={setMerchantName}
                placeholder="New Receipt"
                placeholderTextColor={colors.textSecondary}
                style={s.titleInput}
                returnKeyType="done"
                selectTextOnFocus={merchantName.length === 0}
              />
              <Pressable
                onPress={() => titleInputRef.current?.focus()}
                style={({ pressed }) => [s.titleEditButton, pressed && s.pressed]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="pencil" size={14} color={colors.muted} />
              </Pressable>
            </View>
            <View style={s.headerMetaRow}>
              <Text style={s.subtitle}>{formatDate(uploadedAt)}</Text>
              <View style={s.statusPill}>
                <Text style={s.statusPillText}>NEW</Text>
              </View>
            </View>
          </View>
        </Animated.View>

            {/* Items */}
            <Animated.View entering={FadeInDown.delay(150).duration(400)} style={s.section}>
              <View style={s.cardHeader}>
                <Text style={s.sectionLabel}>ITEMS</Text>
                <Pressable onPress={addItem}>
                  <Text style={s.addButtonText}>+ Add item</Text>
                </Pressable>
              </View>
              <Text style={s.hint}>Tap to edit, swipe left to delete.</Text>
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
              {(showExtraCharges || discountAmount > 0 || editableAdjustments.length > 0) && (
                <>
                  <View style={s.summaryRow}>
                    <Text style={s.summaryLabel}>Discounts</Text>
                    <TextInput
                      value={discountInput}
                      onChangeText={setDiscountInput}
                      placeholder="0.00"
                      placeholderTextColor={placeholderColor}
                      keyboardType="decimal-pad"
                      style={[s.textInput, s.summaryInput]}
                    />
                  </View>
                  <View style={s.summaryRow}>
                    <Text style={s.summaryLabel}>{OTHER_FEES_LABEL}</Text>
                    <TextInput
                      value={otherFeesInput}
                      onChangeText={updateOtherFeesAmount}
                      placeholder="0.00"
                      placeholderTextColor={placeholderColor}
                      keyboardType="decimal-pad"
                      style={[s.textInput, s.summaryInput]}
                    />
                  </View>
                </>
              )}
              {!showExtraCharges && discountAmount <= 0 && editableAdjustments.length === 0 ? (
                <Pressable
                  style={({ pressed }) => [s.extraChargesButton, pressed && s.pressed]}
                  onPress={() => setShowExtraCharges(true)}
                >
                  <Text style={s.extraChargesButtonText}>+ Add discount or fee</Text>
                </Pressable>
              ) : null}
              <View style={[s.summaryRow, s.totalRow]}>
                <Text style={s.totalLabel}>Total</Text>
                <Text style={s.totalValue}>{formatCurrency(grandTotal)}</Text>
              </View>
            </Animated.View>

            {/* Actions */}
            <Animated.View entering={FadeInDown.delay(250).duration(400)} style={s.actions}>
              <Pressable
                style={({ pressed }) => [s.shareButton, pressed && s.pressed]}
                onPress={handleConfirmReceipt}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#04110D" />
                <Text style={s.shareButtonText}>Looks Good</Text>
                <Ionicons name="arrow-forward" size={16} color="#04110D" />
              </Pressable>
            </Animated.View>
      </ScrollView>

      {imageUri ? (
        <Pressable
          style={({ pressed }) => [s.floatingReceiptButton, pressed && s.pressed]}
          onPress={() => {
            Keyboard.dismiss();
            setIsImageExpanded(true);
          }}
        >
          <Ionicons name="receipt-outline" size={16} color={colors.primary} />
          <Text style={s.floatingReceiptButtonText}>View Receipt</Text>
        </Pressable>
      ) : null}

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
    minWidth: 0,
  },
  titleEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleEditButton: {
    padding: 2,
  },
  titleInput: {
    flex: 1,
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    flexShrink: 1,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(87, 230, 174, 0.33)',
    backgroundColor: 'rgba(87, 230, 174, 0.08)',
  },
  statusPillText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  floatingReceiptButton: {
    position: 'absolute',
    right: 24,
    bottom: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(17, 20, 24, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(87, 230, 174, 0.58)',
    shadowColor: '#57E6AE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 8,
  },
  floatingReceiptButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
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
  extraChargesButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 4,
  },
  extraChargesButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
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
    textAlign: 'center',
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
  pressed: {
    opacity: 0.7,
  },

  /* Image modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 18,
  },
  modalContent: {
    width: '100%',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    paddingBottom: 18,
  },
  modalImage: {
    width: '100%',
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'transparent',
    overflow: 'hidden',
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
});
