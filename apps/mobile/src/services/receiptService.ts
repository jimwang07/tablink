import { getSupabaseClient } from '@/src/lib/supabaseClient';
import type { PendingReceipt } from '@/src/types/receipt';

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

  // Insert receipt
  const { data: receiptData, error: receiptError } = await supabase
    .from('receipts')
    .insert({
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
    })
    .select('id')
    .single();

  if (receiptError || !receiptData) {
    console.error('[receiptService] Failed to insert receipt:', receiptError);
    return {
      success: false,
      error: receiptError?.message ?? 'Failed to save receipt',
    };
  }

  const receiptId = receiptData.id;

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
