export enum ItemStatus {
  AVAILABLE = 'available',
  PENDING = 'pending', 
  PAID = 'paid'
}

export interface ItemClaimer {
  name: string;
  quantity: number;
  paid: boolean;
}

export interface ReceiptItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  claimers: ItemClaimer[];
  status: ItemStatus;
}

export interface Receipt {
  id: string;
  restaurantName: string;
  restaurantAddress: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
}