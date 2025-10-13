import { useState, useEffect } from 'react'
import { supabase } from '@/libs/supabase'
import Cookies from 'js-cookie'
import type { ItemClaim } from '@/types/supabase'

export function useItemClaims(itemId: string) {
  // Session state
  const [claimerName, setClaimerName] = useState<string | null>(null)

  // Claims state
  const [claims, setClaims] = useState<ItemClaim[]>([])
  const [loading, setLoading] = useState(true)

  // Load session from cookies
  useEffect(() => {
    const name = Cookies.get('claimerName')
    if (name) setClaimerName(name)
  }, [])

  // Load claims and setup real-time
  useEffect(() => {
    const loadClaims = async () => {
      const { data } = await supabase
        .from('item_claims')
        .select('*')
        .eq('item_id', itemId)
      setClaims(data || [])
      setLoading(false)
    }
    loadClaims()

    // Real-time subscription
    const channel = supabase
      .channel('item-claims-changes')
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
            (newClaim && newClaim.item_id === itemId) ||
            (oldClaim && oldClaim.item_id === itemId)
          ) {
            if (payload.eventType === 'INSERT') {
              setClaims(prev => {
                const exists = prev.some(c => c.id === newClaim!.id);
                return exists ? prev : [...prev, newClaim!];
              });
            } else if (payload.eventType === 'UPDATE') {
              setClaims(prev => prev.map(claim =>
                claim.id === newClaim!.id ? newClaim! : claim
              ));
            } else if (payload.eventType === 'DELETE') {
              setClaims(prev => prev.filter(claim => claim.id !== oldClaim!.id));
            }
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [itemId])

  // Set name function
  const setName = async (name: string) => {
    Cookies.set('claimerName', name, { path: '/' })
    setClaimerName(name)
    await supabase.from('users').upsert({ cashtag: name })
  }

  // Make claim function
  const makeClaim = async (portion: number, amount: number) => {
    if (!claimerName) throw new Error('No claimer name set')
    const claim = {
      id: crypto.randomUUID(),
      item_id: itemId,
      claimer: claimerName,
      portion,
      amount_owed: amount,
      payment_status: 'pending'
    }
    const { data, error } = await supabase
      .from('item_claims')
      .insert(claim)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const deleteClaim = async (claimId: string) => {
    const { error } = await supabase
      .from('item_claims')
      .delete()
      .eq('id', claimId);
    if (error) {
      alert('Failed to delete claim');
    }
  };

  return {
    claimerName,
    setName,
    claims,
    loading,
    makeClaim,
    isLoggedIn: !!claimerName,
    deleteClaim,
  }
}
