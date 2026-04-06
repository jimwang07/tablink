import { getSupabaseClient } from '@/src/lib/supabaseClient';
import Purchases from 'react-native-purchases';

const FREE_SCAN_LIMIT = 15;
const ENTITLEMENT_ID = 'Tablink Premium';

export type ScanUsage = {
  used: number;
  limit: number;
  remaining: number;
  isSubscribed: boolean;
};

export async function getScanUsage(userId: string): Promise<ScanUsage> {
  // Check subscription via RevenueCat entitlements
  let isSubscribed = false;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    isSubscribed = typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
  } catch (err) {
    console.warn('[scanLimitService] RevenueCat check failed, falling back to free tier:', err);
  }

  if (isSubscribed) {
    return { used: 0, limit: Infinity, remaining: Infinity, isSubscribed: true };
  }

  // Count scans for current calendar month
  const supabase = getSupabaseClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count } = await supabase
    .from('scan_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfMonth);

  const used = count ?? 0;

  return {
    used,
    limit: FREE_SCAN_LIMIT,
    remaining: Math.max(0, FREE_SCAN_LIMIT - used),
    isSubscribed: false,
  };
}

export async function recordScan(userId: string, receiptId?: string): Promise<void> {
  const supabase = getSupabaseClient();

  await supabase.from('scan_events').insert({
    user_id: userId,
    receipt_id: receiptId ?? null,
  });
}
