import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
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
  TouchableOpacity,
  View,
} from 'react-native';
import { Confetti } from '@/src/components/Confetti';
import { getSupabaseClient } from '@/src/lib/supabaseClient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/src/theme';
import { useAuth } from '@/src/hooks/useAuth';
import {
  fetchReceipt,
  updateReceipt,
  updateReceiptItems,
  deleteReceipt,
  type ReceiptWithItems,
  type ReceiptItem,
} from '@/src/services/receiptService';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type ItemClaim = {
  id: string;
  item_id: string;
  participant_id: string;
  portion: number;
  amount_cents: number;
};

type Participant = {
  id: string;
  display_name: string;
  emoji: string | null;
  color_token: string | null;
  role?: 'owner' | 'guest';
  payment_status?: string | null;
  paid_at?: string | null;
  payment_method?: string | null;
  payment_amount_cents?: number | null;
};

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
  const { user } = useAuth();

  const [receipt, setReceipt] = useState<ReceiptWithItems | null>(null);
  const [hasPaymentMethods, setHasPaymentMethods] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isImageExpanded, setIsImageExpanded] = useState(false);

  // Base URL for tablinks - in production this would come from env
  const TABLINK_BASE_URL = process.env.EXPO_PUBLIC_TABLINK_URL || 'http://localhost:3000';

  // Editable state
  const [merchantName, setMerchantName] = useState('');
  const [taxInput, setTaxInput] = useState('0.00');
  const [tipInput, setTipInput] = useState('0.00');
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Claims and participants for realtime updates
  const [claims, setClaims] = useState<ItemClaim[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Add participant form
  const [newParticipantName, setNewParticipantName] = useState('');
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);

  // Item assignment modal
  const [assigningItem, setAssigningItem] = useState<EditableItem | null>(null);
  const [isUpdatingClaim, setIsUpdatingClaim] = useState(false);

  // Confetti celebration for settled receipts
  const [showConfetti, setShowConfetti] = useState(false);
  const [showSettledModal, setShowSettledModal] = useState(false);
  const initialCheckDoneRef = useRef(false);
  const wasSettledRef = useRef(false);

  // Check if user has payment methods set up
  useEffect(() => {
    async function checkPaymentMethods() {
      if (!user?.id) return;

      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('user_profiles')
        .select('venmo_handle, cashapp_handle, paypal_handle, zelle_identifier')
        .eq('user_id', user.id)
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
  }, [user?.id]);

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

  // Load claims and participants, and subscribe to realtime updates
  useEffect(() => {
    if (!id || !receipt) return;

    const supabase = getSupabaseClient();
    const itemIds = receipt.items.map(i => i.id);

    // Initial fetch of claims and participants
    async function fetchClaimsAndParticipants() {
      // Fetch claims for items on this receipt
      if (itemIds.length > 0) {
        const { data: claimsData } = await supabase
          .from('item_claims')
          .select('id, item_id, participant_id, portion, amount_cents')
          .in('item_id', itemIds);
        if (claimsData) setClaims(claimsData);
      }

      // Fetch participants
      const { data: participantsData } = await supabase
        .from('receipt_participants')
        .select('id, display_name, emoji, color_token, role, payment_status, paid_at, payment_method, payment_amount_cents')
        .eq('receipt_id', id);
      if (participantsData) setParticipants(participantsData);
    }

    fetchClaimsAndParticipants();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`receipt:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'item_claims',
        },
        (payload: RealtimePostgresChangesPayload<ItemClaim>) => {
          if (payload.eventType === 'INSERT') {
            const newClaim = payload.new as ItemClaim;
            if (itemIds.includes(newClaim.item_id)) {
              setClaims(prev => {
                if (prev.some(c => c.id === newClaim.id)) return prev;
                return [...prev, newClaim];
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const oldClaim = payload.old as { id: string };
            setClaims(prev => prev.filter(c => c.id !== oldClaim.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'receipt_participants',
          filter: `receipt_id=eq.${id}`,
        },
        (payload: RealtimePostgresChangesPayload<Participant>) => {
          const newParticipant = payload.new as Participant;
          setParticipants(prev => {
            if (prev.some(p => p.id === newParticipant.id)) return prev;
            return [...prev, newParticipant];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'receipt_participants',
          filter: `receipt_id=eq.${id}`,
        },
        (payload: RealtimePostgresChangesPayload<Participant>) => {
          const updatedParticipant = payload.new as Participant;
          setParticipants(prev =>
            prev.map(p => p.id === updatedParticipant.id ? updatedParticipant : p)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, receipt]);

  // Helper to get claimers for an item (deduplicated by participant)
  const getItemClaimers = useCallback((itemKey: string) => {
    // itemKey is the item.id (original) or a generated key for new items
    const itemClaims = claims.filter(c => c.item_id === itemKey);
    const seenIds = new Set<string>();
    const claimers: Participant[] = [];

    for (const claim of itemClaims) {
      if (seenIds.has(claim.participant_id)) continue;
      const participant = participants.find(p => p.id === claim.participant_id);
      if (participant) {
        seenIds.add(claim.participant_id);
        claimers.push(participant);
      }
    }

    return claimers;
  }, [claims, participants]);

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

  // Calculate effective status based on payment data
  const effectiveStatus = useMemo(() => {
    if (!receipt) return 'draft';
    // If already settled in DB, use that
    if (receipt.status === 'settled') return 'settled';
    // If draft, use that
    if (receipt.status === 'draft') return 'draft';

    // Check if fully paid: all items with claims have all claimers paid
    if (claims.length > 0 && participants.length > 0) {
      // Build map of participant payment status
      const paidParticipants = new Set(
        participants.filter(p => p.payment_status === 'paid').map(p => p.id)
      );

      // Check if all claims are from paid participants
      const allClaimsPaid = claims.every(c => paidParticipants.has(c.participant_id));

      if (allClaimsPaid) {
        return 'settled';
      }
    }

    // Otherwise use DB status
    return receipt.status;
  }, [receipt, claims, participants]);

  // Trigger confetti when receipt becomes settled
  useEffect(() => {
    if (!id || !receipt) return;

    const isSettled = effectiveStatus === 'settled';

    const markCelebrationShown = async () => {
      const supabase = getSupabaseClient();
      await supabase
        .from('receipts')
        .update({ celebration_shown: true })
        .eq('id', id);
    };

    // Handle initial check (first time viewing this receipt)
    if (!initialCheckDoneRef.current) {
      initialCheckDoneRef.current = true;
      wasSettledRef.current = isSettled;

      if (isSettled && receipt.celebration_shown !== true) {
        // Show confetti and mark as shown in database
        setShowConfetti(true);
        setShowSettledModal(true);
        markCelebrationShown();
      }
      return;
    }

    // Handle real-time updates: status changed to settled while viewing
    // Only show if celebration hasn't been shown before
    if (isSettled && !wasSettledRef.current && receipt.celebration_shown !== true) {
      wasSettledRef.current = true;
      setShowConfetti(true);
      setShowSettledModal(true);
      markCelebrationShown();
    }

    // Update tracking ref
    wasSettledRef.current = isSettled;
  }, [id, effectiveStatus, receipt]);

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

  const handleShare = useCallback(async () => {
    if (!id || !receipt) return;

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
      // Update status to shared when creating tablink
      if (receipt.status === 'draft') {
        const result = await updateReceipt(id, { status: 'shared' });
        if (!result.success) {
          Alert.alert('Error', result.error || 'Failed to activate receipt');
          return;
        }
        // Update local state
        setReceipt({ ...receipt, status: 'shared' as any });
      }

      // Generate the tablink URL
      const tablinkUrl = `${TABLINK_BASE_URL}/claim/${id}`;

      // Open native share sheet
      const result = await Share.share({
        message: `Split the bill with me! ${receipt.merchant_name ? `(${receipt.merchant_name})` : ''}\n${tablinkUrl}`,
        url: tablinkUrl, // iOS only
        title: 'Share Tablink',
      });

      if (result.action === Share.sharedAction) {
        console.log('[ReceiptDetail] Shared successfully');
      }
    } catch (err) {
      console.error('[ReceiptDetail] Share error:', err);
      Alert.alert('Error', 'Failed to share tablink');
    } finally {
      setIsSharing(false);
    }
  }, [id, receipt, TABLINK_BASE_URL, hasPaymentMethods, router]);

  const EMOJIS = ['😀', '🎉', '🍕', '🌟', '🎸', '🌈', '🚀', '🎨', '🍦', '🎯', '🦊', '🐱', '🦁', '🐸'];
  const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#74b9ff', '#fd79a8'];

  const handleAddParticipant = useCallback(async () => {
    if (!id || !newParticipantName.trim()) return;

    setIsAddingParticipant(true);
    try {
      const supabase = getSupabaseClient();
      const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];

      const { data, error: insertError } = await supabase
        .from('receipt_participants')
        .insert({
          receipt_id: id,
          display_name: newParticipantName.trim(),
          emoji,
          color_token: color,
          role: 'guest',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setParticipants(prev => [...prev, data]);
      setNewParticipantName('');
      Keyboard.dismiss();
    } catch (err) {
      console.error('[ReceiptDetail] Failed to add participant:', err);
      Alert.alert('Error', 'Failed to add participant');
    } finally {
      setIsAddingParticipant(false);
    }
  }, [id, newParticipantName]);

  const handleRemoveParticipant = useCallback(async (participantId: string) => {
    const participant = participants.find(p => p.id === participantId);
    if (!participant) return;

    // Check if participant has any claims
    const hasClaims = claims.some(c => c.participant_id === participantId);
    if (hasClaims) {
      Alert.alert('Cannot Remove', 'This participant has claimed items. Remove their claims first.');
      return;
    }

    Alert.alert(
      'Remove Participant',
      `Remove ${participant.display_name} from this receipt?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const supabase = getSupabaseClient();
              const { error: deleteError } = await supabase
                .from('receipt_participants')
                .delete()
                .eq('id', participantId);

              if (deleteError) throw deleteError;
              setParticipants(prev => prev.filter(p => p.id !== participantId));
            } catch (err) {
              console.error('[ReceiptDetail] Failed to remove participant:', err);
              Alert.alert('Error', 'Failed to remove participant');
            }
          },
        },
      ]
    );
  }, [participants, claims]);

  const handleToggleClaim = useCallback(async (participantId: string) => {
    if (!assigningItem || isUpdatingClaim) return;

    const itemKey = assigningItem.key;
    const itemPrice = dollarsToCents(parseCurrencyInput(assigningItem.price));
    const existingClaim = claims.find(
      c => c.item_id === itemKey && c.participant_id === participantId
    );

    setIsUpdatingClaim(true);
    try {
      const supabase = getSupabaseClient();

      if (existingClaim) {
        // Remove the claim
        const { error: deleteError } = await supabase
          .from('item_claims')
          .delete()
          .eq('id', existingClaim.id);

        if (deleteError) throw deleteError;
        setClaims(prev => prev.filter(c => c.id !== existingClaim.id));
      } else {
        // Add a claim
        const { data, error: insertError } = await supabase
          .from('item_claims')
          .insert({
            item_id: itemKey,
            participant_id: participantId,
            portion: 1,
            amount_cents: itemPrice,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setClaims(prev => [...prev, data]);
      }
    } catch (err) {
      console.error('[ReceiptDetail] Failed to update claim:', err);
      Alert.alert('Error', 'Failed to update assignment');
    } finally {
      setIsUpdatingClaim(false);
    }
  }, [assigningItem, claims, isUpdatingClaim]);

  const handleItemLongPress = useCallback((item: EditableItem) => {
    Keyboard.dismiss();
    setAssigningItem(item);
  }, []);

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
          <View style={[
            styles.statusBadge,
            effectiveStatus === 'draft' && { backgroundColor: colors.surfaceBorder },
            (effectiveStatus === 'ready' || effectiveStatus === 'shared' || effectiveStatus === 'partially_claimed') && { backgroundColor: '#5A4D2D' },
            effectiveStatus === 'fully_claimed' && { backgroundColor: '#2D4A5A' },
            effectiveStatus === 'settled' && { backgroundColor: '#2D5A3D' },
          ]}>
            <Text style={[
              styles.statusText,
              effectiveStatus === 'draft' && { color: colors.textSecondary },
              (effectiveStatus === 'ready' || effectiveStatus === 'shared' || effectiveStatus === 'partially_claimed') && { color: '#F2C94C' },
              effectiveStatus === 'fully_claimed' && { color: '#56CCF2' },
              effectiveStatus === 'settled' && { color: '#6FCF97' },
            ]}>
              {effectiveStatus === 'partially_claimed' ? 'Partial' :
               effectiveStatus === 'fully_claimed' ? 'Claimed' :
               effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1)}
            </Text>
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
          <Text style={styles.hint}>Tap <Ionicons name="person-add-outline" size={12} color={colors.textSecondary} /> to assign. Tap fields to edit. Swipe left to delete.</Text>
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
                {(() => {
                  const itemClaimers = getItemClaimers(item.key);
                  const isPaid = itemClaimers.length > 0 && itemClaimers.every(c => c.payment_status === 'paid');
                  const isClaimed = itemClaimers.length > 0 && !isPaid;

                  return (
                    <View style={[styles.itemRow, isClaimed && styles.itemRowClaimed, isPaid && styles.itemRowPaid]}>
                      <TouchableOpacity
                        style={styles.assignButton}
                        onPress={() => handleItemLongPress(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={isPaid ? "checkmark-circle" : itemClaimers.length > 0 ? "people" : "person-add-outline"}
                          size={18}
                          color={isPaid ? colors.primary : isClaimed ? '#F2C94C' : colors.muted}
                        />
                      </TouchableOpacity>
                      <View style={styles.itemMainContent}>
                        <View style={styles.itemNameRow}>
                          <TextInput
                            value={item.name}
                            onChangeText={(value) => updateItemField(item.key, 'name', value)}
                            placeholder="Item name"
                            placeholderTextColor={placeholderColor}
                            style={[styles.itemNameInput, { color: '#F5F7FA', flex: 1 }]}
                          />
                          {isPaid && (
                            <View style={styles.paidBadge}>
                              <Text style={styles.paidBadgeText}>Paid</Text>
                            </View>
                          )}
                        </View>
                        {/* Claimer badges */}
                        {itemClaimers.length > 0 && (
                          <View style={styles.claimerBadges}>
                            {itemClaimers.map(claimer => (
                              <View
                                key={claimer.id}
                                style={[styles.claimerBadge, { borderLeftColor: claimer.color_token ?? colors.primary }]}
                              >
                                <Text style={styles.claimerEmoji}>{claimer.emoji}</Text>
                                <Text style={styles.claimerName}>{claimer.display_name}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                      <View style={styles.itemRightSection}>
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
                    </View>
                  );
                })()}
              </Swipeable>
            </Animated.View>
          ))}
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

        {/* Participants */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Participants</Text>
            <Text style={styles.participantCount}>{participants.length} people</Text>
          </View>

          {/* Add participant form */}
          <View style={styles.addParticipantRow}>
            <TextInput
              value={newParticipantName}
              onChangeText={setNewParticipantName}
              onSubmitEditing={handleAddParticipant}
              placeholder="Add a name..."
              placeholderTextColor={placeholderColor}
              style={styles.addParticipantInput}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.addParticipantButton, (!newParticipantName.trim() || isAddingParticipant) && styles.addParticipantButtonDisabled]}
              onPress={handleAddParticipant}
              disabled={!newParticipantName.trim() || isAddingParticipant}
            >
              {isAddingParticipant ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Ionicons name="add" size={20} color={colors.background} />
              )}
            </TouchableOpacity>
          </View>

          {/* Participant list */}
          {participants.length > 0 ? (
            <View style={styles.participantList}>
              {participants.map(p => {
                // Calculate this participant's total
                const participantClaims = claims.filter(c => c.participant_id === p.id);
                const claimsTotal = participantClaims.reduce((sum, c) => sum + c.amount_cents, 0);
                const itemsTotal = editableItems.reduce((sum, item) => {
                  const qty = parseQuantityInput(item.quantity);
                  const price = parseCurrencyInput(item.price);
                  return sum + dollarsToCents(qty * price);
                }, 0);
                const share = itemsTotal > 0 ? claimsTotal / itemsTotal : 0;
                const pTax = Math.round(parseCurrencyInput(taxInput) * 100 * share);
                const pTip = Math.round(parseCurrencyInput(tipInput) * 100 * share);
                const participantTotal = claimsTotal + pTax + pTip;
                const isShared = receipt.status === 'shared' || receipt.status === 'partially_claimed' || receipt.status === 'fully_claimed';

                const isOwner = p.role === 'owner';

                return (
                  <View key={p.id} style={styles.participantRow}>
                    <View style={styles.participantInfo}>
                      <Text style={styles.participantEmoji}>{p.emoji || '👤'}</Text>
                      <View style={styles.participantNameAndAmount}>
                        <View style={styles.participantNameRow}>
                          <Text style={styles.participantName}>{p.display_name}</Text>
                          {isOwner && <Text style={styles.participantYouLabel}>(You)</Text>}
                        </View>
                        {participantTotal > 0 && (
                          <Text style={styles.participantAmount}>{formatCurrency(participantTotal / 100)}</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.participantActions}>
                      {participantTotal > 0 && (
                        <View style={[
                          styles.paymentBadge,
                          p.payment_status === 'paid' ? styles.paymentBadgePaid : styles.paymentBadgePending,
                        ]}>
                          <Text style={[
                            styles.paymentBadgeText,
                            p.payment_status === 'paid' ? styles.paymentBadgeTextPaid : styles.paymentBadgeTextPending,
                          ]}>
                            {p.payment_status === 'paid' ? '✓ Paid' : 'Pending'}
                          </Text>
                        </View>
                      )}
                      {!isOwner && (
                        <TouchableOpacity
                          onPress={() => handleRemoveParticipant(p.id)}
                          style={styles.removeParticipantButton}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="close-circle" size={22} color={colors.muted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.noParticipantsText}>
              Add names of people splitting this bill. They can select their name when they open the tablink.
            </Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.shareButton, (isSaving || isDeleting || isSharing) && styles.buttonDisabled]}
            onPress={handleShare}
            disabled={isSaving || isDeleting || isSharing}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="share-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.shareButtonText}>
                  Share Receipt
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, (isSaving || isDeleting || isSharing) && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={isSaving || isDeleting || isSharing}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, (isSaving || isDeleting || isSharing) && styles.buttonDisabled]}
            onPress={handleDelete}
            disabled={isSaving || isDeleting || isSharing}
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

      {/* Assignment Modal */}
      <Modal
        visible={assigningItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setAssigningItem(null)}
      >
        <Pressable
          style={styles.assignModalBackdrop}
          onPress={() => setAssigningItem(null)}
        >
          <Pressable style={styles.assignModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.assignModalHeader}>
              <View>
                <Text style={styles.assignModalTitle}>Assign Item</Text>
                <Text style={styles.assignModalItemName} numberOfLines={1}>
                  {assigningItem?.name || 'Untitled item'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setAssigningItem(null)}
                style={styles.assignModalCloseButton}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {participants.length > 0 ? (
              <View style={styles.assignParticipantList}>
                {participants.map(p => {
                  const isAssigned = assigningItem
                    ? claims.some(c => c.item_id === assigningItem.key && c.participant_id === p.id)
                    : false;

                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.assignParticipantRow,
                        isAssigned && styles.assignParticipantRowSelected,
                      ]}
                      onPress={() => handleToggleClaim(p.id)}
                      disabled={isUpdatingClaim}
                    >
                      <View style={styles.assignParticipantInfo}>
                        <Text style={styles.assignParticipantEmoji}>{p.emoji || '👤'}</Text>
                        <Text style={styles.assignParticipantName}>{p.display_name}</Text>
                      </View>
                      <View style={[
                        styles.assignCheckbox,
                        isAssigned && styles.assignCheckboxChecked,
                      ]}>
                        {isAssigned && (
                          <Ionicons name="checkmark" size={16} color={colors.background} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.assignEmptyState}>
                <Text style={styles.assignEmptyText}>
                  Add participants first to assign items
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.assignDoneButton}
              onPress={() => setAssigningItem(null)}
            >
              <Text style={styles.assignDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Settled celebration modal */}
      <Modal
        visible={showSettledModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSettledModal(false)}
      >
        <Pressable
          style={styles.settledModalBackdrop}
          onPress={() => setShowSettledModal(false)}
        >
          <View style={styles.settledModalContent}>
            <Text style={styles.settledModalEmoji}>🎉</Text>
            <Text style={styles.settledModalTitle}>All Settled!</Text>
            <Text style={styles.settledModalMessage}>
              Everyone has paid their share for this receipt. Nice work!
            </Text>
            <TouchableOpacity
              style={styles.settledModalButton}
              onPress={() => setShowSettledModal(false)}
            >
              <Text style={styles.settledModalButtonText}>Awesome!</Text>
            </TouchableOpacity>
          </View>
        </Pressable>

        {/* Confetti raining from top */}
        {showConfetti && (
          <Confetti
            count={50}
            duration={3000}
            rainDuration={1500}
            onAnimationEnd={() => setShowConfetti(false)}
          />
        )}
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
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  itemRowClaimed: {
    backgroundColor: '#2e2a1a', // yellow tint for claimed items
  },
  itemRowPaid: {
    backgroundColor: '#1a2e1f', // green tint for paid items
  },
  itemMainContent: {
    flex: 1,
    paddingVertical: 12,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paidBadge: {
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  paidBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  itemRightSection: {
    alignItems: 'flex-end',
    paddingVertical: 12,
  },
  itemNameInput: {
    fontSize: 15,
    paddingVertical: 4,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  claimerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  claimerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderLeftWidth: 3,
    gap: 4,
  },
  claimerEmoji: {
    fontSize: 12,
  },
  claimerName: {
    color: colors.textSecondary,
    fontSize: 11,
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
    marginBottom: 8,
  },
  assignButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  saveButtonText: {
    color: colors.text,
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
  // Payment badge styles
  paymentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  paymentBadgePaid: {
    backgroundColor: '#2D5A3D',
  },
  paymentBadgePending: {
    backgroundColor: colors.surfaceBorder,
  },
  paymentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  paymentBadgeTextPaid: {
    color: '#6FCF97',
  },
  paymentBadgeTextPending: {
    color: colors.textSecondary,
  },
  // Participant management styles
  participantCount: {
    color: colors.muted,
    fontSize: 14,
  },
  addParticipantRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addParticipantInput: {
    flex: 1,
    backgroundColor: 'rgba(17,20,24,0.75)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    color: colors.text,
    fontSize: 15,
  },
  addParticipantButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addParticipantButtonDisabled: {
    opacity: 0.5,
  },
  participantList: {
    gap: 2,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceBorder,
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  participantEmoji: {
    fontSize: 20,
  },
  participantNameAndAmount: {
    flex: 1,
  },
  participantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  participantName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  participantYouLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  participantAmount: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  participantActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hasClaimsBadge: {
    backgroundColor: colors.surfaceBorder,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  hasClaimsText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  removeParticipantButton: {
    padding: 4,
  },
  noParticipantsText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  // Assignment modal styles
  assignModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  assignModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  assignModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  assignModalTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  assignModalItemName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    maxWidth: 260,
  },
  assignModalCloseButton: {
    padding: 4,
  },
  assignParticipantList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  assignParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceBorder,
  },
  assignParticipantRowSelected: {
    backgroundColor: `${colors.primary}15`,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  assignParticipantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assignParticipantEmoji: {
    fontSize: 24,
  },
  assignParticipantName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  assignCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.surfaceBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignCheckboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  assignEmptyState: {
    padding: 40,
    alignItems: 'center',
  },
  assignEmptyText: {
    color: colors.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  assignDoneButton: {
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  assignDoneButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  // Settled celebration modal styles
  settledModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  settledModalContent: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  settledModalEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  settledModalTitle: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  settledModalMessage: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  settledModalButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 999,
  },
  settledModalButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
});
