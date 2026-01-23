import { createTablinkClient, type TablinkClient } from '@tablink/shared/supabase';

let client: TablinkClient | null = null;

export function getSupabaseClient(): TablinkClient {
  if (!client) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    }

    client = createTablinkClient({
      supabaseUrl,
      supabaseAnonKey,
    });
  }

  return client;
}
