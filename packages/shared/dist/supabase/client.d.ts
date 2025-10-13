import { type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import type { Database } from './types/database.types';
export type TablinkClient = SupabaseClient<Database>;
export interface TablinkSupabaseConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
    options?: SupabaseClientOptions<'public'>;
}
export declare function assertSupabaseConfig(config: TablinkSupabaseConfig): asserts config is TablinkSupabaseConfig;
export declare function createTablinkClient({ supabaseUrl, supabaseAnonKey, options }: TablinkSupabaseConfig): TablinkClient;
//# sourceMappingURL=client.d.ts.map