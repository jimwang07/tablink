import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';

import { usePendingReceipt } from '@/src/hooks/usePendingReceipt';
import { colors } from '@/src/theme';
import type { ParsedReceipt, ParsedReceiptItem } from '@/src/types/receipt';

type EditableItem = {
  key: string;
  name: string;
  price: string;
  quantity: string;
};

type NormalizedItem = {
  key: string;
  name: string;
  price: number;
  quantity: number;
};

const MIN_ITEM_QUANTITY = 0.01;

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
  return Math.max(MIN_ITEM_QUANTITY, Number(parsed.toFixed(2)));
}

function formatCurrency(amount: number, currencyCode: string) {
  if (Number.isNaN(amount)) {
    return '—';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode || 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode || 'USD'} ${amount.toFixed(2)}`;
  }
}

function formatQuantityLabel(quantity: number) {
  if (!Number.isFinite(quantity)) return '0';
  const fixed = quantity.toFixed(2);
  return fixed.replace(/\.?0+$/, '') || '0';
}

function buildEditableItems(items: ParsedReceiptItem[]) {
  if (!items.length) {
    return [
      {
        key: createItemKey(),
        name: '',
        price: '',
        quantity: '1',
      },
    ];
  }

  return items.map((item) => ({
    key: createItemKey(),
    name: item.name,
    price: toCurrencyString(item.price),
    quantity: item.quantity.toString(),
  }));
}

function normalizeItems(items: EditableItem[]): NormalizedItem[] {
  return items.map((item) => ({
    key: item.key,
    name: item.name.trim() || 'Untitled item',
    price: parseCurrencyInput(item.price),
    quantity: parseQuantityInput(item.quantity),
  }));
}

export default function ReceiptReviewScreen() {
  const router = useRouter();
  const { pendingReceipt, setPendingReceipt } = usePendingReceipt();

  useEffect(() => {
    if (!pendingReceipt) {
      router.replace('/(host)/home');
    }
  }, [pendingReceipt, router]);

  const parsed = pendingReceipt?.parsed;
  const previewImageUri = pendingReceipt ? pendingReceipt.localUri || pendingReceipt.publicUrl || '' : '';
  const currencyCode = parsed?.currency || 'USD';

  const [merchantName, setMerchantName] = useState(parsed?.merchantName ?? '');
  const [notes, setNotes] = useState(parsed?.notes ?? '');
  const [taxInput, setTaxInput] = useState(toCurrencyString(parsed?.totals.tax ?? 0));
  const [tipInput, setTipInput] = useState(toCurrencyString(parsed?.totals.tip ?? 0));
  const [editableItems, setEditableItems] = useState<EditableItem[]>(() =>
    buildEditableItems(parsed?.items ?? [])
  );
  const [isImageExpanded, setImageExpanded] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const normalizedItems = useMemo(() => normalizeItems(editableItems), [editableItems]);
  const subtotal = useMemo(
    () => normalizedItems.reduce((total, current) => total + current.price * current.quantity, 0),
    [normalizedItems]
  );
  const taxAmount = useMemo(() => parseCurrencyInput(taxInput), [taxInput]);
  const tipAmount = useMemo(() => parseCurrencyInput(tipInput), [tipInput]);
  const grandTotal = useMemo(() => subtotal + taxAmount + tipAmount, [subtotal, taxAmount, tipAmount]);

  const handleRetake = useCallback(() => {
    setPendingReceipt(null);
    router.replace('/scan');
  }, [router, setPendingReceipt]);

  const handleOpenImage = useCallback(() => {
    setImageExpanded(true);
  }, []);

  const handleCloseImage = useCallback(() => {
    setImageExpanded(false);
  }, []);

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

  const addCustomItem = useCallback(() => {
    const newItem = {
      key: createItemKey(),
      name: '',
      price: '',
      quantity: '1',
    };
    setEditableItems((current) => [newItem, ...current]);
    setActiveItemId(newItem.key);
  }, []);

  const buildUpdatedReceipt = useCallback(
    (base: ParsedReceipt): ParsedReceipt => {
      const sanitizedItems = normalizeItems(editableItems).map<ParsedReceiptItem>((item) => ({
        name: item.name,
        price: Number(item.price.toFixed(2)),
        quantity: Number(item.quantity.toFixed(2)),
      }));

      const sanitizedSubtotal = sanitizedItems.reduce(
        (total, current) => total + current.price * current.quantity,
        0
      );
      const sanitizedTax = parseCurrencyInput(taxInput);
      const sanitizedTip = parseCurrencyInput(tipInput);
      const sanitizedTotal = sanitizedSubtotal + sanitizedTax + sanitizedTip;

      return {
        ...base,
        merchantName: merchantName.trim() || null,
        notes: notes.trim() || null,
        items: sanitizedItems,
        totals: {
          subtotal: Number(sanitizedSubtotal.toFixed(2)),
          tax: Number(sanitizedTax.toFixed(2)),
          tip: Number(sanitizedTip.toFixed(2)),
          total: Number(sanitizedTotal.toFixed(2)),
          itemsTotal: Number(sanitizedSubtotal.toFixed(2)),
        },
      };
    },
    [editableItems, merchantName, notes, taxInput, tipInput]
  );

  const handleSaveDraft = useCallback(() => {
    if (!pendingReceipt) return;

    const nextParsed = buildUpdatedReceipt(pendingReceipt.parsed);
    setPendingReceipt({ ...pendingReceipt, parsed: nextParsed });

    // TODO: persist to Supabase before navigating
    router.replace('/(host)/home');
  }, [buildUpdatedReceipt, pendingReceipt, router, setPendingReceipt]);

  const placeholderColor = 'rgba(195,200,212,0.5)';

  if (!pendingReceipt || !parsed) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Tidy up your receipt</Text>
          <Text style={styles.subtitle}>
            Edit anything you need before you share. We’ll save these updates as your draft.
          </Text>
        </View>

        <View style={styles.previewCard}>
          <View style={styles.previewImageWrapper}>
            <Image source={{ uri: previewImageUri }} resizeMode="cover" style={styles.previewImage} />
            <TouchableOpacity style={styles.expandButton} onPress={handleOpenImage}>
              <Text style={styles.expandButtonText}>View full receipt</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.previewBody}>
            <Text style={styles.inputLabel}>Merchant</Text>
            <TextInput
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder="Add merchant name"
              placeholderTextColor={placeholderColor}
              style={styles.textInput}
            />
            <View style={styles.previewTotals}>
              <View>
                <Text style={styles.inputLabel}>Draft total</Text>
                <Text style={styles.previewTotalValue}>{formatCurrency(grandTotal, currencyCode)}</Text>
              </View>
              <View style={styles.previewCurrencyPill}>
                <Text style={styles.previewCurrencyText}>{currencyCode}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Items</Text>
            <TouchableOpacity style={styles.cardHeaderButton} onPress={addCustomItem}>
              <Text style={styles.cardHeaderButtonText}>+ Add item</Text>
            </TouchableOpacity>
          </View>
          {editableItems.map((item) => {
            const isActive = activeItemId === item.key;
            return (
              <Swipeable
                key={item.key}
                overshootRight={false}
                renderRightActions={() => (
                  <TouchableOpacity style={styles.swipeDelete} onPress={() => removeItem(item.key)}>
                    <Text style={styles.swipeDeleteText}>Delete</Text>
                  </TouchableOpacity>
                )}
              >
                <View style={[styles.itemRow, isActive && styles.itemRowActive]}>
                  <Pressable
                    onPress={() => setActiveItemId(isActive ? null : item.key)}
                    style={styles.itemSummaryRow}
                  >
                    <View style={styles.itemSummaryText}>
                      <Text style={styles.itemSummaryName}>{item.name || 'Untitled item'}</Text>
                      <Text style={styles.itemSummaryMeta}>
                        × {formatQuantityLabel(parseQuantityInput(item.quantity))}
                      </Text>
                    </View>
                    <Text style={styles.itemSummaryTotal}>
                      {formatCurrency(
                        parseCurrencyInput(item.price) * parseQuantityInput(item.quantity),
                        currencyCode
                      )}
                    </Text>
                  </Pressable>
                  {isActive && (
                    <View style={styles.itemEditPanel}>
                      <TextInput
                        value={item.name}
                        onChangeText={(value) => updateItemField(item.key, 'name', value)}
                        placeholder="Item name"
                        placeholderTextColor={placeholderColor}
                        style={[styles.textInput, styles.itemNameInput]}
                      />
                      <View style={styles.itemInputsRow}>
                        <View style={styles.inputColumn}>
                          <Text style={styles.inputLabel}>Price</Text>
                          <TextInput
                            value={item.price}
                            onChangeText={(value) => updateItemField(item.key, 'price', value)}
                            placeholder="0.00"
                            placeholderTextColor={placeholderColor}
                            keyboardType="decimal-pad"
                            style={styles.textInput}
                          />
                        </View>
                        <View style={styles.inputColumn}>
                          <Text style={styles.inputLabel}>Quantity</Text>
                          <TextInput
                            value={item.quantity}
                            onChangeText={(value) => updateItemField(item.key, 'quantity', value)}
                            placeholder="1"
                            placeholderTextColor={placeholderColor}
                            keyboardType="decimal-pad"
                            style={styles.textInput}
                          />
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              </Swipeable>
            );
          })}
          {!editableItems.length && (
            <Text style={styles.emptyItemsText}>No items yet. Add one to get started.</Text>
          )}
          <Text style={styles.cardFooterNote}>Tap an item to edit. Swipe left to delete.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Totals</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Items subtotal</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal, currencyCode)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <TextInput
              value={taxInput}
              onChangeText={setTaxInput}
              placeholder="0.00"
              placeholderTextColor={placeholderColor}
              keyboardType="decimal-pad"
              style={[styles.textInput, styles.summaryInput]}
            />
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tip</Text>
            <TextInput
              value={tipInput}
              onChangeText={setTipInput}
              placeholder="0.00"
              placeholderTextColor={placeholderColor}
              keyboardType="decimal-pad"
              style={[styles.textInput, styles.summaryInput]}
            />
          </View>
          <View style={[styles.summaryRow, styles.summaryTotalRow]}>
            <Text style={styles.summaryTotalLabel}>Draft total</Text>
            <Text style={styles.summaryTotalValue}>{formatCurrency(grandTotal, currencyCode)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any reminders or special instructions"
            placeholderTextColor={placeholderColor}
            multiline
            textAlignVertical="top"
            style={[styles.textInput, styles.notesInput]}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleRetake}>
            <Text style={styles.secondaryButtonText}>Retake Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={handleSaveDraft}>
            <Text style={styles.primaryButtonText}>Save Draft</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <Modal
        visible={isImageExpanded}
        animationType="fade"
        transparent
        onRequestClose={handleCloseImage}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Image
              source={{ uri: previewImageUri }}
              resizeMode="contain"
              style={styles.modalImage}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={handleCloseImage}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  header: {
    gap: 10,
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  previewImageWrapper: {
    position: 'relative',
  },
  previewImage: {
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
    borderRadius: 999,
    backgroundColor: 'rgba(8, 10, 12, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(45, 211, 111, 0.6)',
  },
  expandButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  previewBody: {
    padding: 16,
    gap: 12,
  },
  previewTotals: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTotalValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  previewCurrencyPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(45, 211, 111, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(45, 211, 111, 0.45)',
  },
  previewCurrencyText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  cardHeaderButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: 'rgba(17,20,24,0.9)',
  },
  cardHeaderButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  itemRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(8,10,12,0.5)',
    marginBottom: 12,
    overflow: 'hidden',
  },
  itemRowActive: {
    borderColor: 'rgba(45,211,111,0.4)',
    backgroundColor: 'rgba(8,10,12,0.75)',
  },
  itemInputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  inputColumn: {
    flex: 1,
    gap: 6,
  },
  totalColumn: {
    alignItems: 'flex-end',
  },
  lineTotalValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  removeText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  itemSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceBorder,
  },
  itemSummaryText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingRight: 12,
  },
  itemSummaryName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  itemSummaryMeta: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  itemSummaryTotal: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  cardFooterNote: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  itemEditPanel: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  swipeDelete: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,92,92,0.15)',
  },
  swipeDeleteText: {
    color: colors.danger,
    fontWeight: '700',
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  textInput: {
    backgroundColor: 'rgba(17,20,24,0.75)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    color: colors.text,
    fontSize: 15,
  },
  itemNameInput: {
    flex: 1,
  },
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
  },
  summaryInput: {
    width: 120,
    textAlign: 'right',
    paddingRight: 12,
  },
  summaryTotalRow: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceBorder,
  },
  summaryTotalLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  summaryTotalValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  notesValue: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  notesPlaceholder: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  notesInput: {
    minHeight: 100,
    paddingTop: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
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
    borderRadius: 18,
    backgroundColor: colors.surfaceBorder,
  },
  modalCloseButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(17,20,24,0.9)',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modalCloseText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
