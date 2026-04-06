import { getSupabaseClient } from '@/src/lib/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParsedReceipt } from '@/src/types/receipt';

type InvokeResp = {
  success: boolean;
  data?: ParsedReceipt;
  error?: string;
};

export const PARSE_FUNCTIONS = ['parse-receipt-groq', 'parse-receipt'] as const;
export type ParseFunctionName = (typeof PARSE_FUNCTIONS)[number];

const PARSE_FUNCTION_STORAGE_KEY = 'debug.parse_function_override';
const DEFAULT_PARSE_FUNCTION: ParseFunctionName = 'parse-receipt-groq';

function isParseFunctionName(value: string): value is ParseFunctionName {
  return (PARSE_FUNCTIONS as readonly string[]).includes(value);
}

function getEnvParseFunctionName(): ParseFunctionName {
  const configured = process.env.EXPO_PUBLIC_PARSE_FUNCTION?.trim();
  return configured && isParseFunctionName(configured) ? configured : DEFAULT_PARSE_FUNCTION;
}

export async function getParseFunctionName(): Promise<ParseFunctionName> {
  try {
    const stored = (await AsyncStorage.getItem(PARSE_FUNCTION_STORAGE_KEY))?.trim();
    if (stored && isParseFunctionName(stored)) {
      return stored;
    }
  } catch (error) {
    console.warn('[parseReceipt] Failed to load parser override:', error);
  }

  return getEnvParseFunctionName();
}

export async function setParseFunctionOverride(functionName: ParseFunctionName | null): Promise<void> {
  try {
    if (!functionName) {
      await AsyncStorage.removeItem(PARSE_FUNCTION_STORAGE_KEY);
      return;
    }

    await AsyncStorage.setItem(PARSE_FUNCTION_STORAGE_KEY, functionName);
  } catch (error) {
    console.warn('[parseReceipt] Failed to save parser override:', error);
  }
}

export async function invokeParseReceipt(
  imagePath: string, // path in the 'receipts' bucket, e.g. "user_123/1730000000000.jpg"
  userId: string,
  opts?: { signal?: AbortSignal }
): Promise<ParsedReceipt> {
  const client = getSupabaseClient();
  const functionName = await getParseFunctionName();

  const invokeStart = Date.now();
  const { data, error } = await client.functions
    .invoke<InvokeResp>(functionName, {
      body: { imagePath, userId },
      signal: opts?.signal,
    })
    .finally(() => {
      const invokeDuration = Date.now() - invokeStart;
      console.log(`[perf][invokeParseReceipt] function=${functionName} edge function ${invokeDuration}ms`);
    });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.success || !data.data) {
    throw new Error(data?.error ?? 'Failed to parse receipt');
  }

  return data.data;
}
