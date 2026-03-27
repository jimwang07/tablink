import { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors } from '@/src/theme';
import { useReceipts, type ReceiptWithDetails } from '@/src/hooks/useReceipts';
import type { ReceiptStatus } from '@/src/types/receipt';

type Tab = 'yours' | 'shared';

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

/* ── Helpers (logic unchanged) ─────────────────────────────── */

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

  const participantPaymentStatus = new Map<string, string>();
  for (const p of participants) {
    participantPaymentStatus.set(p.id, p.payment_status);
  }

  let totalCents = 0;
  let claimedCents = 0;
  let paidCents = 0;

  for (const item of items) {
    totalCents += item.price_cents;
    for (const claim of item.item_claims || []) {
      claimedCents += claim.amount_cents;
      const paymentStatus = participantPaymentStatus.get(claim.participant_id);
      if (paymentStatus === 'paid') {
        paidCents += claim.amount_cents;
      }
    }
  }

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

/* ── Components ────────────────────────────────────────────── */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

function ReceiptCard({ receipt, index }: { receipt: ReceiptWithDetails; index: number }) {
  const router = useRouter();
  const progress = useMemo(() => calculateProgress(receipt), [receipt]);
  const showProgress = receipt.status !== 'draft' && progress.total > 0;
  const effectiveStatus = useMemo(() => getEffectiveStatus(receipt, progress), [receipt, progress]);
  const accent = STATUS_COLOR[effectiveStatus] || STATUS_COLOR.draft;

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
      </View>

      {showProgress && <ProgressBar data={progress} />}

      <View style={s.cardFooter}>
        <Text style={s.dateText}>
          {receipt.receipt_date ? formatDate(receipt.receipt_date) : ''}
        </Text>
        <Text style={[s.statusText, { color: accent }]}>
          {STATUS_LABEL[effectiveStatus]}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const isYours = tab === 'yours';
  return (
    <Animated.View entering={FadeInDown.duration(500)} style={s.emptyState}>
      <View style={s.emptyIcon}>
        <Ionicons
          name={isYours ? 'receipt-outline' : 'people-outline'}
          size={24}
          color={colors.muted}
        />
      </View>
      <Text style={s.emptyTitle}>
        {isYours ? 'No receipts yet' : 'Nothing shared with you'}
      </Text>
      <Text style={s.emptyDescription}>
        {isYours
          ? 'Scan or upload a receipt to start splitting with friends.'
          : 'When someone shares a receipt with you, it will appear here.'}
      </Text>
      {isYours && (
        <Link href="/scan" asChild>
          <Pressable style={s.emptyButton}>
            <Text style={s.emptyButtonText}>Scan Receipt</Text>
          </Pressable>
        </Link>
      )}
    </Animated.View>
  );
}

function ReceiptList({ receipts, tab }: { receipts: ReceiptWithDetails[]; tab: Tab }) {
  if (receipts.length === 0) return <EmptyState tab={tab} />;

  return (
    <View style={s.receiptList}>
      {receipts.map((receipt, i) => (
        <ReceiptCard key={receipt.id} receipt={receipt} index={i} />
      ))}
    </View>
  );
}

function OwedSummary({ receipts }: { receipts: ReceiptWithDetails[] }) {
  const summary = useMemo(() => {
    let totalOwed = 0;
    let activeCount = 0;

    for (const r of receipts) {
      if (r.status === 'draft' || r.status === 'settled') continue;
      const progress = calculateProgress(r);
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

/* ── Main screen ───────────────────────────────────────────── */

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('yours');
  const { yourReceipts, sharedReceipts, isLoading, refresh } = useReceipts();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const receipts = activeTab === 'yours' ? yourReceipts : sharedReceipts;

  return (
    <View style={s.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {/* Header */}
        <View style={s.header}>
          <Text style={s.heading}>Tablink</Text>
        </View>

        {/* Summary (only when money is owed) */}
        <OwedSummary receipts={yourReceipts} />

        {/* Tabs */}
        <View style={s.tabBar}>
          {(['yours', 'shared'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const count = tab === 'yours' ? yourReceipts.length : sharedReceipts.length;
            return (
              <Pressable key={tab} style={s.tab} onPress={() => setActiveTab(tab)}>
                <Text style={[s.tabText, isActive && s.tabTextActive]}>
                  {tab === 'yours' ? 'Yours' : 'Shared'}
                  {count > 0 && (
                    <Text style={[s.tabCount, isActive && s.tabCountActive]}> {count}</Text>
                  )}
                </Text>
                {isActive && <View style={s.tabIndicator} />}
              </Pressable>
            );
          })}
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ReceiptList receipts={receipts} tab={activeTab} />
        )}
      </ScrollView>

      {/* FAB */}
      <View style={s.fabContainer}>
        <Link href="/scan" asChild>
          <Pressable style={({ pressed }) => [s.fab, pressed && s.fabPressed]}>
            <Ionicons name="add" size={28} color="#000" />
          </Pressable>
        </Link>
      </View>
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
  heading: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
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

  /* Loading */
  loadingContainer: {
    paddingVertical: 80,
    alignItems: 'center',
  },

  /* Receipt list */
  receiptList: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },

  /* Receipt card */
  receiptCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 18,
    marginBottom: 10,
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
    alignItems: 'baseline',
  },
  merchantName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    marginRight: 16,
  },
  totalAmount: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  dateText: {
    color: colors.muted,
    fontSize: 13,
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
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },

  /* FAB */
  fabContainer: {
    position: 'absolute',
    bottom: 36,
    right: 24,
  },
  fab: {
    backgroundColor: colors.primary,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
});
