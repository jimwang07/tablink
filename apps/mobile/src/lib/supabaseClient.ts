import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { processLock } from '@supabase/supabase-js';
import { createTablinkClient, type TablinkClient } from '@tablink/shared/supabase';

let client: TablinkClient | null = null;

export function getSupabaseClient(): TablinkClient {
  if (!client) {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    }

    client = createTablinkClient({
      supabaseUrl,
      supabaseAnonKey,
      options: {
        auth: {
          persistSession: true,
          storage: AsyncStorage,
          storageKey: 'tablink-auth',
          autoRefreshToken: true,
          detectSessionInUrl: false,
          lock: processLock,
        },
      },
    });
  }

  return client;
}
