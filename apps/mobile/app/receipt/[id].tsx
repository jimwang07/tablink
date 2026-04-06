import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
import { Confetti } from '@/src/components/Confetti';
import { getSupabaseClient } from '@/src/lib/supabaseClient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  FadeOut,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/src/theme';
import { useAuth } from '@/src/hooks/useAuth';
import {
  fetchReceipt,
  getOrCreateShareLink,
  pickUniqueParticipantEmoji,
  updateReceipt,
  updateReceiptItems,
  deleteReceipt,
  type ReceiptWithItems,
  type ReceiptItem,
} from '@/src/services/receiptService';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/* ── Types ─────────────────────────────────────────────────── */

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
  id?: string;
  name: string;
  price: string;
  quantity: string;
};

/* ── Status config (matches home screen) ───────────────────── */

type ReceiptStatus = 'draft' | 'ready' | 'shared' | 'partially_claimed' | 'fully_claimed' | 'settled';
const TIP_PRESET_PERCENTS = [15, 18, 20] as const;

const STATUS_COLOR: Record<ReceiptStatus, string> = {
  draft: '#6B7280',
  ready: '#FBBF24',
  shared: '#FBBF24',
  partially_claimed: '#60A5FA',
  fully_claimed: '#60A5FA',
  settled: '#34D399',
};

const STATUS_LABEL: Record<ReceiptStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  shared: 'Shared',
  partially_claimed: 'In Progress',
  fully_claimed: 'Claimed',
  settled: 'Settled',
};

/* ── Helpers (logic unchanged) ─────────────────────────────── */

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
    id: item.id,
    name: item.label,
    price: toCurrencyString(centsToDollars(item.price_cents)),
    quantity: item.quantity.toString(),
  }));
}

/* ── Skeleton loading ──────────────────────────────────────── */

function SkeletonPulse({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 900 }),
      -1,
      true
    );
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function SkeletonBar({ width, height = 14 }: { width: number | `${number}%`; height?: number }) {
  return (
    <View style={{ width, height, borderRadius: 6, backgroundColor: 'rgba(255, 255, 255, 0.06)' }} />
  );
}

function ReceiptSkeleton({ hasImage }: { hasImage: boolean }) {
  return (
    <SkeletonPulse>
      {/* Image placeholder */}
      {hasImage && (
        <View style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 4 }}>
          <SkeletonBar width="100%" height={200} />
        </View>
      )}
      {/* Merchant section */}
      <View style={skeletonStyles.section}>
        <SkeletonBar width={80} height={12} />
        <SkeletonBar width="100%" height={44} />
      </View>
      {/* Items section */}
      <View style={skeletonStyles.section}>
        <SkeletonBar width={50} height={12} />
        <SkeletonBar width="100%" height={40} />
        <SkeletonBar width="100%" height={40} />
        <SkeletonBar width="85%" height={40} />
      </View>
      {/* Totals section */}
      <View style={skeletonStyles.section}>
        <SkeletonBar width={60} height={12} />
        <View style={skeletonStyles.row}>
          <SkeletonBar width={100} />
          <SkeletonBar width={60} />
        </View>
        <View style={skeletonStyles.row}>
          <SkeletonBar width={40} />
          <SkeletonBar width={60} />
        </View>
        <View style={skeletonStyles.row}>
          <SkeletonBar width={40} />
          <SkeletonBar width={60} />
        </View>
      </View>
      {/* Participants section */}
      <View style={skeletonStyles.section}>
        <SkeletonBar width={100} height={12} />
        <SkeletonBar width="100%" height={44} />
        <View style={skeletonStyles.row}>
          <SkeletonBar width={28} height={28} />
          <SkeletonBar width={120} />
        </View>
      </View>
    </SkeletonPulse>
  );
}

const skeletonStyles = StyleSheet.create({
  section: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

/* ── Main component ────────────────────────────────────────── */

export default function ReceiptDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    merchant?: string;
    date?: string;
    total?: string;
    status?: string;
    hasImage?: string;
  }>();
  const { id } = params;
  const router = useRouter();
  const { user } = useAuth();

  // Preview data passed from home screen for instant header render
  const preview = {
    merchant: params.merchant || '',
    date: params.date || '',
    total: params.total ? Number(params.total) : 0,
    status: (params.status as ReceiptStatus) || 'draft',
    hasImage: params.hasImage === '1',
  };

  const [receipt, setReceipt] = useState<ReceiptWithItems | null>(null);
  const [hasPaymentMethods, setHasPaymentMethods] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isImageExpanded, setIsImageExpanded] = useState(false);

  const TABLINK_BASE_URL = process.env.EXPO_PUBLIC_TABLINK_URL;

  // Editable state
  const [merchantName, setMerchantName] = useState('');
  const [taxInput, setTaxInput] = useState('0.00');
  const [tipInput, setTipInput] = useState('0.00');
  const [customTipPercentInput, setCustomTipPercentInput] = useState('');
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

        if (r.image_path) {
          const supabase = getSupabaseClient();
          const { data, error } = await supabase.storage
            .from('receipts')
            .createSignedUrl(r.image_path, 3600);
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

    async function fetchClaimsAndParticipants() {
      if (itemIds.length > 0) {
        const { data: claimsData } = await supabase
          .from('item_claims')
          .select('id, item_id, participant_id, portion, amount_cents')
          .in('item_id', itemIds);
        if (claimsData) setClaims(claimsData);
      }

      const { data: participantsData } = await supabase
        .from('receipt_participants')
        .select('id, display_name, emoji, color_token, role, payment_status, paid_at, payment_method, payment_amount_cents')
        .eq('receipt_id', id);
      if (participantsData) setParticipants(participantsData);
    }

    fetchClaimsAndParticipants();

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

  const getItemClaimers = useCallback((itemKey: string) => {
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

  const effectiveStatus = useMemo((): ReceiptStatus => {
    if (!receipt) return 'draft';
    if (receipt.status === 'settled') return 'settled';
    if (receipt.status === 'draft') return 'draft';

    const itemKeys = editableItems.map(item => item.key);
    if (itemKeys.length > 0 && claims.length > 0 && participants.length > 0) {
      const allItemsClaimed = itemKeys.every(key => claims.some(c => c.item_id === key));
      if (!allItemsClaimed) {
        return receipt.status as ReceiptStatus;
      }

      const paidParticipants = new Set(
        participants.filter(p => p.payment_status === 'paid').map(p => p.id)
      );

      const allClaimsPaid = claims.every(c => paidParticipants.has(c.participant_id));

      if (allClaimsPaid) {
        return 'settled';
      }
    }

    return receipt.status as ReceiptStatus;
  }, [receipt, claims, participants, editableItems]);

  // Trigger confetti when receipt becomes settled
  useEffect(() => {
    if (!id || !receipt) return;

    const isSettled = effectiveStatus === 'settled';

    const markCelebrationShown = async () => {
      const supabase = getSupabaseClient();
      await supabase
        .from('receipts')
        .update({ celebration_shown: true } as any)
        .eq('id', id);
    };

    if (!initialCheckDoneRef.current) {
      initialCheckDoneRef.current = true;
      wasSettledRef.current = isSettled;

      if (isSettled && receipt.celebration_shown !== true) {
        setShowConfetti(true);
        setShowSettledModal(true);
        markCelebrationShown();
      }
      return;
    }

    if (isSettled && !wasSettledRef.current && receipt.celebration_shown !== true) {
      wasSettledRef.current = true;
      setShowConfetti(true);
      setShowSettledModal(true);
      markCelebrationShown();
    }

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

      const itemsToSave = editableItems.map((item, index) => ({
        id: item.id,
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

    if (!hasPaymentMethods) {
      Alert.alert(
        'Set Up Payment Methods',
        'Before sharing a receipt, add your payment info (Venmo, CashApp, etc.) so guests can pay you.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Settings',
            onPress: () => {
              router.dismiss();
              setTimeout(() => {
                router.push('/(host)/settings');
              }, 50);
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

      if (receipt.status === 'draft') {
        const result = await updateReceipt(id, { status: 'shared' });
        if (!result.success) {
          Alert.alert('Error', result.error || 'Failed to activate receipt');
          return;
        }
        setReceipt({ ...receipt, status: 'shared' as any });
      }

      const linkResult = await getOrCreateShareLink(id);
      if (!linkResult.success) {
        Alert.alert('Error', linkResult.error || 'Failed to generate share link');
        return;
      }

      const tablinkUrl = `${TABLINK_BASE_URL}/claim/${linkResult.shortCode}`;

      const result = await Share.share({
        message: `Split the bill with me! ${receipt.merchant_name ? `(${receipt.merchant_name})` : ''}\n${tablinkUrl}`,
        url: tablinkUrl,
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

  const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#74b9ff', '#fd79a8'];

  const handleAddParticipant = useCallback(async () => {
    if (!id || !newParticipantName.trim()) return;

    setIsAddingParticipant(true);
    try {
      const supabase = getSupabaseClient();
      const emoji = pickUniqueParticipantEmoji(
        participants
          .map((participant) => participant.emoji)
          .filter((value): value is string => Boolean(value))
      );
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
  }, [id, newParticipantName, participants]);

  const handleRemoveParticipant = useCallback(async (participantId: string) => {
    const participant = participants.find(p => p.id === participantId);
    if (!participant) return;

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
        const { error: deleteError } = await supabase
          .from('item_claims')
          .delete()
          .eq('id', existingClaim.id);

        if (deleteError) throw deleteError;

        const remainingClaims = claims.filter(c => c.item_id === itemKey && c.id !== existingClaim.id);
        if (remainingClaims.length > 0) {
          const newAmount = Math.round(itemPrice / remainingClaims.length);
          await supabase
            .from('item_claims')
            .update({ amount_cents: newAmount })
            .eq('item_id', itemKey);

          setClaims(prev => prev
            .filter(c => c.id !== existingClaim.id)
            .map(c => c.item_id === itemKey ? { ...c, amount_cents: newAmount } : c)
          );
        } else {
          setClaims(prev => prev.filter(c => c.id !== existingClaim.id));
        }
      } else {
        const existingClaimsCount = claims.filter(c => c.item_id === itemKey).length;
        const newTotalClaimers = existingClaimsCount + 1;
        const newAmount = Math.round(itemPrice / newTotalClaimers);

        const { data, error: insertError } = await supabase
          .from('item_claims')
          .insert({
            item_id: itemKey,
            participant_id: participantId,
            portion: 1,
            amount_cents: newAmount,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        if (existingClaimsCount > 0) {
          await supabase
            .from('item_claims')
            .update({ amount_cents: newAmount })
            .eq('item_id', itemKey);
        }

        setClaims(prev => [
          ...prev.map(c => c.item_id === itemKey ? { ...c, amount_cents: newAmount } : c),
          data,
        ]);
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

  /* ── Render ──────────────────────────────────────────────── */

  const statusColor = STATUS_COLOR[effectiveStatus] || STATUS_COLOR.draft;
  const anyBusy = isSaving || isDeleting || isSharing;

  if (isLoading) {
    const previewColor = STATUS_COLOR[preview.status] || STATUS_COLOR.draft;
    return (
      <View style={s.container}>
        <ScrollView contentContainerStyle={s.content} contentInsetAdjustmentBehavior="automatic">
          <View style={s.header}>
            <Pressable onPress={() => router.back()} style={s.backArrow}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
            <View style={s.headerContent}>
              <Text style={s.title} numberOfLines={1}>
                {preview.merchant || 'Receipt'}
              </Text>
              {preview.date ? (
                <Text style={s.subtitle}>{formatDate(preview.date)}</Text>
              ) : null}
            </View>
            <Text style={[s.statusLabel, { color: previewColor }]}>
              {STATUS_LABEL[preview.status]}
            </Text>
          </View>
          <ReceiptSkeleton hasImage={preview.hasImage} />
        </ScrollView>
      </View>
    );
  }

  if (error || !receipt) {
    return (
      <View style={s.centered}>
        <Text style={s.errorText}>{error || 'Receipt not found'}</Text>
        <Pressable style={({ pressed }) => [s.backButton, pressed && s.pressed]} onPress={() => router.back()}>
          <Text style={s.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backArrow, pressed && s.pressed]}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={s.headerContent}>
            <Text style={s.title} numberOfLines={1}>
              {receipt.merchant_name || 'Receipt'}
            </Text>
            <Text style={s.subtitle}>{formatDate(receipt.receipt_date)}</Text>
          </View>
          <Text style={[s.statusLabel, { color: statusColor }]}>
            {STATUS_LABEL[effectiveStatus]}
          </Text>
        </View>

        {/* ── Receipt image ── */}
        {receipt.image_path && (
          <View style={s.imageCard}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={s.receiptImage} resizeMode="cover" />
            ) : (
              <View style={[s.receiptImage, s.imagePlaceholder]}>
                <SkeletonPulse>
                  <SkeletonBar width="100%" height={200} />
                </SkeletonPulse>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [s.expandButton, pressed && s.pressed]}
              onPress={() => setIsImageExpanded(true)}
              disabled={!imageUrl}
            >
              <Text style={s.expandButtonText}>View full receipt</Text>
            </Pressable>
          </View>
        )}

        {/* ── Merchant ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Merchant</Text>
          <TextInput
            value={merchantName}
            onChangeText={setMerchantName}
            placeholder="Add merchant name"
            placeholderTextColor={colors.muted}
            style={s.textInput}
          />
        </View>

        {/* ── Items ── */}
        <View style={s.section}>
          <View style={s.cardHeader}>
            <Text style={s.sectionLabel}>Items</Text>
            <Pressable style={({ pressed }) => [pressed && s.pressed]} onPress={addItem}>
              <Text style={s.addButtonText}>+ Add item</Text>
            </Pressable>
          </View>
          <Text style={s.hint}>
            Tap <Ionicons name="person-add-outline" size={12} color={colors.muted} /> to assign. Swipe left to delete.
          </Text>
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
                {(() => {
                  const itemClaimers = getItemClaimers(item.key);
                  const isPaid = itemClaimers.length > 0 && itemClaimers.every(c => c.payment_status === 'paid');
                  const isClaimed = itemClaimers.length > 0 && !isPaid;

                  return (
                    <View style={[s.itemRow, isClaimed && s.itemRowClaimed, isPaid && s.itemRowPaid]}>
                      <Pressable
                        style={s.assignButton}
                        onPress={() => handleItemLongPress(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={isPaid ? 'checkmark-circle' : itemClaimers.length > 0 ? 'people' : 'person-add-outline'}
                          size={18}
                          color={isPaid ? colors.primary : isClaimed ? '#FBBF24' : colors.muted}
                        />
                      </Pressable>
                      <View style={s.itemMainContent}>
                        <View style={s.itemNameRow}>
                          <TextInput
                            value={item.name}
                            onChangeText={(value) => updateItemField(item.key, 'name', value)}
                            placeholder="Item name"
                            placeholderTextColor={colors.muted}
                            style={s.itemNameInput}
                          />
                          <View style={s.itemQtyGroup}>
                            <Text style={s.itemQtyPrefix}>×</Text>
                            <TextInput
                              value={item.quantity}
                              onChangeText={(value) => updateItemField(item.key, 'quantity', value)}
                              placeholder="1"
                              placeholderTextColor={colors.muted}
                              keyboardType="decimal-pad"
                              style={s.itemQtyInput}
                            />
                          </View>
                          {isPaid && (
                            <Text style={s.paidTag}>Paid</Text>
                          )}
                        </View>
                        {itemClaimers.length > 0 && (
                          <View style={s.claimerBadges}>
                            {itemClaimers.map(claimer => (
                              <View
                                key={claimer.id}
                                style={[s.claimerBadge, { borderLeftColor: claimer.color_token ?? colors.primary }]}
                              >
                                <Text style={s.claimerEmoji}>{claimer.emoji}</Text>
                                <Text style={s.claimerName}>{claimer.display_name}</Text>
                                {claimer.payment_status === 'paid' && (
                                  <Ionicons name="checkmark" size={12} color={colors.primary} />
                                )}
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                      <View style={s.itemRightSection}>
                        <TextInput
                          value={item.price}
                          onChangeText={(value) => updateItemField(item.key, 'price', value)}
                          placeholder="0.00"
                          placeholderTextColor={colors.muted}
                          keyboardType="decimal-pad"
                          style={s.itemPriceInput}
                        />
                      </View>
                    </View>
                  );
                })()}
              </Swipeable>
            </Animated.View>
          ))}
        </View>

        {/* ── Totals ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Totals</Text>
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
              placeholderTextColor={colors.muted}
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
              placeholderTextColor={colors.muted}
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
                  placeholderTextColor={colors.muted}
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
        </View>

        {/* ── Participants ── */}
        <View style={s.section}>
          <View style={s.cardHeader}>
            <Text style={s.sectionLabel}>Participants</Text>
            <Text style={s.participantCount}>{participants.length}</Text>
          </View>

          <View style={s.addParticipantRow}>
            <TextInput
              value={newParticipantName}
              onChangeText={setNewParticipantName}
              onSubmitEditing={handleAddParticipant}
              placeholder="Add a name..."
              placeholderTextColor={colors.muted}
              style={[s.textInput, { flex: 1 }]}
              returnKeyType="done"
            />
            <Pressable
              style={({ pressed }) => [
                s.addParticipantButton,
                (!newParticipantName.trim() || isAddingParticipant) && s.buttonDisabled,
                pressed && s.pressed,
              ]}
              onPress={handleAddParticipant}
              disabled={!newParticipantName.trim() || isAddingParticipant}
            >
              {isAddingParticipant ? (
                <Text style={s.addParticipantLoadingText}>Adding...</Text>
              ) : (
                <Ionicons name="add" size={20} color={colors.primary} />
              )}
            </Pressable>
          </View>

          {participants.length > 0 ? (
            <View style={s.participantList}>
              {participants.map(p => {
                const participantClaims = claims.filter(c => c.participant_id === p.id);
                const claimsTotal = participantClaims.reduce((sum, c) => sum + c.amount_cents, 0);
                const itemsTotal = editableItems.reduce((sum, item) => {
                  const price = parseCurrencyInput(item.price);
                  return sum + dollarsToCents(price);
                }, 0);
                const share = itemsTotal > 0 ? claimsTotal / itemsTotal : 0;
                const pTax = Math.round(parseCurrencyInput(taxInput) * 100 * share);
                const pTip = Math.round(parseCurrencyInput(tipInput) * 100 * share);
                const participantTotal = claimsTotal + pTax + pTip;

                const isOwner = p.role === 'owner';

                return (
                  <View key={p.id} style={s.participantRow}>
                    <View style={s.participantInfo}>
                      <Text style={s.participantEmoji}>{p.emoji || '👤'}</Text>
                      <View style={s.participantNameAndAmount}>
                        <View style={s.participantNameRow}>
                          <Text style={s.participantName}>{p.display_name}</Text>
                          {isOwner && <Text style={s.participantYouLabel}>(You)</Text>}
                        </View>
                        {participantTotal > 0 && (
                          <Text style={s.participantAmount}>
                            {formatCurrency(participantTotal / 100)}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={s.participantActions}>
                      {participantTotal > 0 && (
                        <Text style={[
                          s.paymentTag,
                          { color: p.payment_status === 'paid' ? '#34D399' : '#FBBF24' },
                        ]}>
                          {p.payment_status === 'paid' ? 'Paid' : 'Pending'}
                        </Text>
                      )}
                      {!isOwner && (
                        <Pressable
                          onPress={() => handleRemoveParticipant(p.id)}
                          style={({ pressed }) => [s.removeParticipantButton, pressed && s.pressed]}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="close-circle" size={22} color={colors.muted} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={s.noParticipantsText}>
              Add names of people splitting this bill. They can select their name when they open the tablink.
            </Text>
          )}
        </View>

        {/* ── Actions ── */}
        <View style={s.actions}>
          <Pressable
            style={({ pressed }) => [s.shareButton, anyBusy && s.buttonDisabled, pressed && s.ctaPressed]}
            onPress={handleShare}
            disabled={anyBusy}
          >
            {isSharing ? (
              <>
                <Ionicons name="share-outline" size={16} color="#04110D" />
                <Text style={s.shareButtonText}>Sharing...</Text>
                <Ionicons name="arrow-forward" size={16} color="#04110D" />
              </>
            ) : (
              <>
                <Ionicons name="share-outline" size={16} color="#04110D" />
                <Text style={s.shareButtonText}>Share Tablink</Text>
                <Ionicons name="arrow-forward" size={16} color="#04110D" />
              </>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.saveButton, anyBusy && s.buttonDisabled, pressed && s.pressed]}
            onPress={handleSave}
            disabled={anyBusy}
          >
            {isSaving ? (
              <Text style={s.saveButtonText}>Saving...</Text>
            ) : (
              <Text style={s.saveButtonText}>Save Changes</Text>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.deleteAction, anyBusy && s.buttonDisabled, pressed && s.pressed]}
            onPress={handleDelete}
            disabled={anyBusy}
          >
            {isDeleting ? (
              <Text style={s.deleteText}>Deleting...</Text>
            ) : (
              <Text style={s.deleteText}>Delete Receipt</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Full image modal ── */}
      <Modal
        visible={isImageExpanded}
        animationType="fade"
        transparent
        onRequestClose={() => setIsImageExpanded(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalContent}>
            {imageUrl && (
              <Image
                source={{ uri: imageUrl }}
                resizeMode="contain"
                style={s.modalImage}
              />
            )}
            <Pressable
              style={({ pressed }) => [s.modalCloseButton, pressed && s.pressed]}
              onPress={() => setIsImageExpanded(false)}
            >
              <Text style={s.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Assignment modal ── */}
      <Modal
        visible={assigningItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setAssigningItem(null)}
      >
        <Pressable
          style={s.assignModalBackdrop}
          onPress={() => setAssigningItem(null)}
        >
          <Pressable style={s.assignModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={s.assignModalHeader}>
              <View>
                <Text style={s.assignModalTitle}>Assign Item</Text>
                <Text style={s.assignModalItemName} numberOfLines={1}>
                  {assigningItem?.name || 'Untitled item'}
                </Text>
              </View>
              <Pressable
                onPress={() => setAssigningItem(null)}
                style={({ pressed }) => [s.assignModalCloseButton, pressed && s.pressed]}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            {(() => {
              const itemClaimers = assigningItem ? getItemClaimers(assigningItem.key) : [];
              const isItemSettled = itemClaimers.length > 0 && itemClaimers.every(c => c.payment_status === 'paid');

              if (isItemSettled) {
                return (
                  <View style={s.assignEmptyState}>
                    <Text style={s.assignEmptyText}>
                      This item has already been paid for and cannot be reassigned.
                    </Text>
                  </View>
                );
              }

              return participants.length > 0 ? (
                <View style={s.assignParticipantList}>
                  {participants.map(p => {
                    const isAssigned = assigningItem
                      ? claims.some(c => c.item_id === assigningItem.key && c.participant_id === p.id)
                      : false;

                    return (
                      <Pressable
                        key={p.id}
                        style={[
                          s.assignParticipantRow,
                          isAssigned && s.assignParticipantRowSelected,
                        ]}
                        onPress={() => handleToggleClaim(p.id)}
                        disabled={isUpdatingClaim}
                      >
                        <View style={s.assignParticipantInfo}>
                          <Text style={s.assignParticipantEmoji}>{p.emoji || '👤'}</Text>
                          <Text style={s.assignParticipantName}>{p.display_name}</Text>
                        </View>
                        <View style={[
                          s.assignCheckbox,
                          isAssigned && s.assignCheckboxChecked,
                        ]}>
                          {isAssigned && (
                            <Ionicons name="checkmark" size={16} color="#000" />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={s.assignEmptyState}>
                  <Text style={s.assignEmptyText}>
                    Add participants first to assign items
                  </Text>
                </View>
              );
            })()}

            <Pressable
              style={({ pressed }) => [s.assignDoneButton, pressed && s.ctaPressed]}
              onPress={() => setAssigningItem(null)}
            >
              <Text style={s.assignDoneButtonText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Settled celebration modal ── */}
      <Modal
        visible={showSettledModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSettledModal(false)}
      >
        <Pressable
          style={s.settledModalBackdrop}
          onPress={() => setShowSettledModal(false)}
        >
          <View style={s.settledModalContent}>
            <Text style={s.settledModalEmoji}>🎉</Text>
            <Text style={s.settledModalTitle}>All Settled!</Text>
            <Text style={s.settledModalMessage}>
              Everyone has paid their share for this receipt. Nice work!
            </Text>
            <Pressable
              style={({ pressed }) => [s.settledModalButton, pressed && s.ctaPressed]}
              onPress={() => setShowSettledModal(false)}
            >
              <Text style={s.settledModalButtonText}>Awesome!</Text>
            </Pressable>
          </View>
        </Pressable>

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

/* ── Styles ────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  backButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
    marginBottom: 4,
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
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: colors.background,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  itemRowClaimed: {
    borderLeftColor: '#FBBF24',
    backgroundColor: '#1F1E19',
  },
  itemRowPaid: {
    borderLeftColor: '#34D399',
    backgroundColor: '#131F20',
  },
  assignButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
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
  itemQtyGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  itemNameInput: {
    color: colors.text,
    fontSize: 15,
    paddingVertical: 4,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    flex: 1,
  },
  paidTag: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
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
    color: colors.muted,
    fontSize: 11,
  },
  itemRightSection: {
    alignItems: 'flex-end',
    paddingVertical: 12,
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

  /* Participants */
  participantCount: {
    color: colors.muted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  addParticipantRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addParticipantButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addParticipantLoadingText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  participantList: {
    gap: 0,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
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
    color: colors.muted,
    fontSize: 13,
  },
  participantAmount: {
    color: colors.textSecondary,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  participantActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  removeParticipantButton: {
    padding: 4,
  },
  noParticipantsText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  saveButton: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  saveButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  deleteAction: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
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

  /* Assignment modal */
  assignModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  assignModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '70%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  assignModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  assignModalTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
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
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  assignParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  assignParticipantRowSelected: {
    backgroundColor: 'rgba(52, 211, 153, 0.06)',
    marginHorizontal: -24,
    paddingHorizontal: 24,
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    marginHorizontal: 24,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  assignDoneButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },

  /* Settled celebration modal */
  settledModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  settledModalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  settledModalEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  settledModalTitle: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
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
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  settledModalButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
