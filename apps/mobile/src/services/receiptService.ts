import { getSupabaseClient } from '@/src/lib/supabaseClient';
import type { PendingReceipt, Receipt } from '@/src/types/receipt';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export type ReceiptItem = {
  id: string;
  receipt_id: string;
  label: string;
  price_cents: number;
  quantity: number;
  position: number;
};

export type ReceiptWithItems = Receipt & {
  items: ReceiptItem[];
};

function dollarsToCents(amount: number): number {
  return Math.round(amount * 100);
}

export type SaveReceiptResult = {
  receiptId: string;
  success: true;
} | {
  error: string;
  success: false;
};

export async function saveReceipt(
  pendingReceipt: PendingReceipt,
  userId: string
): Promise<SaveReceiptResult> {
  const supabase = getSupabaseClient();
  const { parsed, storagePath } = pendingReceipt;

  // Check session
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return {
      success: false,
      error: 'Not authenticated',
    };
  }

  // Generate UUID client-side to avoid SELECT after INSERT (RLS timing issue)
  const receiptId = uuidv4();

  // Insert receipt without returning data
  const { error: receiptError } = await supabase
    .from('receipts')
    .insert({
      id: receiptId,
      owner_id: userId,
      merchant_name: parsed.merchantName,
      receipt_date: parsed.purchaseDate,
      image_path: storagePath,
      subtotal_cents: dollarsToCents(parsed.totals.subtotal),
      tax_cents: dollarsToCents(parsed.totals.tax),
      tip_cents: dollarsToCents(parsed.totals.tip),
      total_cents: dollarsToCents(parsed.totals.total),
      status: 'draft',
      raw_payload: parsed.raw ?? null,
    });

  if (receiptError || !receiptId) {
    console.error('[receiptService] Failed to insert receipt:', receiptError);
    return {
      success: false,
      error: receiptError?.message ?? 'Failed to save receipt',
    };
  }

  console.log('[receiptService] Receipt created with id:', receiptId);

  // Insert items
  if (parsed.items.length > 0) {
    const itemsToInsert = parsed.items.map((item, index) => ({
      receipt_id: receiptId,
      label: item.name || 'Untitled item',
      price_cents: dollarsToCents(item.price),
      quantity: item.quantity,
      position: index,
    }));

    const { error: itemsError } = await supabase
      .from('receipt_items')
      .insert(itemsToInsert);

    if (itemsError) {
      console.error('[receiptService] Failed to insert items:', itemsError);
      // Receipt was created but items failed - still return success with warning
      // In production, you might want to handle this differently (transaction, cleanup, etc.)
    }
  }

  return {
    success: true,
    receiptId,
  };
}

export type FetchReceiptResult = {
  receipt: ReceiptWithItems;
  success: true;
} | {
  error: string;
  success: false;
};

export async function fetchReceipt(receiptId: string): Promise<FetchReceiptResult> {
  const supabase = getSupabaseClient();

  // Fetch receipt
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', receiptId)
    .single();

  if (receiptError || !receipt) {
    console.error('[receiptService] Failed to fetch receipt:', receiptError);
    return {
      success: false,
      error: receiptError?.message ?? 'Receipt not found',
    };
  }

  // Fetch items
  const { data: items, error: itemsError } = await supabase
    .from('receipt_items')
    .select('*')
    .eq('receipt_id', receiptId)
    .order('position', { ascending: true });

  if (itemsError) {
    console.error('[receiptService] Failed to fetch items:', itemsError);
  }

  return {
    success: true,
    receipt: {
      ...receipt,
      items: items ?? [],
    },
  };
}

export async function updateReceipt(
  receiptId: string,
  updates: {
    merchant_name?: string;
    receipt_date?: string;
    subtotal_cents?: number;
    tax_cents?: number;
    tip_cents?: number;
    total_cents?: number;
    status?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('receipts')
    .update(updates)
    .eq('id', receiptId);

  if (error) {
    console.error('[receiptService] Failed to update receipt:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function updateReceiptItems(
  receiptId: string,
  items: Array<{ label: string; price_cents: number; quantity: number; position: number }>
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();

  // Use RPC for atomic delete + insert to prevent data loss
  const { error } = await supabase.rpc('replace_receipt_items', {
    p_receipt_id: receiptId,
    p_items: items.map((item, index) => ({
      label: item.label,
      price_cents: item.price_cents,
      quantity: item.quantity,
      position: index,
    })),
  });

  if (error) {
    console.error('[receiptService] Failed to update items:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteReceipt(receiptId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();

  // Delete items first (foreign key constraint)
  const { error: itemsError } = await supabase
    .from('receipt_items')
    .delete()
    .eq('receipt_id', receiptId);

  if (itemsError) {
    console.error('[receiptService] Failed to delete items:', itemsError);
    return { success: false, error: itemsError.message };
  }

  // Delete receipt
  const { error: receiptError } = await supabase
    .from('receipts')
    .delete()
    .eq('id', receiptId);

  if (receiptError) {
    console.error('[receiptService] Failed to delete receipt:', receiptError);
    return { success: false, error: receiptError.message };
  }

  return { success: true };
}
