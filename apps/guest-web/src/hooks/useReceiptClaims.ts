import { useState, useEffect } from 'react';
import { supabase } from '@/libs/supabase';
import type { ItemClaim } from '@/types/supabase';

export function useReceiptClaims(receiptId: string, itemIds: string[]) {
  const [claimsByItemId, setClaimsByItemId] = useState<Record<string, ItemClaim[]>>({});

  useEffect(() => {
    if (!itemIds.length) return;

    const loadClaims = async () => {
      const { data } = await supabase
        .from('item_claims')
        .select('*')
        .in('item_id', itemIds);
      const grouped = (data || []).reduce((acc, claim) => {
        acc[claim.item_id] = acc[claim.item_id] || [];
        acc[claim.item_id].push(claim);
        return acc;
      }, {} as Record<string, ItemClaim[]>);
      setClaimsByItemId(grouped);
    };
    loadClaims();

    // Real-time subscription for all claims on these items
    const channel = supabase
      .channel('receipt-claims-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'item_claims'
        },
        (payload) => {
          const newClaim = payload.new as ItemClaim | undefined;
          const oldClaim = payload.old as ItemClaim | undefined;

          if (
            (newClaim && itemIds.includes(newClaim.item_id)) ||
            (oldClaim && itemIds.includes(oldClaim.item_id))
          ) {
            setClaimsByItemId(prev => {
              const updated = { ...prev };
              if (payload.eventType === 'INSERT') {
                updated[newClaim!.item_id] = [...(updated[newClaim!.item_id] || []), newClaim!];
              } else if (payload.eventType === 'UPDATE') {
                updated[newClaim!.item_id] = (updated[newClaim!.item_id] || []).map(c =>
                  c.id === newClaim!.id ? newClaim! : c
                );
              } else if (payload.eventType === 'DELETE') {
                updated[oldClaim!.item_id] = (updated[oldClaim!.item_id] || []).filter(c => c.id !== oldClaim!.id);
              }
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [receiptId, itemIds.join(',')]);

  return claimsByItemId;
}
