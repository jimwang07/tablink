export type User = {
  cashtag: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type Receipt = {
  id: string;
  created_by: string;
  merchant_name: string | null;
  description: string | null;
  date: string;
  subtotal: number;
  tax: number;
  tip: number | null;
  total: number;
  status: 'open' | 'partially_claimed' | 'fully_claimed' | 'paid';
  share_link: string;
};

export type ReceiptItem = {
  id: string;
  receipt_id: string;
  name: string;
  price: number;
  quantity: number;
};

export type ItemClaim = {
  id: string;
  item_id: string;
  claimer: string;
  portion: number;
  amount_owed: number;
  payment_status: 'pending' | 'requested' | 'paid';
  cashapp_payment_id: string | null;
};

export type ReceiptPayment = {
  id: string;
  receipt_id: string;
  payer: string;
  total_amount_owed: number;
  cashapp_payment_id: string | null;
};
