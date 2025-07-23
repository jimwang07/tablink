import React, { useState } from 'react';
import { ReceiptItem } from '@/types/supabase';
import { useClaimerSession } from '@/hooks/useClaimerSession';
import { useItemClaims } from '@/hooks/useRealTimeClaims';

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
  const { claimerName, setName, isLoggedIn } = useClaimerSession();
  const { claims, loading, makeClaim } = useItemClaims(item?.id || '');
  const [nameInput, setNameInput] = useState('');
  const [portionInput, setPortionInput] = useState(1);
  const [amountInput, setAmountInput] = useState(item ? item.price : 0);
  const [claiming, setClaiming] = useState(false);

  if (!isVisible || !item) return null;

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const handleSetName = () => {
    if (nameInput.trim()) {
      setName(nameInput.trim());
      setNameInput('');
    }
  };

  const handleClaim = async () => {
    if (!claimerName) return;
    setClaiming(true);
    try {
      await makeClaim(claimerName, portionInput, amountInput);
    } catch (e) {
      alert('Failed to claim item.');
    }
    setClaiming(false);
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
            {loading ? (
              <p>Loading claims...</p>
            ) : claims.length > 0 ? (
              <div className="claimers-list">
                {claims.map((claimer, index) => (
                  <div key={index} className={`claimer-item ${claimer.payment_status === 'paid' ? 'paid' : 'unpaid'}`}>
                    <div className="claimer-info-left">
                      <span className="claimer-name">{claimer.claimer}</span>
                      <span className="payment-status">
                        {claimer.payment_status === 'paid' ? '✓ Paid' : 'Not paid'}
                      </span>
                    </div>
                    <span className="claimer-details">
                      {claimer.portion}x {formatPrice(item.price * claimer.portion)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-claimers">No one has claimed this item yet</p>
            )}
          </div>

          {!isLoggedIn && (
            <div style={{ marginTop: 16 }}>
              <input
                type="text"
                placeholder="Enter your name"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                style={{ marginRight: 8 }}
              />
              <button onClick={handleSetName} className="action-button primary">Set Name</button>
            </div>
          )}

          {isLoggedIn && (
            <div style={{ marginTop: 16 }}>
              <label>
                Portion:
                <input
                  type="number"
                  min={1}
                  max={item.quantity}
                  value={portionInput}
                  onChange={e => setPortionInput(Number(e.target.value))}
                  style={{ width: 60, marginLeft: 8 }}
                />
              </label>
              <button
                onClick={handleClaim}
                className="action-button primary"
                style={{ marginLeft: 8 }}
                disabled={claiming}
              >
                {claiming ? 'Claiming...' : 'Claim Item'}
              </button>
              <button
                onClick={async () => {
                  try {
                    const result = await makeClaim(claimerName || 'TestUser', 1, item.price);
                    console.log('Test claim result:', result);
                    alert('Claim made! Check console for result.');
                  } catch (e) {
                    console.error('Error making claim:', e);
                    alert('Failed to make claim');
                  }
                }}
              >
                Test MakeClaim
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ItemBubbleMenu;