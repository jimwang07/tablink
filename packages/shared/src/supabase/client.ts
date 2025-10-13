import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import type { Database } from './types/database.types';

export type TablinkClient = SupabaseClient<Database>;

export interface TablinkSupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  options?: SupabaseClientOptions<'public'>;
}

export function assertSupabaseConfig(config: TablinkSupabaseConfig): asserts config is TablinkSupabaseConfig {
  if (!config.supabaseUrl) {
    throw new Error('Missing Supabase URL');
  }
  if (!config.supabaseAnonKey) {
    throw new Error('Missing Supabase anon key');
  }
}

export function createTablinkClient({ supabaseUrl, supabaseAnonKey, options }: TablinkSupabaseConfig): TablinkClient {
  assertSupabaseConfig({ supabaseUrl, supabaseAnonKey, options });
  return createClient<Database>(supabaseUrl, supabaseAnonKey, options);
}
