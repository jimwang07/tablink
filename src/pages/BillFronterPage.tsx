import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import Receipt from '../components/Receipt';
import PaymentSummary from '../components/PaymentSummary';
import { mockReceipt12, mockReceipt, mockReceipt3 } from '../data/mockReceipt';
import { ReceiptItem } from '../types/Receipt';

const BillFronterPage: React.FC = () => {
  const { receiptId } = useParams<{ receiptId: string }>();
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);

  // Get the correct receipt based on the URL parameter
  const getReceipt = () => {
    if (receiptId === 'receipt-001') return mockReceipt12;
    if (receiptId === 'receipt-002') return mockReceipt;
    if (receiptId === 'receipt-003') return mockReceipt3;
    // Default fallback for legacy routes
    return mockReceipt;
  };

  const currentReceipt = getReceipt();

  const handleItemClick = (item: ReceiptItem) => {
    console.log('Bill fronter clicked item:', item);
  };

  const openPaymentSummary = () => {
    setShowPaymentSummary(true);
  };

  const closePaymentSummary = () => {
    setShowPaymentSummary(false);
  };

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
        receipt={currentReceipt} 
        onItemClick={handleItemClick}
      />
      <PaymentSummary 
        receipt={currentReceipt} 
        isVisible={showPaymentSummary}
        onClose={closePaymentSummary}
      />
    </div>
  );
};

export default BillFronterPage;