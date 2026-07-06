import { getSupabaseClient } from '@/src/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ActivityType = 'claim' | 'join' | 'payment' | 'settled';

export type ActivityItem = {
  id: string;
  type: ActivityType;
  timestamp: string;
  receiptId: string;
  receiptName: string;
  participantName: string;
  participantEmoji: string | null;
  itemName?: string; // Only for claim type
  paymentMethod?: string; // Only for payment type
  amountCents?: number; // Only for payment type
};

type ItemClaim = {
  id: string;
  item_id: string;
  participant_id: string;
  created_at: string;
};

type Participant = {
  id: string;
  receipt_id: string;
  display_name: string;
  emoji: string | null;
  created_at: string;
  payment_status?: string;
  paid_at?: string;
  payment_method?: string;
  payment_amount_cents?: number;
};

type ReceiptItem = {
  id: string;
  label: string;
  receipt_id: string;
  price_cents?: number | null;
};

type Receipt = {
  id: string;
  merchant_name: string | null;
  owner_id: string;
  status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const LAST_ACTIVITY_SEEN_PREFIX = 'tablink-last-activity-seen-at';

function getLastActivitySeenKey(userId: string) {
  return `${LAST_ACTIVITY_SEEN_PREFIX}:${userId}`;
}

export async function getLatestActivityTimestamp(userId: string): Promise<string | null> {
  const activities = await fetchRecentActivity(userId);
  return activities[0]?.timestamp ?? null;
}

export async function hasUnreadActivity(userId: string): Promise<boolean> {
  const [latestTimestamp, lastSeenAt] = await Promise.all([
    getLatestActivityTimestamp(userId),
    AsyncStorage.getItem(getLastActivitySeenKey(userId)),
  ]);

  if (!latestTimestamp) return false;
  if (!lastSeenAt) return true;

  return new Date(latestTimestamp).getTime() > new Date(lastSeenAt).getTime();
}

export async function markActivitySeen(userId: string, timestamp = new Date().toISOString()) {
  await AsyncStorage.setItem(getLastActivitySeenKey(userId), timestamp);
}

async function getSettledReceiptTimestamp(receiptId: string): Promise<string | null> {
  const supabase = getSupabaseClient();

  const [{ data: items }, { data: participants }] = await Promise.all([
    supabase
      .from('receipt_items')
      .select('id, price_cents')
      .eq('receipt_id', receiptId),
    supabase
      .from('receipt_participants')
      .select('id, payment_status, paid_at')
      .eq('receipt_id', receiptId),
  ]);

  if (!items?.length || !participants?.length) return null;

  const itemIds = items.map(item => item.id);
  const { data: claims } = await supabase
    .from('item_claims')
    .select('item_id, participant_id, amount_cents')
    .in('item_id', itemIds);

  if (!claims?.length) return null;

  const paidParticipants = new Map(
    participants.map(participant => [participant.id, participant])
  );

  const allClaimsPaid = claims.every(claim => {
    return paidParticipants.get(claim.participant_id)?.payment_status === 'paid';
  });
  if (!allClaimsPaid) return null;

  const claimedByItem = new Map<string, number>();
  for (const claim of claims) {
    claimedByItem.set(claim.item_id, (claimedByItem.get(claim.item_id) ?? 0) + claim.amount_cents);
  }

  const allItemsFullyClaimed = items.every(item => {
    const priceCents = item.price_cents ?? 0;
    if (priceCents <= 0) return true;
    return (claimedByItem.get(item.id) ?? 0) >= priceCents;
  });
  if (!allItemsFullyClaimed) return null;

  const paidTimes = participants
    .map(participant => participant.paid_at)
    .filter((value): value is string => Boolean(value))
    .map(value => new Date(value).getTime());

  return paidTimes.length > 0
    ? new Date(Math.max(...paidTimes)).toISOString()
    : new Date().toISOString();
}

export async function fetchRecentActivity(userId: string): Promise<ActivityItem[]> {
  const supabase = getSupabaseClient();

  // First, get all receipts the user owns
  const { data: ownedReceipts, error: ownedError } = await supabase
    .from('receipts')
    .select('id, merchant_name, status, updated_at, created_at')
    .eq('owner_id', userId);

  if (ownedError) {
    console.error('[activityService] Failed to fetch owned receipts:', ownedError);
    return [];
  }

  const receiptIds = ownedReceipts?.map(r => r.id) ?? [];

  if (receiptIds.length === 0) {
    return [];
  }

  // Create a map of receipt names for quick lookup
  const receiptNameMap = new Map<string, string>();
  ownedReceipts?.forEach(r => {
    receiptNameMap.set(r.id, r.merchant_name || 'Receipt');
  });

  // Fetch all participants for these receipts
  const { data: participants, error: participantsError } = await supabase
    .from('receipt_participants')
    .select('id, receipt_id, display_name, emoji, created_at, payment_status, paid_at, payment_method, payment_amount_cents')
    .in('receipt_id', receiptIds)
    .order('created_at', { ascending: false });

  if (participantsError) {
    console.error('[activityService] Failed to fetch participants:', participantsError);
  }

  // Create participant map for claim lookups
  const participantMap = new Map<string, Participant>();
  participants?.forEach(p => {
    participantMap.set(p.id, p as Participant);
  });

  // Fetch all receipt items for these receipts
  const { data: items, error: itemsError } = await supabase
    .from('receipt_items')
    .select('id, label, receipt_id, price_cents')
    .in('receipt_id', receiptIds);

  if (itemsError) {
    console.error('[activityService] Failed to fetch items:', itemsError);
  }

  // Create item map
  const itemMap = new Map<string, ReceiptItem>();
  items?.forEach(item => {
    itemMap.set(item.id, item as ReceiptItem);
  });

  const itemIds = items?.map(i => i.id) ?? [];

  // Fetch all claims for these items
  const { data: claims, error: claimsError } = await supabase
    .from('item_claims')
    .select('id, item_id, participant_id, created_at')
    .in('item_id', itemIds.length > 0 ? itemIds : ['__none__'])
    .order('created_at', { ascending: false });

  if (claimsError) {
    console.error('[activityService] Failed to fetch claims:', claimsError);
  }

  // Build activity items
  const activities: ActivityItem[] = [];

  ownedReceipts?.forEach(r => {
    if (r.status !== 'settled') return;

    activities.push({
      id: `settled-${r.id}`,
      type: 'settled',
      timestamp: r.updated_at || r.created_at || new Date().toISOString(),
      receiptId: r.id,
      receiptName: r.merchant_name || 'Receipt',
      participantName: r.merchant_name || 'Receipt',
      participantEmoji: null,
    });
  });

  for (const receipt of ownedReceipts ?? []) {
    if (activities.some(activity => activity.id === `settled-${receipt.id}`)) continue;

    const settledAt = await getSettledReceiptTimestamp(receipt.id);
    if (!settledAt) continue;

    activities.push({
      id: `settled-${receipt.id}`,
      type: 'settled',
      timestamp: settledAt,
      receiptId: receipt.id,
      receiptName: receipt.merchant_name || 'Receipt',
      participantName: receipt.merchant_name || 'Receipt',
      participantEmoji: null,
    });
  }

  // Add join activities
  participants?.forEach(p => {
    activities.push({
      id: `join-${p.id}`,
      type: 'join',
      timestamp: p.created_at,
      receiptId: p.receipt_id,
      receiptName: receiptNameMap.get(p.receipt_id) || 'Receipt',
      participantName: p.display_name,
      participantEmoji: p.emoji,
    });

    // Add payment activities for participants who have paid
    if (p.payment_status === 'paid' && p.paid_at) {
      activities.push({
        id: `payment-${p.id}`,
        type: 'payment',
        timestamp: p.paid_at,
        receiptId: p.receipt_id,
        receiptName: receiptNameMap.get(p.receipt_id) || 'Receipt',
        participantName: p.display_name,
        participantEmoji: p.emoji,
        paymentMethod: p.payment_method ?? undefined,
        amountCents: p.payment_amount_cents ?? undefined,
      });
    }
  });

  // Add claim activities
  claims?.forEach(c => {
    const participant = participantMap.get(c.participant_id);
    const item = itemMap.get(c.item_id);

    if (participant && item) {
      activities.push({
        id: `claim-${c.id}`,
        type: 'claim',
        timestamp: c.created_at,
        receiptId: item.receipt_id,
        receiptName: receiptNameMap.get(item.receipt_id) || 'Receipt',
        participantName: participant.display_name,
        participantEmoji: participant.emoji,
        itemName: item.label,
      });
    }
  });

  // Sort by timestamp descending
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Return most recent 50 activities
  return activities.slice(0, 50);
}

export type ActivitySubscriptionCallbacks = {
  onClaim: (activity: ActivityItem) => void;
  onJoin: (activity: ActivityItem) => void;
  onPayment: (activity: ActivityItem) => void;
  onSettled: (activity: ActivityItem) => void;
};

export function subscribeToActivity(
  userId: string,
  callbacks: ActivitySubscriptionCallbacks
) {
  const supabase = getSupabaseClient();

  // We need to track receipt and item data for constructing activity items
  let receiptNameMap = new Map<string, string>();
  let participantMap = new Map<string, Participant>();
  let itemMap = new Map<string, ReceiptItem>();
  let receiptIds: string[] = [];

  // Initialize data
  async function initializeData() {
    // Fetch owned receipts
    const { data: ownedReceipts } = await supabase
      .from('receipts')
      .select('id, merchant_name, status, updated_at, created_at')
      .eq('owner_id', userId);

    receiptIds = ownedReceipts?.map(r => r.id) ?? [];
    receiptNameMap = new Map();
    ownedReceipts?.forEach(r => {
      receiptNameMap.set(r.id, r.merchant_name || 'Receipt');
    });

    // Fetch participants
    if (receiptIds.length > 0) {
      const { data: participants } = await supabase
        .from('receipt_participants')
        .select('id, receipt_id, display_name, emoji, created_at, payment_status, paid_at, payment_method, payment_amount_cents')
        .in('receipt_id', receiptIds);

      participantMap = new Map();
      participants?.forEach(p => {
        participantMap.set(p.id, p as Participant);
      });

      // Fetch items
      const { data: items } = await supabase
        .from('receipt_items')
        .select('id, label, receipt_id, price_cents')
        .in('receipt_id', receiptIds);

      itemMap = new Map();
      items?.forEach(item => {
        itemMap.set(item.id, item as ReceiptItem);
      });
    }
  }

  // Set up realtime subscription
  const channel = supabase
    .channel(`activity:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'receipts',
      },
      async (payload: RealtimePostgresChangesPayload<Receipt>) => {
        const updated = payload.new as Receipt;
        const old = payload.old as Partial<Receipt>;

        if (old.status === 'settled' || updated.status !== 'settled') return;

        if (!receiptIds.includes(updated.id)) {
          await initializeData();
          if (!receiptIds.includes(updated.id)) return;
        }

        const receiptName = receiptNameMap.get(updated.id) || updated.merchant_name || 'Receipt';
        callbacks.onSettled({
          id: `settled-${updated.id}`,
          type: 'settled',
          timestamp: updated.updated_at || new Date().toISOString(),
          receiptId: updated.id,
          receiptName,
          participantName: receiptName,
          participantEmoji: null,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'item_claims',
      },
      async (payload: RealtimePostgresChangesPayload<ItemClaim>) => {
        const claim = payload.new as ItemClaim;
        const item = itemMap.get(claim.item_id);

        // If we don't have this item, it might be from a new receipt - refresh data
        if (!item) {
          await initializeData();
          const refreshedItem = itemMap.get(claim.item_id);
          if (!refreshedItem) return; // Not our receipt
        }

        const finalItem = itemMap.get(claim.item_id);
        if (!finalItem) return;

        // Check if this receipt is one of ours
        if (!receiptIds.includes(finalItem.receipt_id)) return;

        let participant = participantMap.get(claim.participant_id);
        if (!participant) {
          // Fetch participant info
          const { data } = await supabase
            .from('receipt_participants')
            .select('id, receipt_id, display_name, emoji, created_at')
            .eq('id', claim.participant_id)
            .single();

          if (data) {
            participant = data as Participant;
            participantMap.set(data.id, participant);
          }
        }

        if (participant) {
          callbacks.onClaim({
            id: `claim-${claim.id}`,
            type: 'claim',
            timestamp: claim.created_at,
            receiptId: finalItem.receipt_id,
            receiptName: receiptNameMap.get(finalItem.receipt_id) || 'Receipt',
            participantName: participant.display_name,
            participantEmoji: participant.emoji,
            itemName: finalItem.label,
          });
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'receipt_participants',
      },
      async (payload: RealtimePostgresChangesPayload<Participant>) => {
        const participant = payload.new as Participant;

        // Check if this receipt is one of ours
        if (!receiptIds.includes(participant.receipt_id)) {
          // Might be a new receipt - refresh data
          await initializeData();
          if (!receiptIds.includes(participant.receipt_id)) return;
        }

        // Add to participant map
        participantMap.set(participant.id, participant);

        callbacks.onJoin({
          id: `join-${participant.id}`,
          type: 'join',
          timestamp: participant.created_at,
          receiptId: participant.receipt_id,
          receiptName: receiptNameMap.get(participant.receipt_id) || 'Receipt',
          participantName: participant.display_name,
          participantEmoji: participant.emoji,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'receipt_participants',
      },
      async (payload: RealtimePostgresChangesPayload<Participant>) => {
        const updated = payload.new as Participant;
        const old = payload.old as Partial<Participant>;

        // Check if payment_status changed to 'paid'
        if (old.payment_status !== 'paid' && updated.payment_status === 'paid') {
          // Check if this receipt is one of ours
          if (!receiptIds.includes(updated.receipt_id)) {
            await initializeData();
            if (!receiptIds.includes(updated.receipt_id)) return;
          }

          // Update participant map
          participantMap.set(updated.id, updated);

          callbacks.onPayment({
            id: `payment-${updated.id}-${Date.now()}`,
            type: 'payment',
            timestamp: updated.paid_at || new Date().toISOString(),
            receiptId: updated.receipt_id,
            receiptName: receiptNameMap.get(updated.receipt_id) || 'Receipt',
            participantName: updated.display_name,
            participantEmoji: updated.emoji,
            paymentMethod: updated.payment_method ?? undefined,
            amountCents: updated.payment_amount_cents ?? undefined,
          });

          const settledAt = await getSettledReceiptTimestamp(updated.receipt_id);
          if (settledAt) {
            const receiptName = receiptNameMap.get(updated.receipt_id) || 'Receipt';
            callbacks.onSettled({
              id: `settled-${updated.receipt_id}`,
              type: 'settled',
              timestamp: settledAt,
              receiptId: updated.receipt_id,
              receiptName,
              participantName: receiptName,
              participantEmoji: null,
            });
          }
        }
      }
    )
    .subscribe();

  // Initialize data and return cleanup function
  initializeData();

  return () => {
    supabase.removeChannel(channel);
  };
}
