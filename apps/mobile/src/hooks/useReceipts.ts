import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/src/lib/supabaseClient';
import { useAuth } from './useAuth';
import type { Receipt } from '@/src/types/receipt';

type UseReceiptsResult = {
  yourReceipts: Receipt[];
  sharedReceipts: Receipt[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useReceipts(): UseReceiptsResult {
  const { session } = useAuth();
  const [yourReceipts, setYourReceipts] = useState<Receipt[]>([]);
  const [sharedReceipts, setSharedReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      // Fetch all owned receipts
      const { data: owned, error: ownedError } = await supabase
        .from('receipts')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (ownedError) throw ownedError;

      // Fetch shared receipts (where user is a participant but not owner)
      const { data: shared, error: sharedError } = await supabase
        .from('receipts')
        .select('*, receipt_participants!inner(*)')
        .eq('receipt_participants.profile_id', userId)
        .neq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (sharedError) throw sharedError;

      setYourReceipts(owned ?? []);
      setSharedReceipts(shared ?? []);
    } catch (err) {
      console.error('[useReceipts] Error fetching receipts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch receipts');
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  return {
    yourReceipts,
    sharedReceipts,
    isLoading,
    error,
    refresh: fetchReceipts,
  };
}
