import React from 'react';
import { ReceiptItem as ReceiptItemType, ItemClaim as ItemClaimType } from '@/types/supabase';
import { formatPrice } from '@/utils/formatters';

interface ReceiptItemProps {
  item: ReceiptItemType & { claimers: ItemClaimType[] };
  onItemClick: (item: ReceiptItemType, event: React.MouseEvent) => void;
}

const ReceiptItem: React.FC<ReceiptItemProps> = ({ item, onItemClick }) => {
  const handleClick = (event: React.MouseEvent) => {
    onItemClick(item, event);
  };

  // Compute status based on claimers
  let status = 'available';
  if (item.claimers.length > 0) {
    if (item.claimers.every(c => c.payment_status === 'paid')) {
      status = 'paid';
    } else {
      status = 'pending';
    }
  }

  const statusInfo = {
    available: { text: 'Available', class: 'available-badge' },
    pending: { text: 'Pending', class: 'pending-badge' },
    paid: { text: '✓ Paid', class: 'paid-badge' }
  }[status] || { text: 'Available', class: 'available-badge' };

  return (
    <div className={`receipt-item ${status}`} onClick={handleClick}>
      <div className="item-details">
        <div className="item-name">{item.name}</div>
        {/* Add description if you add it to your schema */}
        {item.claimers.length > 0 && (
          <div className="claimer-info">
            {item.claimers.length === 1
              ? `Claimed by: ${item.claimers[0].claimer}`
              : `${item.claimers.length} people claimed`}
          </div>
        )}
      </div>
      <div className="item-right">
        <div className="item-price">
          {item.quantity > 1 ? `${item.quantity}x ` : ''}
          {formatPrice(item.price * item.quantity)}
        </div>
        <div className="item-status">
          <span className={`status-badge ${statusInfo.class}`}>
            {statusInfo.text}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ReceiptItem;