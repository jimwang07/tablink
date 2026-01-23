import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme';
import { useReceipts } from '@/src/hooks/useReceipts';
import type { Receipt, ReceiptStatus } from '@/src/types/receipt';

type Tab = 'yours' | 'shared';

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
    ready: { label: 'Ready', bg: '#2D5A3D', text: '#6FCF97' },
    shared: { label: 'Shared', bg: '#2D5A3D', text: '#6FCF97' },
    partially_claimed: { label: 'Partial', bg: '#5A4D2D', text: '#F2C94C' },
    fully_claimed: { label: 'Claimed', bg: '#2D4A5A', text: '#56CCF2' },
    settled: { label: 'Settled', bg: '#3D3D5A', text: '#A0A0CF' },
  };

  const { label, bg, text } = config[status] || config.draft;

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
    </View>
  );
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const router = useRouter();

  return (
    <Pressable
      style={styles.receiptCard}
      onPress={() => router.push(`/receipt/${receipt.id}`)}
    >
      <View style={styles.receiptCardHeader}>
        <Text style={styles.receiptMerchant} numberOfLines={1}>
          {receipt.merchant_name || 'Unknown merchant'}
        </Text>
        <StatusBadge status={receipt.status} />
      </View>
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

function ReceiptList({ receipts, tab }: { receipts: Receipt[]; tab: Tab }) {
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
