import { supabase } from '@/libs/supabase';

export interface ItemClaimData {
  id: string;
  item_id: string;
  claimer: string;
  portion: number;
  amount_owed: number;
  payment_status: string | null;
  cashapp_payment_id?: string;
  created_at?: string;
  updated_at?: string;
}

export const itemClaimsService = {
  async createClaim(claim: ItemClaimData) {
    try {
      const { data, error } = await supabase
        .from('item_claims')
        .insert([claim])
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create claim: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Claim creation error:', error);
      throw error;
    }
  },

  async getClaim(id: string) {
    try {
      const { data, error } = await supabase
        .from('item_claims')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw new Error(`Failed to fetch claim: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Claim fetch error:', error);
      throw error;
    }
  },

  async getClaimsByItemId(itemId: string) {
    try {
      const { data, error } = await supabase
        .from('item_claims')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch claims: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Claims fetch error:', error);
      throw error;
    }
  },

  async getClaimsByUserId(userId: string) {
    try {
      const { data, error } = await supabase
        .from('item_claims')
        .select('*')
        .eq('claimer', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch claims: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Claims fetch error:', error);
      throw error;
    }
  },

  async getClaimsByPaymentStatus(paymentStatus: string | null) {
    try {
      const { data, error } = await supabase
        .from('item_claims')
        .select('*')
        .eq('payment_status', paymentStatus)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch claims: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Claims fetch error:', error);
      throw error;
    }
  },

  async getClaimsByMultipleItems(itemIds: string[]) {
    try {
      const { data, error } = await supabase
        .from('item_claims')
        .select('*')
        .in('item_id', itemIds)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch claims: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Claims fetch error:', error);
      throw error;
    }
  },

  async updateClaim(id: string, updates: Partial<ItemClaimData>) {
    try {
      const { data, error } = await supabase
        .from('item_claims')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update claim: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Claim update error:', error);
      throw error;
    }
  },

  async deleteClaim(id: string) {
    try {
      const { error } = await supabase
        .from('item_claims')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(`Failed to delete claim: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error('Claim deletion error:', error);
      throw error;
    }
  },

  async deleteClaimsByItemId(itemId: string) {
    try {
      const { error } = await supabase
        .from('item_claims')
        .delete()
        .eq('item_id', itemId);

      if (error) {
        throw new Error(`Failed to delete claims: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error('Claims deletion error:', error);
      throw error;
    }
  },

  async updatePaymentStatus(id: string, paymentStatus: string | null, cashappPaymentId?: string) {
    try {
      const updates: any = { payment_status: paymentStatus, updated_at: new Date().toISOString() };
      if (cashappPaymentId) {
        updates.cashapp_payment_id = cashappPaymentId;
      }

      const { data, error } = await supabase
        .from('item_claims')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update payment status: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Payment status update error:', error);
      throw error;
    }
  }
};