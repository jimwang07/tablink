import { getSupabaseClient } from '@/src/lib/supabaseClient';

const FREE_SCAN_LIMIT = 5;

export type ScanUsage = {
  used: number;
  limit: number;
  remaining: number;
  isSubscribed: boolean;
};

export async function getScanUsage(userId: string): Promise<ScanUsage> {
  const supabase = getSupabaseClient();

  // Check subscription tier
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('user_id', userId)
    .single();

  const isSubscribed = profile?.subscription_tier === 'pro';

  if (isSubscribed) {
    return { used: 0, limit: Infinity, remaining: Infinity, isSubscribed: true };
  }

  // Count scans for current calendar month
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
