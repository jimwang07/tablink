import { getSupabaseClient } from '@/src/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type ActivityType = 'claim' | 'join';

export type ActivityItem = {
  id: string;
  type: ActivityType;
  timestamp: string;
  receiptId: string;
  receiptName: string;
  participantName: string;
  participantEmoji: string | null;
  itemName?: string; // Only for claim type
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
};

type ReceiptItem = {
  id: string;
  label: string;
  receipt_id: string;
};

type Receipt = {
  id: string;
  merchant_name: string | null;
  owner_id: string;
};

export async function fetchRecentActivity(userId: string): Promise<ActivityItem[]> {
  const supabase = getSupabaseClient();

  // First, get all receipts the user owns
  const { data: ownedReceipts, error: ownedError } = await supabase
    .from('receipts')
    .select('id, merchant_name')
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
    .select('id, receipt_id, display_name, emoji, created_at')
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
    .select('id, label, receipt_id')
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
      .select('id, merchant_name')
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
        .select('id, receipt_id, display_name, emoji, created_at')
        .in('receipt_id', receiptIds);

      participantMap = new Map();
      participants?.forEach(p => {
        participantMap.set(p.id, p as Participant);
      });

      // Fetch items
      const { data: items } = await supabase
        .from('receipt_items')
        .select('id, label, receipt_id')
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
    .subscribe();

  // Initialize data and return cleanup function
  initializeData();

  return () => {
    supabase.removeChannel(channel);
  };
}
