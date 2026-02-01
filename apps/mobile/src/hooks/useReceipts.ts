import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/src/lib/supabaseClient';
import { useAuth } from './useAuth';
import type { Receipt } from '@/src/types/receipt';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type ReceiptParticipant = {
  id: string;
  display_name: string;
  emoji: string | null;
  payment_status: string;
  payment_amount_cents: number | null;
};

export type ReceiptItemClaim = {
  id: string;
  amount_cents: number;
  status: string;
  participant_id: string;
};

export type ReceiptItem = {
  id: string;
  price_cents: number;
  quantity: number;
  item_claims: ReceiptItemClaim[];
};

export type ReceiptWithDetails = Receipt & {
  receipt_items: ReceiptItem[];
  receipt_participants: ReceiptParticipant[];
};

type UseReceiptsResult = {
  yourReceipts: ReceiptWithDetails[];
  sharedReceipts: ReceiptWithDetails[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useReceipts(): UseReceiptsResult {
  const { session } = useAuth();
  const [yourReceipts, setYourReceipts] = useState<ReceiptWithDetails[]>([]);
  const [sharedReceipts, setSharedReceipts] = useState<ReceiptWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchReceipts = useCallback(async () => {
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    const userId = session.user.id;

    try {
      setIsLoading(true);
      setError(null);

      // Fetch all owned receipts with items, claims, and participants
      const { data: owned, error: ownedError } = await supabase
        .from('receipts')
        .select(`
          *,
          receipt_items (
            id,
            price_cents,
            quantity,
            item_claims (
              id,
              amount_cents,
              status,
              participant_id
            )
          ),
          receipt_participants (
            id,
            display_name,
            emoji,
            payment_status,
            payment_amount_cents
          )
        `)
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (ownedError) throw ownedError;

      // Fetch shared receipts (where user is a participant but not owner)
      const { data: shared, error: sharedError } = await supabase
        .from('receipts')
        .select(`
          *,
          receipt_items (
            id,
            price_cents,
            quantity,
            item_claims (
              id,
              amount_cents,
              status,
              participant_id
            )
          ),
          receipt_participants!inner (
            id,
            display_name,
            emoji,
            payment_status,
            payment_amount_cents,
            profile_id
          )
        `)
        .eq('receipt_participants.profile_id', userId)
        .neq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (sharedError) throw sharedError;

      setYourReceipts((owned as ReceiptWithDetails[]) ?? []);
      setSharedReceipts((shared as ReceiptWithDetails[]) ?? []);
    } catch (err) {
      console.error('[useReceipts] Error fetching receipts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch receipts');
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id]);

  // Initial fetch
  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  // Realtime subscriptions for live updates
  useEffect(() => {
    if (!session?.user?.id) return;

    const supabase = getSupabaseClient();

    // Subscribe to changes on item_claims, receipt_participants, and receipts
    const channel = supabase
      .channel('receipts-home-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_claims' },
        () => {
          fetchReceipts();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipt_participants' },
        () => {
          fetchReceipts();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipts' },
        () => {
          fetchReceipts();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [session?.user?.id, fetchReceipts]);

  return {
    yourReceipts,
    sharedReceipts,
    isLoading,
    error,
    refresh: fetchReceipts,
  };
}
