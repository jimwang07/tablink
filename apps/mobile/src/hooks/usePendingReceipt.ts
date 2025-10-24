import { usePendingReceiptContext } from '@/src/providers/PendingReceiptProvider';

export function usePendingReceipt() {
  return usePendingReceiptContext();
}
