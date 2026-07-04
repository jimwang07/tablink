export type ParsedReceiptAdjustmentType = 'discount' | 'service_fee' | 'fee' | 'other';

export type ParsedReceiptAdjustment = {
  type: ParsedReceiptAdjustmentType;
  label: string;
  amount: number;
};

export type ParsedReceipt = {
  merchantName: string | null;
  merchantAddress: string | null;
  purchaseDate: string | null;
  currency: string;
  items: ParsedReceiptItem[];
  adjustments: ParsedReceiptAdjustment[];
  totals: ReceiptTotals;
  notes: string | null;
  raw: {
    userId: string | null;
    model: string;
    imagePath: string;
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
  storagePath: string | null;
  publicUrl: string | null;
  uploadedAt: string;
  parsed: ParsedReceipt;
};

export type ReceiptStatus = 'draft' | 'ready' | 'shared' | 'partially_claimed' | 'fully_claimed' | 'settled';

export type Receipt = {
  id: string;
  owner_id: string;
  merchant_name: string | null;
  receipt_date: string | null;
  image_path: string | null;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  raw_payload?: ParsedReceipt | null;
  status: ReceiptStatus;
  celebration_shown: boolean;
  created_at: string;
  updated_at: string;
};
