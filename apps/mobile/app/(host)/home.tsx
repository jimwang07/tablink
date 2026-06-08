import { useCallback, useRef, useState, useMemo } from 'react';
import { Alert, Dimensions, Modal, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonBlock, SkeletonPulse } from '@/src/components/Skeleton';
import { colors } from '@/src/theme';
import { useReceipts, type ReceiptWithDetails } from '@/src/hooks/useReceipts';
import { useAuth } from '@/src/hooks/useAuth';
import {
  deleteReceipt,
  duplicateReceipt,
  getOrCreateShareLink,
  updateReceipt,
} from '@/src/services/receiptService';
import { getSupabaseClient } from '@/src/lib/supabaseClient';
import { shareTablink } from '@/src/lib/shareTablink';
import type { ReceiptStatus } from '@/src/types/receipt';

type Tab = 'active' | 'completed';
type SortMode = 'newest' | 'oldest' | 'status';

const SORT_MODES: SortMode[] = ['newest', 'oldest', 'status'];
const SORT_LABEL: Record<SortMode, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  status: 'Status',
};

type ProgressData = {
  unclaimed: number;
  claimed: number;
  paid: number;
  total: number;
};

/* ── Status config ─────────────────────────────────────────── */

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

/* ── Helpers ───────────────────────────────────────────────── */

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function calculateProgress(receipt: ReceiptWithDetails): ProgressData {
  const items = receipt.receipt_items || [];
  const participants = receipt.receipt_participants || [];
  const receiptSubtotalCents =
    typeof receipt.subtotal_cents === 'number' && receipt.subtotal_cents > 0
      ? receipt.subtotal_cents
      : items.reduce((sum, item) => sum + item.price_cents, 0);
  const extrasCents = (receipt.total_cents || 0) - receiptSubtotalCents;

  const participantPaymentStatus = new Map<string, string>();
  for (const p of participants) {
    participantPaymentStatus.set(p.id, p.payment_status);
  }

  let claimedSubtotalCents = 0;
  let paidSubtotalCents = 0;

  for (const item of items) {
    for (const claim of item.item_claims || []) {
      claimedSubtotalCents += claim.amount_cents;
      const paymentStatus = participantPaymentStatus.get(claim.participant_id);
      if (paymentStatus === 'paid') {
        paidSubtotalCents += claim.amount_cents;
      }
    }
  }

  const claimedExtrasCents =
    receiptSubtotalCents > 0
      ? Math.round((extrasCents * claimedSubtotalCents) / receiptSubtotalCents)
      : 0;
  const paidExtrasCents =
    receiptSubtotalCents > 0
      ? Math.round((extrasCents * paidSubtotalCents) / receiptSubtotalCents)
      : 0;

  const totalCents = receipt.total_cents || receiptSubtotalCents + extrasCents;
  const claimedCents = claimedSubtotalCents + claimedExtrasCents;
  const paidCents = paidSubtotalCents + paidExtrasCents;

  return {
    unclaimed: totalCents - claimedCents,
    claimed: claimedCents - paidCents,
    paid: paidCents,
    total: totalCents,
  };
}

function getEffectiveStatus(receipt: ReceiptWithDetails, progress: ProgressData): ReceiptStatus {
  if (receipt.status === 'settled') return 'settled';
  if (receipt.status === 'draft') return 'draft';
  if (progress.total > 0 && progress.unclaimed === 0 && progress.claimed === 0 && progress.paid > 0) {
    return 'settled';
  }
  return receipt.status;
}

function isReceiptCompleted(receipt: ReceiptWithDetails): boolean {
  const progress = calculateProgress(receipt);
  return getEffectiveStatus(receipt, progress) === 'settled';
}

/* ── Components ────────────────────────────────────────────── */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function HomeSkeleton() {
  return (
    <SkeletonPulse>
      <View style={s.receiptList}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={s.receiptCard}>
            <View style={s.skeletonHeader}>
              <SkeletonBlock width="54%" height={18} />
              <SkeletonBlock width={72} height={18} />
            </View>
            <View style={s.cardMeta}>
              <SkeletonBlock width={64} height={11} />
              <Text style={s.metaSeparator}>•</Text>
              <SkeletonBlock width={56} height={11} />
            </View>
            <View style={s.progressContainer}>
              <SkeletonBlock width="100%" height={3} style={s.skeletonProgressTrack} />
              <View style={s.progressLabels}>
                <SkeletonBlock width={72} height={12} />
                <SkeletonBlock width={84} height={12} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </SkeletonPulse>
  );
}

function ProgressBar({ data }: { data: ProgressData }) {
  if (data.total === 0) return null;

  const paidPct = (data.paid / data.total) * 100;
  const claimedPct = (data.claimed / data.total) * 100;

  return (
    <View style={s.progressContainer}>
      <View style={s.progressTrack}>
        {paidPct > 0 && (
          <View style={[s.progressFill, { width: `${paidPct}%`, backgroundColor: '#34D399' }]} />
        )}
        {claimedPct > 0 && (
          <View style={[s.progressFill, { width: `${claimedPct}%`, backgroundColor: '#FBBF24' }]} />
        )}
      </View>
      <View style={s.progressLabels}>
        {data.paid > 0 && (
          <Text style={[s.progressLabelText, { color: '#34D399' }]}>
            {formatCents(data.paid)} paid
          </Text>
        )}
        {data.claimed > 0 && (
          <Text style={[s.progressLabelText, { color: '#FBBF24' }]}>
            {formatCents(data.claimed)} owed
          </Text>
        )}
        {data.unclaimed > 0 && (
          <Text style={[s.progressLabelText, { color: '#6B7280' }]}>
            {formatCents(data.unclaimed)} unclaimed
          </Text>
        )}
      </View>
    </View>
  );
}

type MenuAnchor = { x: number; y: number };

function ReceiptCard({
  receipt,
  index,
  onMenuPress,
}: {
  receipt: ReceiptWithDetails;
  index: number;
  onMenuPress: (receipt: ReceiptWithDetails, anchor: MenuAnchor) => void;
}) {
  const router = useRouter();
  const btnRef = useRef<View>(null);
  const progress = useMemo(() => calculateProgress(receipt), [receipt]);
  const showProgress = receipt.status !== 'draft' && progress.total > 0;
  const effectiveStatus = useMemo(() => getEffectiveStatus(receipt, progress), [receipt, progress]);
  const accent = STATUS_COLOR[effectiveStatus] || STATUS_COLOR.draft;

  const handleMenuPress = useCallback(() => {
    btnRef.current?.measureInWindow((x, y, width, height) => {
      onMenuPress(receipt, { x: x + width, y: y + height });
    });
  }, [receipt, onMenuPress]);

  return (
    <AnimatedPressable
      entering={FadeInDown.delay(index * 60).duration(400).springify()}
      style={({ pressed }) => [
        s.receiptCard,
        { borderLeftColor: accent },
        pressed && s.receiptCardPressed,
      ]}
      onPress={() => router.push(`/receipt/${receipt.id}`)}
    >
      <View style={s.cardHeader}>
        <Text style={s.merchantName} numberOfLines={1}>
          {receipt.merchant_name || 'Unknown'}
        </Text>
        <Text style={s.totalAmount}>{formatCents(receipt.total_cents)}</Text>
        <Pressable
          ref={btnRef}
          collapsable={false}
          onPress={handleMenuPress}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
          style={({ pressed }) => [s.cardMenuButton, pressed && s.cardMenuButtonPressed]}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
        </Pressable>
      </View>

      <View style={s.cardMeta}>
        <Text style={[s.statusText, { color: accent }]}>
          {STATUS_LABEL[effectiveStatus]}
        </Text>
        {receipt.receipt_date ? (
          <>
            <Text style={s.metaSeparator}>•</Text>
            <Text style={s.dateText}>{formatDate(receipt.receipt_date)}</Text>
          </>
        ) : null}
      </View>

      {showProgress && <ProgressBar data={progress} />}
    </AnimatedPressable>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const isActive = tab === 'active';
  return (
    <Animated.View entering={FadeInDown.duration(500)} style={s.emptyState}>
      <View style={s.emptyIcon}>
        <Ionicons
          name={isActive ? 'receipt-outline' : 'checkmark-done-outline'}
          size={24}
          color={colors.muted}
        />
      </View>
      <Text style={s.emptyTitle}>
        {isActive ? 'No active receipts' : 'No completed receipts'}
      </Text>
      <Text style={s.emptyDescription}>
        {isActive
          ? 'Scan or upload a receipt to start splitting with friends.'
          : 'Fully paid receipts will appear here.'}
      </Text>
      {isActive && (
        <Link href="/scan" asChild>
          <Pressable style={s.emptyButton}>
            <Ionicons name="scan-outline" size={16} color="#04110D" />
            <Text style={s.emptyButtonText}>Scan Receipt</Text>
            <Ionicons name="arrow-forward" size={16} color="#04110D" />
          </Pressable>
        </Link>
      )}
    </Animated.View>
  );
}

function ReceiptList({
  receipts,
  tab,
  onMenuPress,
}: {
  receipts: ReceiptWithDetails[];
  tab: Tab;
  onMenuPress: (receipt: ReceiptWithDetails, anchor: MenuAnchor) => void;
}) {
  if (receipts.length === 0) return <EmptyState tab={tab} />;

  return (
    <View style={s.receiptList}>
      {receipts.map((receipt, i) => (
        <ReceiptCard key={receipt.id} receipt={receipt} index={i} onMenuPress={onMenuPress} />
      ))}
    </View>
  );
}

function OwedSummary({ receipts }: { receipts: ReceiptWithDetails[] }) {
  const summary = useMemo(() => {
    let totalOwed = 0;
    let activeCount = 0;

    for (const r of receipts) {
      const progress = calculateProgress(r);
      const effectiveStatus = getEffectiveStatus(r, progress);
      if (effectiveStatus === 'draft' || effectiveStatus === 'settled') continue;
      if (progress.claimed > 0) {
        totalOwed += progress.claimed;
        activeCount++;
      }
    }

    return { totalOwed, activeCount };
  }, [receipts]);

  if (summary.totalOwed === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={s.summaryContainer}>
      <View style={s.summaryCard}>
        <Text style={s.summaryLabel}>Owed to you</Text>
        <Text style={s.summaryAmount}>{formatCents(summary.totalOwed)}</Text>
        <Text style={s.summaryDetail}>
          across {summary.activeCount} active {summary.activeCount === 1 ? 'receipt' : 'receipts'}
        </Text>
      </View>
    </Animated.View>
  );
}

/* ── Action menu ──────────────────────────────────────────── */

type MenuAction = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color?: string;
  onPress: () => void;
};

function ReceiptActionMenu({
  anchor,
  actions,
  onClose,
}: {
  anchor: MenuAnchor;
  actions: MenuAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const screen = Dimensions.get('window');

  const menuWidth = 200;
  const menuEstimatedHeight = actions.length * 48 + 16;

  // Anchor below-right of the button, clamped to screen
  let top = anchor.y + 4;
  let left = anchor.x - menuWidth;
  if (top + menuEstimatedHeight > screen.height - insets.bottom - 16) {
    top = anchor.y - menuEstimatedHeight - 4;
  }
  if (left < 16) left = 16;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.menuOverlay} onPress={onClose}>
        <Pressable style={[s.menuPopover, { top, left, width: menuWidth }]}>
          {actions.map((action, i) => (
            <Pressable
              key={action.key}
              style={({ pressed }) => [
                s.menuAction,
                i < actions.length - 1 && s.menuActionBorder,
                pressed && s.menuActionPressed,
              ]}
              onPress={action.onPress}
            >
              <Ionicons
                name={action.icon}
                size={18}
                color={action.color || colors.textSecondary}
                style={s.menuActionIcon}
              />
              <Text
                style={[s.menuActionLabel, action.color ? { color: action.color } : undefined]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Main screen ───────────────────────────────────────────── */

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const { yourReceipts, isLoading, refresh, subscribe, unsubscribe } = useReceipts();
  const [menuState, setMenuState] = useState<{
    receipt: ReceiptWithDetails;
    anchor: MenuAnchor;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
      subscribe();
      return unsubscribe;
    }, [refresh, subscribe, unsubscribe])
  );

  const activeReceipts = useMemo(
    () => yourReceipts.filter((receipt) => !isReceiptCompleted(receipt)),
    [yourReceipts]
  );
  const completedReceipts = useMemo(
    () => yourReceipts.filter(isReceiptCompleted),
    [yourReceipts]
  );
  const receipts = activeTab === 'active' ? activeReceipts : completedReceipts;

  const sortedReceipts = useMemo(() => {
    const list = [...receipts];
    switch (sortMode) {
      case 'newest':
        return list.sort((a, b) => {
          const dateA = new Date(a.receipt_date ?? a.created_at).getTime();
          const dateB = new Date(b.receipt_date ?? b.created_at).getTime();
          return dateB - dateA;
        });
      case 'oldest':
        return list.sort((a, b) => {
          const dateA = new Date(a.receipt_date ?? a.created_at).getTime();
          const dateB = new Date(b.receipt_date ?? b.created_at).getTime();
          return dateA - dateB;
        });
      case 'status': {
        return list.sort((a, b) => {
          const pa = calculateProgress(a);
          const pb = calculateProgress(b);
          const scoreA = pa.total > 0 ? (pa.paid + pa.claimed) / pa.total : 0;
          const scoreB = pb.total > 0 ? (pb.paid + pb.claimed) / pb.total : 0;
          return scoreA - scoreB;
        });
      }
    }
  }, [receipts, sortMode]);

  const cycleSort = useCallback(() => {
    setSortMode((prev) => SORT_MODES[(SORT_MODES.indexOf(prev) + 1) % SORT_MODES.length]);
  }, []);

  const TABLINK_BASE_URL = process.env.EXPO_PUBLIC_TABLINK_URL;

  const handleMenuShare = useCallback(async (receipt: ReceiptWithDetails) => {
    setMenuState(null);
    const userId = session?.user?.id;
    if (!userId || !receipt.id) return;

    // Check payment methods
    const supabase = getSupabaseClient();
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('venmo_handle, cashapp_handle, paypal_handle')
      .eq('user_id', userId)
      .single();

    const hasPayment = !!(
      profile?.venmo_handle ||
      profile?.cashapp_handle ||
      profile?.paypal_handle
    );

    if (!hasPayment) {
      Alert.alert(
        'Set Up Payment Methods',
        'Before sharing a receipt, add your payment info (Venmo, CashApp, etc.) so guests can pay you.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Settings', onPress: () => router.push('/(host)/settings') },
        ]
      );
      return;
    }

    if (!TABLINK_BASE_URL) {
      Alert.alert('Configuration Error', 'Missing Tablink share URL configuration.');
      return;
    }

    try {
      if (receipt.status === 'draft') {
        const result = await updateReceipt(receipt.id, { status: 'shared' });
        if (!result.success) {
          Alert.alert('Error', result.error || 'Failed to activate receipt');
          return;
        }
      }

      const linkResult = await getOrCreateShareLink(receipt.id);
      if (!linkResult.success) {
        Alert.alert('Error', linkResult.error || 'Failed to generate share link');
        return;
      }

      const tablinkUrl = `${TABLINK_BASE_URL}/claim/${linkResult.shortCode}`;
      await shareTablink({ tablinkUrl, merchantName: receipt.merchant_name });
    } catch (err) {
      console.error('[Home] Share error:', err);
      Alert.alert('Error', 'Failed to share tablink');
    }
  }, [session?.user?.id, TABLINK_BASE_URL, router]);

  const handleMenuDuplicate = useCallback(async (receipt: ReceiptWithDetails) => {
    setMenuState(null);
    const userId = session?.user?.id;
    if (!userId) return;

    try {
      const result = await duplicateReceipt(receipt.id, userId);
      if (result.success && result.newReceiptId) {
        await refresh();
        router.push(`/receipt/${result.newReceiptId}`);
      } else {
        Alert.alert('Error', result.error || 'Failed to duplicate receipt');
      }
    } catch (err) {
      console.error('[Home] Duplicate error:', err);
      Alert.alert('Error', 'Failed to duplicate receipt');
    }
  }, [session?.user?.id, refresh, router]);

  const handleMenuDelete = useCallback((receipt: ReceiptWithDetails) => {
    setMenuState(null);
    Alert.alert(
      'Delete Receipt',
      'Are you sure you want to delete this receipt? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await deleteReceipt(receipt.id);
              if (result.success) {
                refresh();
              } else {
                Alert.alert('Error', result.error || 'Failed to delete receipt');
              }
            } catch (err) {
              console.error('[Home] Delete error:', err);
              Alert.alert('Error', 'Failed to delete receipt');
            }
          },
        },
      ]
    );
  }, [refresh]);

  const handleOpenMenu = useCallback(
    (receipt: ReceiptWithDetails, anchor: MenuAnchor) => {
      setMenuState({ receipt, anchor });
    },
    []
  );

  const menuActions = useMemo<MenuAction[]>(() => {
    if (!menuState) return [];
    const { receipt } = menuState;
    return [
      {
        key: 'share',
        label: 'Share Tablink',
        icon: 'link-outline',
        onPress: () => handleMenuShare(receipt),
      },
      {
        key: 'duplicate',
        label: 'Duplicate',
        icon: 'copy-outline',
        onPress: () => handleMenuDuplicate(receipt),
      },
      {
        key: 'delete',
        label: 'Delete',
        icon: 'trash-outline',
        color: colors.danger,
        onPress: () => handleMenuDelete(receipt),
      },
    ];
  }, [menuState, handleMenuShare, handleMenuDuplicate, handleMenuDelete]);

  return (
    <View style={s.container}>
      <ScrollView contentInsetAdjustmentBehavior="never">
        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top + 16 }]}>
          <View style={s.headerRow}>
            <Text style={s.heading}>
              <Text>Tab</Text>
              <Text style={s.headingAccent}>link</Text>
            </Text>
            {!isLoading && (
              <Link href="/scan" asChild>
                <Pressable style={({ pressed }) => [s.scanButton, pressed && s.scanButtonPressed]}>
                  <View style={s.scanButtonContent}>
                    <Ionicons name="scan-outline" size={16} color={colors.primary} />
                    <Text style={s.scanButtonText}>Scan</Text>
                  </View>
                </Pressable>
              </Link>
            )}
          </View>
        </View>

        {/* Summary (only when money is owed) */}
        <OwedSummary receipts={yourReceipts} />

        {/* Tabs */}
        <View style={s.tabBar}>
          {(['active', 'completed'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const count = tab === 'active' ? activeReceipts.length : completedReceipts.length;
            return (
              <Pressable key={tab} style={s.tab} onPress={() => setActiveTab(tab)}>
                <Text style={[s.tabText, isActive && s.tabTextActive]}>
                  {tab === 'active' ? 'Active' : 'Completed'}
                  {count > 0 && (
                    <Text style={[s.tabCount, isActive && s.tabCountActive]}> {count}</Text>
                  )}
                </Text>
                {isActive && <View style={s.tabIndicator} />}
              </Pressable>
            );
          })}
          <Pressable
            style={({ pressed }) => [s.sortButton, pressed && s.sortButtonPressed]}
            onPress={cycleSort}
          >
            <Ionicons name="swap-vertical" size={14} color={colors.muted} />
            <Text style={s.sortLabel}>Sort: </Text>
            <Text style={s.sortValue}>{SORT_LABEL[sortMode]}</Text>
          </Pressable>
        </View>

        {/* Content */}
        {isLoading ? (
          <HomeSkeleton />
        ) : (
          <ReceiptList receipts={sortedReceipts} tab={activeTab} onMenuPress={handleOpenMenu} />
        )}
      </ScrollView>

      {menuState && (
        <ReceiptActionMenu
          anchor={menuState.anchor}
          actions={menuActions}
          onClose={() => setMenuState(null)}
        />
      )}
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* Header */
  header: {
    paddingTop: 60,
    paddingBottom: 4,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  heading: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  headingAccent: {
    color: colors.primary,
  },
  scanButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.18)',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexShrink: 0,
  },
  scanButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanButtonPressed: {
    opacity: 0.82,
  },
  scanButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
    flexShrink: 0,
    marginLeft: 8,
  },

  /* Summary */
  summaryContainer: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 8,
  },
  summaryCard: {
    backgroundColor: 'rgba(52, 211, 153, 0.06)',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.10)',
  },
  summaryLabel: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  summaryAmount: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  summaryDetail: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },

  /* Tabs */
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 28,
    marginTop: 18,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  tab: {
    paddingBottom: 12,
    position: 'relative',
  },
  tabText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  tabCount: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
  tabCountActive: {
    color: colors.textSecondary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },

  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonProgressTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },

  /* Sort */
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 'auto',
    paddingBottom: 12,
  },
  sortButtonPressed: {
    opacity: 0.5,
  },
  sortLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  sortValue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  /* Receipt list */
  receiptList: {
    paddingHorizontal: 24,
    paddingBottom: 120,
    gap: 14,
  },

  /* Receipt card */
  receiptCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderLeftWidth: 3,
  },
  receiptCardPressed: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  merchantName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  cardMenuButton: {
    marginLeft: 6,
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  cardMenuButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  totalAmount: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  dateText: {
    color: colors.muted,
    fontSize: 13,
  },
  metaSeparator: {
    color: colors.muted,
    fontSize: 12,
    marginHorizontal: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  /* Progress */
  progressContainer: {
    marginTop: 14,
    marginBottom: 10,
  },
  progressTrack: {
    flexDirection: 'row',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabels: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
  },
  progressLabelText: {
    fontSize: 12,
    fontWeight: '500',
  },

  /* Empty state */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 48,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  emptyButton: {
    marginTop: 28,
    backgroundColor: '#57E6AE',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(87, 230, 174, 0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#57E6AE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  emptyButtonText: {
    color: '#04110D',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  /* Action menu */
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  menuPopover: {
    position: 'absolute',
    borderRadius: 12,
    backgroundColor: '#1A1F25',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 20,
  },
  menuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuActionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  menuActionPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  menuActionIcon: {
    width: 28,
  },
  menuActionLabel: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
});
