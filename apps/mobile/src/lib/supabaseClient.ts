import 'react-native-url-polyfill/auto';
import { processLock } from '@supabase/supabase-js';
import { createTablinkClient, type TablinkClient } from '@tablink/shared/supabase';

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function resolveAsyncStorage(): StorageAdapter | undefined {
  const navigatorProduct = typeof navigator !== 'undefined' ? navigator.product : undefined;
  const isReactNative = navigatorProduct === 'ReactNative';

  if (!isReactNative) {
    return undefined;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: asyncStorage } = require('@react-native-async-storage/async-storage');
    return asyncStorage as StorageAdapter;
  } catch (error) {
    if (__DEV__) {
      console.warn('AsyncStorage is unavailable:', error);
    }
    return undefined;
  }
}

let client: TablinkClient | null = null;

export function getSupabaseClient(): TablinkClient {
  if (!client) {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    }

    const storage = resolveAsyncStorage();
    const persistSession = Boolean(storage);

    client = createTablinkClient({
      supabaseUrl,
      supabaseAnonKey,
      options: {
        auth: {
          persistSession,
          storage,
          storageKey: 'tablink-auth',
          autoRefreshToken: persistSession,
          detectSessionInUrl: false,
          lock: persistSession ? processLock : undefined,
        },
      },
    });
  }

  return client;
}
