'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Receipt from '@/components/Receipt';
import { receiptService } from '@/services/receipts';
import { Receipt as ReceiptType, ReceiptItem as ReceiptItemType } from '@/types/supabase';
import { useClaimerSession } from '@/hooks/useClaimerSession';
import { useReceiptClaims } from '@/hooks/useReceiptClaims';
import Link from 'next/link';

export default function ItemClaimerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [receipt, setReceipt] = useState<ReceiptType | null>(null);
  const [items, setItems] = useState<ReceiptItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const { claimerName, setName, isLoggedIn } = useClaimerSession();
  const [nameInput, setNameInput] = useState('');

  const itemIds = items.map(item => item.id);
  const claimsByItemId = useReceiptClaims(receipt?.id || '', itemIds);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch the receipt and items using the service
        const { receiptData, items: itemsData } = await receiptService.getReceipt(id);

        // Note: Claims are handled by the useReceiptClaims hook

        setReceipt(receiptData);
        setItems(itemsData || []);
        // setClaimsByItemId(claimsByItem); // This line is removed as per the edit hint
      } catch (error) {
        console.error('Error fetching receipt data:', error);
        setReceipt(null);
        setItems([]);
        // setClaimsByItemId({}); // This line is removed as per the edit hint
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleItemClick = (item: ReceiptItemType) => {
    console.log('Item claimer clicked item:', item);
  };

  // Calculate the current user's payment amount based on their claims
  const calculateUserPaymentAmount = () => {
    if (!receipt || !claimerName) return { subtotal: 0, tax: 0, tip: 0, total: 0 };

    let userSubtotal = 0;
    let userTax = 0;
    let userTip = 0;

    const receiptSubtotal = receipt.subtotal || 0;
    const receiptTax = receipt.tax || 0;
    const receiptTip = receipt.tip || 0;

    items.forEach(item => {
      const itemClaims = claimsByItemId[item.id] || [];
      const userClaims = itemClaims.filter(claim => claim.claimer === claimerName);
      
      if (userClaims.length > 0) {
        const userPortion = userClaims.reduce((sum, claim) => sum + (claim.portion || 0), 0);
        const itemSubtotal = item.price * userPortion;
        userSubtotal += itemSubtotal;
        
        // Calculate proportional tax and tip
        if (receiptSubtotal > 0) {
          const itemProportion = (item.price * item.quantity) / receiptSubtotal;
          const portionProportion = userPortion / item.quantity;
          userTax += receiptTax * itemProportion * portionProportion;
          userTip += receiptTip * itemProportion * portionProportion;
        }
      }
    });

    return {
      subtotal: userSubtotal,
      tax: userTax,
      tip: userTip,
      total: userSubtotal + userTax + userTip
    };
  };

  const userPayment = calculateUserPaymentAmount();
  const hasClaimedItems = userPayment.total > 0;

  const getFronterName = () => {
    if (!receipt?.created_by) return 'the person who paid';
    return receipt.created_by;
  };

  if (loading) {
    return (
      <div className="activity-container">
        <div className="back-button-container">
          <Link href="/" className="back-button">
            ← Back to Home
          </Link>
        </div>
        <div className="loading-state">
          <div className="loading-spinner">⏳</div>
          <p>Loading receipt...</p>
        </div>
      </div>
    );
  }
  
  if (!receipt) {
    return (
      <div className="activity-container">
        <div className="empty-transactions">
          <div className="empty-icon">❌</div>
          <h3 className="empty-title">Receipt Not Found</h3>
          <p className="empty-description">
            The receipt you're looking for doesn't exist or has been deleted.
          </p>
          <Link href="/" className="empty-action-button">
            🏠 Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="activity-container">
      {/* Back Button */}
      <div className="back-button-container">
        <Link href="/" className="back-button">
          ← Back to Home
        </Link>
      </div>

      {!isLoggedIn && (
        <div className="modal-overlay">
          <div className="name-entry-modal">
            <div className="modal-header">
              <h2 className="modal-title">Welcome!</h2>
              <p className="modal-subtitle">Enter your name to claim items and track your portion of the bill</p>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label className="form-label">Your Name</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Enter your name"
                  className="form-input"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && nameInput.trim()) {
                      setName(nameInput.trim());
                    }
                  }}
                />
              </div>
              <div className="modal-actions">
                <button
                  className="action-button primary"
                  onClick={() => {
                    if (nameInput.trim()) setName(nameInput.trim());
                  }}
                  disabled={!nameInput.trim()}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* The rest of your page is only visible if logged in */}
      {isLoggedIn && (
        <>
          <div className="page-header">
            <h2 className="page-title">Claim Your Items</h2>
            <p className="page-description">
              Click on the items you ordered to claim them and pay your share.
            </p>
          </div>
          
          <div className="item-claimer-layout">
            <div className="receipt-section">
              <Receipt 
                receipt={receipt}
                items={items}
                claimsByItemId={claimsByItemId}
                onItemClick={handleItemClick}
                viewType="item-claimer"
              />
            </div>
            
            <div className="payment-card-section">
              <div className="payment-card">
                <div className="payment-card-header">
                  <h3 className="payment-card-title">Your Payment</h3>
                  <p className="payment-card-subtitle">
                    {hasClaimedItems ? 'Amount you owe' : 'No items claimed yet'}
                  </p>
                </div>
                
                {hasClaimedItems && (
                  <div className="payment-breakdown">
                    <div className="breakdown-line">
                      <span className="breakdown-label">Items</span>
                      <span className="breakdown-value">${userPayment.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="breakdown-line">
                      <span className="breakdown-label">Tax</span>
                      <span className="breakdown-value">${userPayment.tax.toFixed(2)}</span>
                    </div>
                    <div className="breakdown-line">
                      <span className="breakdown-label">Tip</span>
                      <span className="breakdown-value">${userPayment.tip.toFixed(2)}</span>
                    </div>
                    <div className="breakdown-line total-line">
                      <span className="breakdown-label">Total</span>
                      <span className="breakdown-value">${userPayment.total.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                
                <div className="payment-card-actions">
                  {hasClaimedItems ? (
                    <a 
                      href={`https://cash.app/account/pay-and-request?amount=${userPayment.total.toFixed(2)}`}
                      className="payment-button primary"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Pay {getFronterName()}
                    </a>
                  ) : (
                    <div className="payment-button disabled">
                      Claim items to pay
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
