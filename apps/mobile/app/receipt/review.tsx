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
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { usePendingReceipt } from '@/src/hooks/usePendingReceipt';
import { useAuth } from '@/src/hooks/useAuth';
import { saveReceipt, updateReceipt } from '@/src/services/receiptService';
import { getSupabaseClient } from '@/src/lib/supabaseClient';
import { colors } from '@/src/theme';
import type { ParsedReceiptItem } from '@/src/types/receipt';

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

  const TABLINK_BASE_URL = 'http://localhost:3000';

  useEffect(() => {
    if (!pendingReceipt) {
      router.replace('/(host)/home');
    }
  }, [pendingReceipt, router]);

  const parsed = pendingReceipt?.parsed;
  const imageUri = pendingReceipt?.localUri || pendingReceipt?.publicUrl || '';

  // Editable state
  const [merchantName, setMerchantName] = useState(parsed?.merchantName ?? '');
  const [taxInput, setTaxInput] = useState(toCurrencyString(parsed?.totals.tax ?? 0));
  const [tipInput, setTipInput] = useState(toCurrencyString(parsed?.totals.tip ?? 0));
  const [editableItems, setEditableItems] = useState<EditableItem[]>(() =>
    buildEditableItems(parsed?.items ?? [])
  );

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

      setPendingReceipt(null);
      router.replace('/(host)/home');
    } catch (error) {
      console.error('[review] Failed to save draft:', error);
      Alert.alert('Error', 'Failed to save receipt. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [buildUpdatedParsed, pendingReceipt, router, session, setPendingReceipt]);

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
            onPress: () => router.push('/(host)/settings'),
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

      // Generate and share the tablink
      const tablinkUrl = `${TABLINK_BASE_URL}/claim/${result.receiptId}`;
      const merchantDisplay = updatedParsed.merchantName ? ` (${updatedParsed.merchantName})` : '';

      await Share.share({
        message: `Split the bill with me!${merchantDisplay}\n${tablinkUrl}`,
        url: tablinkUrl,
        title: 'Share Tablink',
      });

      // Store the receipt ID and show success modal
      setSharedReceiptId(result.receiptId);
      setPendingReceipt(null);
      setShowShareSuccess(true);
    } catch (error) {
      console.error('[review] Failed to share receipt:', error);
      Alert.alert('Error', 'Failed to share receipt. Please try again.');
    } finally {
      setIsSharing(false);
    }
  }, [buildUpdatedParsed, pendingReceipt, session, setPendingReceipt, TABLINK_BASE_URL, hasPaymentMethods, router]);

  const handleViewReceipt = useCallback(() => {
    setShowShareSuccess(false);
    if (sharedReceiptId) {
      router.replace(`/receipt/${sharedReceiptId}`);
    }
  }, [router, sharedReceiptId]);

  const handleGoHome = useCallback(() => {
    setShowShareSuccess(false);
    router.replace('/(host)/home');
  }, [router]);

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
            setPendingReceipt(null);
            router.replace('/(host)/home');
          },
        },
      ]
    );
  }, [router, setPendingReceipt]);

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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleDiscard} style={styles.backArrow}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.title} numberOfLines={1}>
              {merchantName || 'New Receipt'}
            </Text>
            <Text style={styles.subtitle}>{formatDate(parsed.purchaseDate)}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>New</Text>
          </View>
        </View>

        {/* Receipt Image */}
        {imageUri ? (
          <View style={styles.imageCard}>
            <Image source={{ uri: imageUri }} style={styles.receiptImage} resizeMode="cover" />
            <TouchableOpacity style={styles.expandButton} onPress={() => setIsImageExpanded(true)}>
              <Text style={styles.expandButtonText}>View full receipt</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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
            style={[styles.shareButton, isSharing && styles.buttonDisabled]}
            onPress={handleShareReceipt}
            disabled={isSharing || isSaving}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.shareButtonText}>Share Receipt</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveDraftButton, isSaving && styles.buttonDisabled]}
            onPress={handleSaveDraft}
            disabled={isSaving || isSharing}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.saveDraftButtonText}>Save as Draft</Text>
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
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                resizeMode="contain"
                style={styles.modalImage}
              />
            ) : null}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setIsImageExpanded(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
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
        <View style={styles.successModalBackdrop}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
            </View>
            <Text style={styles.successTitle}>Receipt Shared!</Text>
            <Text style={styles.successMessage}>
              Your tablink has been created. View your receipt to see claims update in real-time as friends claim their items.
            </Text>
            <View style={styles.successActions}>
              <TouchableOpacity
                style={styles.successPrimaryButton}
                onPress={handleViewReceipt}
              >
                <Text style={styles.successPrimaryButtonText}>View Receipt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.successSecondaryButton}
                onPress={handleGoHome}
              >
                <Text style={styles.successSecondaryButtonText}>Go Home</Text>
              </TouchableOpacity>
            </View>
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
    paddingTop: 20,
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
    backgroundColor: 'rgba(45, 211, 111, 0.2)',
  },
  statusText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
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
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  saveDraftButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  saveDraftButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  successModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successModalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
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
    gap: 12,
  },
  successPrimaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  successPrimaryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  successSecondaryButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  successSecondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
});
