import { getSupabaseClient } from '@/src/lib/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParsedReceipt } from '@/src/types/receipt';

type InvokeResp = {
  success: boolean;
  data?: ParsedReceipt;
  error?: string;
};

export const PARSE_OPTIONS = [
  'groq-llama-4-scout',
  'groq-qwen-3.6-27b',
  'gemini',
] as const;
export type ParseOptionName = (typeof PARSE_OPTIONS)[number];
export type ParseFunctionName = ParseOptionName;

type ParseOptionConfig = {
  functionName: 'parse-receipt-llama' | 'parse-receipt-qwen' | 'parse-receipt';
  label: string;
};

export const PARSE_OPTION_CONFIG: Record<ParseOptionName, ParseOptionConfig> = {
  'groq-llama-4-scout': {
    functionName: 'parse-receipt-llama',
    label: 'Llama 4',
  },
  'groq-qwen-3.6-27b': {
    functionName: 'parse-receipt-qwen',
    label: 'Qwen 3.6',
  },
  gemini: {
    functionName: 'parse-receipt',
    label: 'Gemini',
  },
};

const PARSE_FUNCTION_STORAGE_KEY = 'debug.parse_function_override';
const DEFAULT_PARSE_FUNCTION: ParseFunctionName = 'groq-llama-4-scout';

function normalizeParseOption(value: string): ParseOptionName | null {
  if ((PARSE_OPTIONS as readonly string[]).includes(value)) {
    return value as ParseOptionName;
  }

  if (value === 'parse-receipt-groq') return 'groq-llama-4-scout';
  if (value === 'parse-receipt') return 'gemini';
  return null;
}

function getEnvParseFunctionName(): ParseFunctionName {
  const configured = process.env.EXPO_PUBLIC_PARSE_FUNCTION?.trim();
  return configured ? normalizeParseOption(configured) ?? DEFAULT_PARSE_FUNCTION : DEFAULT_PARSE_FUNCTION;
}

export async function getParseFunctionName(): Promise<ParseFunctionName> {
  try {
    const stored = (await AsyncStorage.getItem(PARSE_FUNCTION_STORAGE_KEY))?.trim();
    if (stored) {
      const option = normalizeParseOption(stored);
      if (option) return option;
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
  const parseOption = await getParseFunctionName();
  const config = PARSE_OPTION_CONFIG[parseOption];

  const invokeStart = Date.now();
  const { data, error } = await client.functions
    .invoke<InvokeResp>(config.functionName, {
      body: { imagePath, userId },
      signal: opts?.signal,
    })
    .finally(() => {
      const invokeDuration = Date.now() - invokeStart;
      console.log(
        `[perf][invokeParseReceipt] option=${parseOption} function=${config.functionName} edge function ${invokeDuration}ms`
      );
    });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.success || !data.data) {
    throw new Error(data?.error ?? 'Failed to parse receipt');
  }

  return data.data;
}
