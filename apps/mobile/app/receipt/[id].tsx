import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getSupabaseClient } from '@/src/lib/supabaseClient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/src/theme';
import {
  fetchReceipt,
  updateReceipt,
  updateReceiptItems,
  deleteReceipt,
  type ReceiptWithItems,
  type ReceiptItem,
} from '@/src/services/receiptService';

type EditableItem = {
  key: string;
  name: string;
  price: string;
  quantity: string;
};

function createItemKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function centsToDollars(cents: number): number {
  return cents / 100;
}

function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
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

function formatCurrency(amount: number) {
  if (Number.isNaN(amount)) return '—';
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

function buildEditableItems(items: ReceiptItem[]): EditableItem[] {
  if (!items.length) {
    return [{ key: createItemKey(), name: '', price: '', quantity: '1' }];
  }
  return items.map((item) => ({
    key: item.id || createItemKey(),
    name: item.label,
    price: toCurrencyString(centsToDollars(item.price_cents)),
    quantity: item.quantity.toString(),
  }));
}

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [receipt, setReceipt] = useState<ReceiptWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isImageExpanded, setIsImageExpanded] = useState(false);

  // Editable state
  const [merchantName, setMerchantName] = useState('');
  const [taxInput, setTaxInput] = useState('0.00');
  const [tipInput, setTipInput] = useState('0.00');
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Load receipt
  useEffect(() => {
    if (!id) return;

    async function load() {
      setIsLoading(true);
      const result = await fetchReceipt(id);
      if (result.success) {
        const r = result.receipt;
        setReceipt(r);
        setMerchantName(r.merchant_name || '');
        setTaxInput(toCurrencyString(centsToDollars(r.tax_cents)));
        setTipInput(toCurrencyString(centsToDollars(r.tip_cents)));
        setEditableItems(buildEditableItems(r.items));

        // Get image URL if available (use signed URL for private bucket)
        if (r.image_path) {
          const supabase = getSupabaseClient();
          const { data, error } = await supabase.storage
            .from('receipts')
            .createSignedUrl(r.image_path, 3600); // 1 hour expiry
          if (error) {
            console.error('[ReceiptDetail] Failed to get signed URL:', error);
          } else if (data?.signedUrl) {
            setImageUrl(data.signedUrl);
          }
        }
      } else {
        setError(result.error);
      }
      setIsLoading(false);
    }

    load();
  }, [id]);

  // Track changes
  useEffect(() => {
    setHasChanges(true);
  }, [merchantName, taxInput, tipInput, editableItems]);

  // Computed values
  const subtotal = useMemo(() => {
    return editableItems.reduce((total, item) => {
      const price = parseCurrencyInput(item.price);
      const qty = parseQuantityInput(item.quantity);
      return total + price * qty;
    }, 0);
  }, [editableItems]);

  const taxAmount = useMemo(() => parseCurrencyInput(taxInput), [taxInput]);
  const tipAmount = useMemo(() => parseCurrencyInput(tipInput), [tipInput]);
  const grandTotal = useMemo(() => subtotal + taxAmount + tipAmount, [subtotal, taxAmount, tipAmount]);

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

  const handleSave = useCallback(async () => {
    if (!id || !receipt) return;

    setIsSaving(true);
    try {
      // Update receipt metadata
      const receiptResult = await updateReceipt(id, {
        merchant_name: merchantName.trim() || null,
        subtotal_cents: dollarsToCents(subtotal),
        tax_cents: dollarsToCents(taxAmount),
        tip_cents: dollarsToCents(tipAmount),
        total_cents: dollarsToCents(grandTotal),
      });

      if (!receiptResult.success) {
        Alert.alert('Error', receiptResult.error || 'Failed to save receipt');
        return;
      }

      // Update items
      const itemsToSave = editableItems.map((item, index) => ({
        label: item.name.trim() || 'Untitled item',
        price_cents: dollarsToCents(parseCurrencyInput(item.price)),
        quantity: parseQuantityInput(item.quantity),
        position: index,
      }));

      const itemsResult = await updateReceiptItems(id, itemsToSave);

      if (!itemsResult.success) {
        Alert.alert('Error', itemsResult.error || 'Failed to save items');
        return;
      }

      setHasChanges(false);
      Alert.alert('Saved', 'Your changes have been saved.');
    } catch (err) {
      console.error('[ReceiptDetail] Save error:', err);
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [id, receipt, merchantName, subtotal, taxAmount, tipAmount, grandTotal, editableItems]);

  const handleDelete = useCallback(() => {
    if (!id) return;

    Alert.alert(
      'Delete Receipt',
      'Are you sure you want to delete this receipt? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const result = await deleteReceipt(id);
              if (result.success) {
                router.replace('/(host)/home');
              } else {
                Alert.alert('Error', result.error || 'Failed to delete receipt');
              }
            } catch (err) {
              console.error('[ReceiptDetail] Delete error:', err);
              Alert.alert('Error', 'Failed to delete receipt');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  }, [id, router]);

  const placeholderColor = 'rgba(195,200,212,0.5)';

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !receipt) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Receipt not found'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backArrow}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.title} numberOfLines={1}>
              {receipt.merchant_name || 'Receipt'}
            </Text>
            <Text style={styles.subtitle}>{formatDate(receipt.receipt_date)}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{receipt.status}</Text>
          </View>
        </View>

        {/* Receipt Image */}
        {receipt.image_path && (
          <View style={styles.imageCard}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.receiptImage} resizeMode="cover" />
            ) : (
              <View style={[styles.receiptImage, styles.imagePlaceholder]}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
              </View>
            )}
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setIsImageExpanded(true)}
              disabled={!imageUrl}
            >
              <Text style={styles.expandButtonText}>View full receipt</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Merchant */}
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Merchant Name</Text>
          <TextInput
            value={merchantName}
            onChangeText={setMerchantName}
            placeholder="Add merchant name"
            placeholderTextColor={placeholderColor}
            style={styles.textInput}
          />
        </View>

        {/* Items */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Items</Text>
            <TouchableOpacity style={styles.addButton} onPress={addItem}>
              <Text style={styles.addButtonText}>+ Add item</Text>
            </TouchableOpacity>
          </View>
          {editableItems.map((item) => (
            <Animated.View
              key={item.key}
              style={styles.itemWrapper}
              exiting={FadeOut.duration(200)}
              layout={LinearTransition.duration(200)}
            >
              <View style={styles.swipeDeleteBehind} />
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
                  <View style={styles.swipeDeleteButton}>
                    <Ionicons name="trash" size={22} color="#fff" />
                  </View>
                )}
              >
                <View style={styles.itemRow}>
                  <TextInput
                    value={item.name}
                    onChangeText={(value) => updateItemField(item.key, 'name', value)}
                    placeholder="Item name"
                    placeholderTextColor={placeholderColor}
                    style={[styles.itemNameInput, { color: '#F5F7FA' }]}
                  />
                  <View style={styles.itemRightFields}>
                    <TextInput
                      value={item.quantity}
                      onChangeText={(value) => updateItemField(item.key, 'quantity', value)}
                      placeholder="1"
                      placeholderTextColor={placeholderColor}
                      keyboardType="decimal-pad"
                      style={styles.itemQtyInput}
                    />
                    <Text style={styles.itemTimesSymbol}>×</Text>
                    <TextInput
                      value={item.price}
                      onChangeText={(value) => updateItemField(item.key, 'price', value)}
                      placeholder="0.00"
                      placeholderTextColor={placeholderColor}
                      keyboardType="decimal-pad"
                      style={styles.itemPriceInput}
                    />
                  </View>
                </View>
              </Swipeable>
            </Animated.View>
          ))}
          <Text style={styles.hint}>Swipe left to delete an item.</Text>
        </View>

        {/* Totals */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Totals</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Items subtotal</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
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
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(grandTotal)}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.saveButton, (isSaving || isDeleting) && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={isSaving || isDeleting}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, (isSaving || isDeleting) && styles.buttonDisabled]}
            onPress={handleDelete}
            disabled={isSaving || isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Text style={styles.deleteButtonText}>Delete Receipt</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Full Image Modal */}
      <Modal
        visible={isImageExpanded}
        animationType="fade"
        transparent
        onRequestClose={() => setIsImageExpanded(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            {imageUrl && (
              <Image
                source={{ uri: imageUrl }}
                resizeMode="contain"
                style={styles.modalImage}
              />
            )}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setIsImageExpanded(false)}>
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
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
  },
  backButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    padding: 20,
    paddingTop: 60,
    gap: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.surfaceBorder,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  imageCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  receiptImage: {
    width: '100%',
    height: 200,
    backgroundColor: colors.surfaceBorder,
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: 'rgba(17,20,24,0.9)',
  },
  addButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
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
  itemWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  swipeDeleteBehind: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 80,
    backgroundColor: colors.danger,
    borderRadius: 8,
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
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceBorder,
  },
  itemNameInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  itemRightFields: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemQtyInput: {
    color: colors.text,
    fontSize: 14,
    width: 36,
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: 'transparent',
  },
  itemTimesSymbol: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  itemPriceInput: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    width: 70,
    textAlign: 'right',
    paddingVertical: 4,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
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
  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceBorder,
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
  },
  actions: {
    marginTop: 8,
    gap: 12,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: 'transparent',
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
