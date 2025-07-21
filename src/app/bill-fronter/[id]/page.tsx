'use client';

import { use, useState } from 'react';
import Receipt from '@/components/Receipt';
import PaymentSummary from '@/components/PaymentSummary';
import { mockReceipt12, mockReceipt, mockReceipt3 } from '@/data/mockReceipt';
import { ReceiptItem } from '@/types/Receipt';

export default function BillFronterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Unwrap the params Promise
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);

  // Find the receipt based on the ID
  const allReceipts = [mockReceipt12, mockReceipt, mockReceipt3];
  const receipt = allReceipts.find(r => r.id === id);

  if (!receipt) {
    return <div>Receipt not found</div>;
  }

  const handleItemClick = (item: ReceiptItem) => {
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
        onItemClick={handleItemClick}
      />
      <PaymentSummary 
        receipt={receipt} 
        isVisible={showPaymentSummary}
        onClose={closePaymentSummary}
      />
    </div>
  );
}
