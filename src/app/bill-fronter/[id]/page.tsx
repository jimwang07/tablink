'use client';

import { use, useEffect, useState } from 'react';
import Receipt from '@/components/Receipt';
import PaymentSummary from '@/components/PaymentSummary';
import { supabase } from '@/libs/supabase';
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
      // Fetch the receipt
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', id)
        .single();

      // Fetch the items for this receipt
      const { data: itemsData, error: itemsError } = await supabase
        .from('receipt_items')
        .select('*')
        .eq('receipt_id', id);

      // Fetch claims for all items
      let claimsByItem: Record<string, ItemClaimType[]> = {};
      if (itemsData && itemsData.length > 0) {
        const { data: claimsData } = await supabase
          .from('item_claims')
          .select('*')
          .in('item_id', itemsData.map(i => i.id));
        if (claimsData) {
          claimsByItem = itemsData.reduce((acc, item) => {
            acc[item.id] = claimsData.filter(c => c.item_id === item.id);
            return acc;
          }, {} as Record<string, ItemClaimType[]>);
        }
      }

      if (receiptError || itemsError) {
        setReceipt(null);
        setItems([]);
        setClaimsByItemId({});
      } else {
        setReceipt(receiptData);
        setItems(itemsData || []);
        setClaimsByItemId(claimsByItem);
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
