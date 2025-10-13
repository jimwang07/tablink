import { createClient } from '@supabase/supabase-js';
export function assertSupabaseConfig(config) {
    if (!config.supabaseUrl) {
        throw new Error('Missing Supabase URL');
    }
    if (!config.supabaseAnonKey) {
        throw new Error('Missing Supabase anon key');
    }
}
export function createTablinkClient({ supabaseUrl, supabaseAnonKey, options }) {
    assertSupabaseConfig({ supabaseUrl, supabaseAnonKey, options });
    return createClient(supabaseUrl, supabaseAnonKey, options);
}
//# sourceMappingURL=client.js.map