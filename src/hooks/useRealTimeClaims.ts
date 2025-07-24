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
          table: 'item_claims',
          filter: `item_id=eq.${itemId}`
        },
        (payload) => {
            if (payload.eventType === 'INSERT') {
                setClaims(prev => [...prev, payload.new as ItemClaim]);
            } else if (payload.eventType === 'UPDATE') {
                setClaims(prev => prev.map(claim =>
                claim.id === payload.new.id ? payload.new as ItemClaim : claim
                ));
            } else if (payload.eventType === 'DELETE') {
                setClaims(prev => prev.filter(claim => claim.id !== payload.old.id));
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

  return {
    claimerName,
    setName,
    claims,
    loading,
    makeClaim,
    isLoggedIn: !!claimerName
  }
}
