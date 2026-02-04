import { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusBadge({ status }: { status: ReceiptStatus }) {
  const config: Record<ReceiptStatus, { label: string; bg: string; text: string }> = {
    draft: { label: 'Draft', bg: colors.surfaceBorder, text: colors.textSecondary },
    ready: { label: 'Ready', bg: '#5A4D2D', text: '#F2C94C' },
    shared: { label: 'Shared', bg: '#5A4D2D', text: '#F2C94C' },
    partially_claimed: { label: 'Partial', bg: '#5A4D2D', text: '#F2C94C' },
    fully_claimed: { label: 'Claimed', bg: '#2D4A5A', text: '#56CCF2' },
    settled: { label: 'Settled', bg: '#2D5A3D', text: '#6FCF97' },
  };

  const { label, bg, text } = config[status] || config.draft;

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
    </View>
  );
}

function calculateProgress(receipt: ReceiptWithDetails): ProgressData {
  const items = receipt.receipt_items || [];
  const participants = receipt.receipt_participants || [];

  // Build a map of participant_id -> payment_status
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
      // Check if the participant who made this claim has paid
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

function ProgressBar({ data }: { data: ProgressData }) {
  if (data.total === 0) return null;

  const paidPct = (data.paid / data.total) * 100;
  const claimedPct = (data.claimed / data.total) * 100;
  const unclaimedPct = (data.unclaimed / data.total) * 100;

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        {paidPct > 0 && (
          <View style={[styles.progressSegment, styles.progressPaid, { width: `${paidPct}%` }]} />
        )}
        {claimedPct > 0 && (
          <View style={[styles.progressSegment, styles.progressClaimed, { width: `${claimedPct}%` }]} />
        )}
        {unclaimedPct > 0 && (
          <View style={[styles.progressSegment, styles.progressUnclaimed, { width: `${unclaimedPct}%` }]} />
        )}
      </View>
      <View style={styles.legendContainer}>
        {data.paid > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendPaid]} />
            <Text style={styles.legendText}>{formatCents(data.paid)} paid</Text>
          </View>
        )}
        {data.claimed > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendClaimed]} />
            <Text style={styles.legendText}>{formatCents(data.claimed)} owed</Text>
          </View>
        )}
        {data.unclaimed > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendUnclaimed]} />
            <Text style={styles.legendText}>{formatCents(data.unclaimed)} unclaimed</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ReceiptCard({ receipt }: { receipt: ReceiptWithDetails }) {
  const router = useRouter();
  const progress = useMemo(() => calculateProgress(receipt), [receipt]);

  const showProgress = receipt.status !== 'draft' && progress.total > 0;

  // Calculate effective status based on payment data
  const effectiveStatus = useMemo(() => {
    // If already settled in DB, use that
    if (receipt.status === 'settled') return 'settled';
    // If draft, use that
    if (receipt.status === 'draft') return 'draft';
    // Check if fully paid (all claimed amount is paid)
    if (progress.total > 0 && progress.unclaimed === 0 && progress.claimed === 0 && progress.paid > 0) {
      return 'settled';
    }
    // Otherwise use DB status
    return receipt.status;
  }, [receipt.status, progress]);

  return (
    <Pressable
      style={styles.receiptCard}
      onPress={() => router.push(`/receipt/${receipt.id}`)}
    >
      <View style={styles.receiptCardHeader}>
        <Text style={styles.receiptMerchant} numberOfLines={1}>
          {receipt.merchant_name || 'Unknown merchant'}
        </Text>
        <StatusBadge status={effectiveStatus} />
      </View>

      {showProgress && <ProgressBar data={progress} />}

      <View style={styles.receiptCardFooter}>
        <Text style={styles.receiptDate}>
          {receipt.receipt_date ? formatDate(receipt.receipt_date) : 'No date'}
        </Text>
        <Text style={styles.receiptTotal}>{formatCents(receipt.total_cents)}</Text>
      </View>
    </Pressable>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const message = tab === 'yours'
    ? "You haven't created any receipts yet.\nScan or import a receipt to get started."
    : "No one has shared any receipts with you yet.";

  return (
    <View style={styles.emptyState}>
      <Ionicons
        name={tab === 'yours' ? 'receipt-outline' : 'people-outline'}
        size={48}
        color={colors.textSecondary}
      />
      <Text style={styles.emptyStateText}>{message}</Text>
      {tab === 'yours' && (
        <Link href="/scan" asChild>
          <Pressable style={styles.emptyStateButton}>
            <Text style={styles.emptyStateButtonText}>Scan Receipt</Text>
          </Pressable>
        </Link>
      )}
    </View>
  );
}

function ReceiptList({ receipts, tab }: { receipts: ReceiptWithDetails[]; tab: Tab }) {
  if (receipts.length === 0) {
    return <EmptyState tab={tab} />;
  }

  return (
    <View style={styles.receiptList}>
      {receipts.map((receipt) => (
        <ReceiptCard key={receipt.id} receipt={receipt} />
      ))}
    </View>
  );
}

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
    <View style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={styles.header}>
          <Text style={styles.heading}>Tablink</Text>
        </View>

        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tab, activeTab === 'yours' && styles.tabActive]}
            onPress={() => setActiveTab('yours')}
          >
            <Text style={[styles.tabText, activeTab === 'yours' && styles.tabTextActive]}>
              Yours
            </Text>
            {yourReceipts.length > 0 && (
              <View style={[styles.tabBadge, activeTab === 'yours' && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === 'yours' && styles.tabBadgeTextActive]}>
                  {yourReceipts.length}
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'shared' && styles.tabActive]}
            onPress={() => setActiveTab('shared')}
          >
            <Text style={[styles.tabText, activeTab === 'shared' && styles.tabTextActive]}>
              Shared
            </Text>
            {sharedReceipts.length > 0 && (
              <View style={[styles.tabBadge, activeTab === 'shared' && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === 'shared' && styles.tabBadgeTextActive]}>
                  {sharedReceipts.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ReceiptList receipts={receipts} tab={activeTab} />
        )}
      </ScrollView>

      <View style={styles.fabContainer}>
        <Link href="/scan" asChild>
          <Pressable style={styles.fab}>
            <Ionicons name="add" size={28} color="#fff" />
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  heading: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 20,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
    gap: 6,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  tabBadge: {
    backgroundColor: colors.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabBadgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  tabBadgeTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  receiptList: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  receiptCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  receiptCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  receiptMerchant: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  receiptCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptDate: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  receiptTotal: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    marginBottom: 10,
  },
  progressBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  progressSegment: {
    height: '100%',
  },
  progressPaid: {
    backgroundColor: '#4CAF50',
  },
  progressClaimed: {
    backgroundColor: '#F2C94C',
  },
  progressUnclaimed: {
    backgroundColor: '#F44336',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendPaid: {
    backgroundColor: '#4CAF50',
  },
  legendClaimed: {
    backgroundColor: '#F2C94C',
  },
  legendUnclaimed: {
    backgroundColor: '#F44336',
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateText: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
  },
  emptyStateButton: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 30,
    right: 20,
  },
  fab: {
    backgroundColor: colors.primary,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});
