import { supabase } from '@/libs/supabase';

export interface ReceiptData {
  id: string;
  created_by: string;
  merchant_name: string;
  description: string;
  date: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  status: string;
  share_link: string;
}

export interface ReceiptItemData {
  id: string;
  receipt_id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface CreateReceiptPayload {
  receiptData: ReceiptData;
  items: ReceiptItemData[];
}

// Make sure to generate random uuid
export const receiptService = {
  async createReceipt(payload: CreateReceiptPayload) {
    try {
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .insert([payload.receiptData]);

      if (receiptError) {
        throw new Error(`Failed to create receipt: ${receiptError.message}`);
      }

      const { error: itemsError } = await supabase
        .from('receipt_items')
        .insert(payload.items);

      if (itemsError) {
        throw new Error(`Failed to create receipt items: ${itemsError.message}`);
      }

      return receiptData;
    } catch (error) {
      console.error('Receipt creation error:', error);
      throw error;
    }
  },

  async getReceipt(id: string) {
    try {
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', id)
        .single();

      if (receiptError) {
        throw new Error(`Failed to fetch receipt: ${receiptError.message}`);
      }

      const { data: items, error: itemsError } = await supabase
        .from('receipt_items')
        .select('*')
        .eq('receipt_id', id);

      if (itemsError) {
        throw new Error(`Failed to fetch receipt items: ${itemsError.message}`);
      }

      return {
        receiptData: receipt,
        items: items || []
      };
    } catch (error) {
      console.error('Receipt fetch error:', error);
      throw error;
    }
  },

  async getAllReceipts() {
    try {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch receipts: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Receipts fetch error:', error);
      throw error;
    }
  },

  async deleteReceipt(id: string) {
    try {
      // Delete items first (foreign key constraint)
      const { error: itemsError } = await supabase
        .from('receipt_items')
        .delete()
        .eq('receipt_id', id);

      if (itemsError) {
        throw new Error(`Failed to delete receipt items: ${itemsError.message}`);
      }

      // Then delete receipt
      const { error: receiptError } = await supabase
        .from('receipts')
        .delete()
        .eq('id', id);

      if (receiptError) {
        throw new Error(`Failed to delete receipt: ${receiptError.message}`);
      }

      return true;
    } catch (error) {
      console.error('Receipt deletion error:', error);
      throw error;
    }
  }
};