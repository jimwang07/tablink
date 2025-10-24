import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import type { PendingReceipt } from '@/src/types/receipt';

type PendingReceiptContextValue = {
  pendingReceipt: PendingReceipt | null;
  setPendingReceipt: (value: PendingReceipt | null) => void;
};

const PendingReceiptContext = createContext<PendingReceiptContextValue | undefined>(undefined);

export function PendingReceiptProvider({ children }: PropsWithChildren) {
  const [pendingReceipt, setPendingReceipt] = useState<PendingReceipt | null>(null);

  const value = useMemo(
    () => ({ pendingReceipt, setPendingReceipt }),
    [pendingReceipt]
  );

  return <PendingReceiptContext.Provider value={value}>{children}</PendingReceiptContext.Provider>;
}

export function usePendingReceiptContext() {
  const context = useContext(PendingReceiptContext);
  if (!context) {
    throw new Error('usePendingReceiptContext must be used within PendingReceiptProvider');
  }
  return context;
}
