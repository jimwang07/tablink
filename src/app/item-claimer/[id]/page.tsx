'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Receipt from '@/components/Receipt';
import { receiptService } from '@/services/receipts';
import { itemClaimsService } from '@/services/itemClaims';
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
