import React from 'react';
import { ReceiptItem } from '@/types/supabase';
import { formatPrice } from '@/utils/formatters';

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
          {/* Add more fields as you add them to your schema */}
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
        </div>
      </div>
    </>
  );
};

export default ItemBubbleMenu;