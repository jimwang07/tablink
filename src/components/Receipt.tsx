import React, { useState } from 'react';
import { Receipt as ReceiptType, ReceiptItem as ReceiptItemType, ItemClaim as ItemClaimType } from '@/types/supabase';
import ReceiptItem from './ReceiptItem';
import ItemBubbleMenu from './ItemBubbleMenu';
import { formatPrice, formatDate } from '@/utils/formatters';

interface ReceiptProps {
  receipt: ReceiptType;
  items: ReceiptItemType[];
  claimsByItemId: Record<string, ItemClaimType[]>;
  onItemClick: (item: ReceiptItemType, event: React.MouseEvent) => void;
}

const Receipt: React.FC<ReceiptProps> = ({ receipt, items, claimsByItemId, onItemClick }) => {
  const [selectedItem, setSelectedItem] = useState<ReceiptItemType | null>(null);
  const [bubblePosition, setBubblePosition] = useState({ x: 0, y: 0 });

  const handleItemClick = (item: ReceiptItemType, event: React.MouseEvent) => {
    const receiptContainer = document.querySelector('.receipt-container');
    const receiptRect = receiptContainer?.getBoundingClientRect();
    const itemRect = (event.target as HTMLElement).getBoundingClientRect();
    
    if (receiptRect) {
      setBubblePosition({
        x: receiptRect.left - 320,
        y: itemRect.top + window.scrollY
      });
    }
    setSelectedItem(item);
    onItemClick(item, event);
  };

  const closeBubble = () => setSelectedItem(null);

  return (
    <div className="receipt-container">
      <div className="receipt-header">
        <h1 className="restaurant-name">{receipt.merchant_name}</h1>
        <p className="receipt-date">{formatDate(receipt.date)}</p>
      </div>

      <div className="receipt-items">
        {items.map((item) => (
          <ReceiptItem
            key={item.id}
            item={item}
            claimers={claimsByItemId[item.id] || []}
            onItemClick={handleItemClick}
          />
        ))}
      </div>

      <div className="receipt-summary">
        <div className="summary-line">
          <span className="summary-label">Subtotal</span>
          <span className="summary-value">{formatPrice(receipt.subtotal)}</span>
        </div>
        <div className="summary-line">
          <span className="summary-label">Tax</span>
          <span className="summary-value">{formatPrice(receipt.tax)}</span>
        </div>
        <div className="summary-line">
          <span className="summary-label">Tip</span>
          <span className="summary-value">{formatPrice(receipt.tip ?? 0)}</span>
        </div>
        <div className="summary-line total">
          <span className="summary-label">Total</span>
          <span className="summary-value">{formatPrice(receipt.total)}</span>
        </div>
      </div>

      <ItemBubbleMenu
        item={selectedItem}
        isVisible={selectedItem !== null}
        position={bubblePosition}
        onClose={closeBubble}
      />
    </div>
  );
};

export default Receipt;