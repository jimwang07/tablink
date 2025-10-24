export type ParsedReceipt = {
  merchantName: string | null;
  merchantAddress: string | null;
  purchaseDate: string | null;
  currency: string;
  items: ParsedReceiptItem[];
  totals: ReceiptTotals;
  notes: string | null;
  raw: {
    userId: string | null;
    model: string;
    imageUrl: string;
  };
};

export type ParsedReceiptItem = {
  name: string;
  price: number;
  quantity: number;
};

export type ReceiptTotals = {
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  itemsTotal: number;
};

export type PendingReceipt = {
  localUri: string;
  storagePath: string;
  publicUrl: string;
  parsed: ParsedReceipt;
};
