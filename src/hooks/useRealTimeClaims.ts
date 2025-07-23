import { useState, useEffect } from 'react'
import { supabase } from '@/libs/supabase'
import type { ItemClaim } from '@/types/supabase'

export function useItemClaims(itemId: string) {
    const [claims, setClaims] = useState<ItemClaim[]>([])
    const [loading, setLoading] = useState(true)

    // Load existing claims
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
    }, [itemId])

    // Function to make a new claim
    const makeClaim = async (claimerName: string, portion: number, amount: number) => {
        console.log('Making claim:', { claimerName, portion, amount });
        const claim = {
            id: crypto.randomUUID(), // or use another unique ID generator
            item_id: itemId,
            claimer: claimerName,
            portion: portion,
            amount_owed: amount,
            payment_status: 'pending'
        };
        const { data, error } = await supabase
            .from('item_claims')
            .insert(claim)
            .select()
            .single();

        console.log('Supabase insert response:', { data, error });

        if (error) {
            throw error;
        }

        setClaims(prev => [...prev, data]);
        return data;
    };

    return { 
        claims, 
        loading,
        makeClaim  // Expose the claim function
    }
}
