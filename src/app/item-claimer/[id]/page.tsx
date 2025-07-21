'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Receipt from '@/components/Receipt';
import { supabase } from '@/libs/supabase';
import { Receipt as ReceiptType, ReceiptItem as ReceiptItemType, ItemClaim as ItemClaimType } from '@/types/supabase';

export default function ItemClaimerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [receipt, setReceipt] = useState<ReceiptType | null>(null);
  const [items, setItems] = useState<ReceiptItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimsByItemId, setClaimsByItemId] = useState<Record<string, ItemClaimType[]>>({});

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

  const handleItemClick = (item: ReceiptItemType) => {
    console.log('Item claimer clicked item:', item);
  };

  if (loading) return <div>Loading...</div>;
  if (!receipt) return <div>Receipt not found</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Claim Your Items</h2>
        <p className="page-description">
          Click on the items you ordered to claim them and pay your share.
        </p>
      </div>
      <Receipt 
        receipt={receipt}
        items={items.map(item => ({ ...item, claimers: claimsByItemId[item.id] || [] }))}
        onItemClick={handleItemClick}
      />
    </div>
  );
}
