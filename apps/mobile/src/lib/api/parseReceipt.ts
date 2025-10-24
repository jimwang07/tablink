import { getSupabaseClient } from '@/src/lib/supabaseClient';
import type { ParsedReceipt } from '@/src/types/receipt';

export async function invokeParseReceipt(imageUrl: string, userId: string): Promise<ParsedReceipt> {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<{ success: boolean; data?: ParsedReceipt; error?: string }>(
    'parse-receipt',
    {
      body: {
        imageUrl,
        userId,
      },
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
