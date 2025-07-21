import React from 'react';
import { ReceiptItem as ReceiptItemType, ItemStatus } from '../types/Receipt';

interface ReceiptItemProps {
  item: ReceiptItemType;
  onItemClick: (item: ReceiptItemType, event: React.MouseEvent) => void;
}

const ReceiptItem: React.FC<ReceiptItemProps> = ({ item, onItemClick }) => {
  const handleClick = (event: React.MouseEvent) => {
    onItemClick(item, event);
  };

  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };

  const getStatusInfo = () => {
    switch (item.status) {
      case ItemStatus.AVAILABLE:
        return { text: 'Available', class: 'available-badge' };
      case ItemStatus.PENDING:
        return { text: 'Pending', class: 'pending-badge' };
      case ItemStatus.PAID:
        return { text: '✓ Paid', class: 'paid-badge' };
      default:
        return { text: 'Available', class: 'available-badge' };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={`receipt-item ${item.status}`} onClick={handleClick}>
      <div className="item-details">
        <div className="item-name">{item.name}</div>
        {item.description && (
          <div className="item-description">{item.description}</div>
        )}
        {item.claimers.length > 0 && (
          <div className="claimer-info">
            {item.claimers.length === 1 ? 
              `Claimed by: ${item.claimers[0].name}` : 
              `${item.claimers.length} people claimed`
            }
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