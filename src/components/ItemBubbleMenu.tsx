import React from 'react';
import { ReceiptItem } from '../types/receipt';

interface ItemBubbleMenuProps {
  item: ReceiptItem | null;
  isVisible: boolean;
  position: { x: number; y: number };
  onClose: () => void;
}

const ItemBubbleMenu: React.FC<ItemBubbleMenuProps> = ({ 
  item, 
  isVisible, 
  position, 
  onClose 
}) => {
  if (!isVisible || !item) return null;

  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };

  const getTotalClaimed = () => {
    return item.claimers.reduce((total, claimer) => total + claimer.quantity, 0);
  };

  const getAvailableQuantity = () => {
    return item.quantity - getTotalClaimed();
  };

  return (
    <>
      <div className="bubble-menu-overlay" onClick={onClose} />
      <div 
        className="bubble-menu" 
        style={{ 
          left: position.x, 
          top: position.y 
        }}
      >
        <div className="bubble-menu-header">
          <h3 className="bubble-menu-title">{item.name}</h3>
          <button className="bubble-menu-close" onClick={onClose}>×</button>
        </div>
        
        <div className="bubble-menu-content">
          {item.description && (
            <p className="bubble-menu-description">{item.description}</p>
          )}
          
          <div className="bubble-menu-pricing">
            <div className="price-line">
              <span>Price per item:</span>
              <span>{formatPrice(item.price)}</span>
            </div>
            <div className="price-line">
              <span>Total quantity:</span>
              <span>{item.quantity}</span>
            </div>
            <div className="price-line total">
              <span>Total cost:</span>
              <span>{formatPrice(item.price * item.quantity)}</span>
            </div>
          </div>

          <div className="bubble-menu-claims">
            <h4 className="claims-title">Claims Status</h4>
            
            {item.claimers.length > 0 ? (
              <div className="claimers-list">
                {item.claimers.map((claimer, index) => (
                  <div key={index} className={`claimer-item ${claimer.paid ? 'paid' : 'unpaid'}`}>
                    <div className="claimer-info-left">
                      <span className="claimer-name">{claimer.name}</span>
                      <span className="payment-status">
                        {claimer.paid ? '✓ Paid' : 'Not paid'}
                      </span>
                    </div>
                    <span className="claimer-details">
                      {claimer.quantity}x {formatPrice(item.price * claimer.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-claimers">No one has claimed this item yet</p>
            )}
            
            {getAvailableQuantity() > 0 && (
              <div className="available-section">
                <div className="available-quantity">
                  Available: {getAvailableQuantity()} of {item.quantity}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ItemBubbleMenu;