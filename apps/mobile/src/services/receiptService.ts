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
  position: number | null;
};

export type ReceiptWithItems = Receipt & {
  items: ReceiptItem[];
};

const DEFAULT_SHARE_LINK_EXPIRY_DAYS = 30;
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generateShortCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * SHORT_CODE_ALPHABET.length);
    code += SHORT_CODE_ALPHABET[index];
  }
  return code;
}

function dollarsToCents(amount: number): number {
  return Math.round(amount * 100);
}

export type ShareLinkResult = {
  success: true;
  shortCode: string;
  expiresAt: string | null;
} | {
  success: false;
  error: string;
};

export async function getOrCreateShareLink(
  receiptId: string,
  options?: {
    expiresInDays?: number;
    forceNew?: boolean;
  }
): Promise<ShareLinkResult> {
  const supabase = getSupabaseClient();
  const now = Date.now();

  // Reuse the most recent active link unless caller requests a new one.
  if (!options?.forceNew) {
    const { data: existingLinks, error: existingError } = await supabase
      .from('receipt_links')
      .select('short_code, expires_at, revoked_at, created_at')
      .eq('receipt_id', receiptId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (existingError) {
      console.error('[receiptService] Failed to fetch existing share links:', existingError);
      return {
        success: false,
        error: existingError.message,
      };
    }

    const activeLink = existingLinks?.find((link) => {
      if (!link.expires_at) return true;
      return new Date(link.expires_at).getTime() > now;
    });

    if (activeLink?.short_code) {
      return {
        success: true,
        shortCode: activeLink.short_code,
        expiresAt: activeLink.expires_at ?? null,
      };
    }
  }

  const expiresInDays = options?.expiresInDays ?? DEFAULT_SHARE_LINK_EXPIRY_DAYS;
  const expiresAt = new Date(now + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  // Retry on short-code collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shortCode = generateShortCode();
    const { error } = await supabase
      .from('receipt_links')
      .insert({
        receipt_id: receiptId,
        short_code: shortCode,
        expires_at: expiresAt,
      });

    if (!error) {
      return {
        success: true,
        shortCode,
        expiresAt,
      };
    }

    // Unique-violation on short_code, retry with a new code.
    if (error.code === '23505') {
      continue;
    }

    console.error('[receiptService] Failed to create share link:', error);
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: false,
    error: 'Failed to generate a unique share link. Please try again.',
  };
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

  // Get owner's profile for display name
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', userId)
    .single();

  const ownerDisplayName = profile?.display_name || 'Me';

  // Auto-add owner as participant (their items are auto-paid since they paid the bill)
  const { error: participantError } = await supabase
    .from('receipt_participants')
    .insert({
      receipt_id: receiptId,
      display_name: ownerDisplayName,
      profile_id: userId,
      role: 'owner',
      payment_status: 'paid', // Owner doesn't need to pay themselves
      emoji: '👤',
    });

  if (participantError) {
    console.error('[receiptService] Failed to add owner as participant:', participantError);
  }

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
      celebration_shown:
        typeof (receipt as { celebration_shown?: unknown }).celebration_shown === 'boolean'
          ? ((receipt as { celebration_shown?: boolean }).celebration_shown ?? false)
          : false,
      items: items ?? [],
    },
  };
}

export async function updateReceipt(
  receiptId: string,
  updates: {
    merchant_name?: string | null;
    receipt_date?: string | null;
    subtotal_cents?: number;
    tax_cents?: number;
    tip_cents?: number;
    total_cents?: number;
    status?: Receipt['status'];
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
  items: Array<{ id?: string; label: string; price_cents: number; quantity: number; position: number }>
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();

  // Delete existing items and insert new ones (simpler than diffing)
  const { error: deleteError } = await supabase
    .from('receipt_items')
    .delete()
    .eq('receipt_id', receiptId);

  if (deleteError) {
    console.error('[receiptService] Failed to delete old items:', deleteError);
    return { success: false, error: deleteError.message };
  }

  if (items.length > 0) {
    const itemsToInsert = items.map((item, index) => ({
      receipt_id: receiptId,
      label: item.label,
      price_cents: item.price_cents,
      quantity: item.quantity,
      position: index,
    }));

    const { error: insertError } = await supabase
      .from('receipt_items')
      .insert(itemsToInsert);

    if (insertError) {
      console.error('[receiptService] Failed to insert items:', insertError);
      return { success: false, error: insertError.message };
    }
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
