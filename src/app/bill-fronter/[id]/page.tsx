'use client';

import { use, useEffect, useState } from 'react';
import Receipt from '@/components/Receipt';
import PaymentSummary from '@/components/PaymentSummary';
import { receiptService } from '@/services/receipts';
import { itemClaimsService } from '@/services/itemClaims';
import { Receipt as ReceiptType, ReceiptItem as ReceiptItemType, ItemClaim as ItemClaimType } from '@/types/supabase';

export default function BillFronterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [receipt, setReceipt] = useState<ReceiptType | null>(null);
  const [items, setItems] = useState<ReceiptItemType[]>([]);
  const [claimsByItemId, setClaimsByItemId] = useState<Record<string, ItemClaimType[]>>({});
  const [loading, setLoading] = useState(true);
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch the receipt and items using the service
        const { receiptData, items: itemsData } = await receiptService.getReceipt(id);

        // Fetch claims for all items
        let claimsByItem: Record<string, ItemClaimType[]> = {};
        if (itemsData && itemsData.length > 0) {
          const claimsData = await itemClaimsService.getClaimsByMultipleItems(itemsData.map(i => i.id));
          if (claimsData) {
            claimsByItem = itemsData.reduce((acc, item) => {
              acc[item.id] = claimsData.filter(c => c.item_id === item.id);
              return acc;
            }, {} as Record<string, ItemClaimType[]>);
          }
        }

        setReceipt(receiptData);
        setItems(itemsData || []);
        setClaimsByItemId(claimsByItem);
      } catch (error) {
        console.error('Error fetching receipt data:', error);
        setReceipt(null);
        setItems([]);
        setClaimsByItemId({});
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  if (loading) return <div>Loading...</div>;
  if (!receipt) return <div>Receipt not found</div>;

  const mappedItems = items.map(item => ({ ...item, claimers: claimsByItemId[item.id] || [] }));

  const handleItemClick = (item: ReceiptItemType) => {
    console.log('Bill fronter clicked item:', item);
  };

  const openPaymentSummary = () => setShowPaymentSummary(true);
  const closePaymentSummary = () => setShowPaymentSummary(false);

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Bill Fronter View</h2>
        <p className="page-description">
          You paid the bill upfront. Share this receipt with others so they can claim their items.
        </p>
        <button className="payment-summary-button" onClick={openPaymentSummary}>
          View Payment Status
        </button>
      </div>
      <Receipt 
        receipt={receipt}
        items={mappedItems}
        onItemClick={handleItemClick}
      />
      <PaymentSummary 
        receipt={receipt}
        items={mappedItems}
        isVisible={showPaymentSummary}
        onClose={closePaymentSummary}
      />
    </div>
  );
}
