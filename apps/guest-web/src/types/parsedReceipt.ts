export interface ParsedReceiptData {
  receiptData: {
    id: string;
    created_by: string;
    merchant_name: string;
    description: string;
    date: string;
    subtotal: number;
    tax: number;
    tip: number;
    total: number;
    status: string;
    share_link: string;
  };
  items: {
    id: string;
    receipt_id: string;
    name: string;
    price: number;
    quantity: number;
  }[];
}