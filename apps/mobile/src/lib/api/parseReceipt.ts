import { getSupabaseClient } from '@/src/lib/supabaseClient';
import type { ParsedReceipt } from '@/src/types/receipt';

type InvokeResp = {
  success: boolean;
  data?: ParsedReceipt;
  error?: string;
};

export async function invokeParseReceipt(
  imagePath: string, // path in the 'receipts' bucket, e.g. "user_123/1730000000000.jpg"
  userId: string,
  opts?: { signal?: AbortSignal }
): Promise<ParsedReceipt> {
  const client = getSupabaseClient();

  const { data, error } = await client.functions.invoke<InvokeResp>(
    'parse-receipt',
    {
      body: { imagePath, userId },
      signal: opts?.signal,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.success || !data.data) {
    throw new Error(data?.error ?? 'Failed to parse receipt');
  }

  return data.data;
}
