import { ParsedReceiptData } from '@/types/parsedReceipt';

export const generateMockReceiptData = (): ParsedReceiptData => {
  const receiptId = "1d1c488a-915f-4548-bffc-0740087b67b4";
  
  return {
    receiptData: {
      id: receiptId,
      created_by: '$sarah',
      merchant_name: 'Tony\'s Italian',
      description: 'Team dinner',
      date: '2025-07-20T19:30:00',
      subtotal: 93.00,
      tax: 7.44,
      tip: 18.60,
      total: 119.04,
      status: 'partially_claimed',
      share_link: `cashlink.app/r/${Math.random().toString(36).substring(2, 10)}`
    },
    items: [
      {
        id: "a8f37bb5-631e-47db-b594-f1b788163fb8",
        receipt_id: receiptId,
        name: 'Caesar Salad',
        price: 12.99,
        quantity: 1
      },
      {
        id: "df05843c-d252-47e9-9c34-fbe9fd36c7be",
        receipt_id: receiptId,
        name: 'Grilled Chicken Sandwich',
        price: 16.99,
        quantity: 1
      },
      {
        id: "f951f7a8-f90c-4dc7-87f4-b6f4897876cf",
        receipt_id: receiptId,
        name: 'Margherita Pizza',
        price: 15.52,
        quantity: 1
      }
    ]
  };
};