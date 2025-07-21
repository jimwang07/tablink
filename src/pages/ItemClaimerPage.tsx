import React from 'react';
import { useParams } from 'react-router-dom';
import Receipt from '../components/Receipt';
import { mockReceipt12, mockReceipt, mockReceipt3 } from '../data/mockReceipt';
import { ReceiptItem } from '../types/Receipt';

const ItemClaimerPage: React.FC = () => {
  const { receiptId } = useParams<{ receiptId: string }>();

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
};

export default ItemClaimerPage;