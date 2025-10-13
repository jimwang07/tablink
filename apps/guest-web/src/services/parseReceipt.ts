import { supabase } from '@/libs/supabase';
import { ParsedReceiptData } from '@/types/parsedReceipt';

export interface ParseReceiptResponse {
  success: boolean;
  data?: ParsedReceiptData;
  error?: string;
}

export const parseReceiptService = {
  async parseReceiptFromUrl(imageUrl: string): Promise<ParsedReceiptData> {
    try {
      console.log('Calling parseReceipt edge function with URL:', imageUrl);
      
      // Call your Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('parseReceipt', {
        body: { imageUrl }
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(`Failed to parse receipt: ${error.message}`);
      }

      if (!data || !data.success) {
        console.error('Edge function returned failure:', data);
        throw new Error(data?.error || 'Unknown error occurred during receipt parsing');
      }

      console.log('Parsed receipt data:', data.data);
      return data.data;
    } catch (error) {
      console.error('Receipt parsing error:', error);
      throw error;
    }
  }
};