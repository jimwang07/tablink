'use client';

import { use } from 'react';
import Receipt from '@/components/Receipt';
import { mockReceipt12, mockReceipt, mockReceipt3 } from '@/data/mockReceipt';
import { ReceiptItem } from '@/types/Receipt';

export default function ItemClaimerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Unwrap the params Promise

  // Find the receipt based on the ID
  const allReceipts = [mockReceipt12, mockReceipt, mockReceipt3];
  const currentReceipt = allReceipts.find(r => r.id === id) ?? mockReceipt;

  const handleItemClick = (item: ReceiptItem) => {
    console.log('Item claimer clicked item:', item);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Claim Your Items</h2>
        <p className="page-description">
          Click on the items you ordered to claim them and pay your share.
        </p>
      </div>
      <Receipt 
        receipt={currentReceipt} 
        onItemClick={handleItemClick}
      />
    </div>
  );
}
