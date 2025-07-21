import React from 'react';
import { Receipt as ReceiptType, ReceiptItem as ReceiptItemType, ItemClaim as ItemClaimType } from '@/types/supabase';

interface PaymentSummaryProps {
  receipt: ReceiptType;
  items: (ReceiptItemType & { claimers: ItemClaimType[] })[];
  isVisible: boolean;
  onClose: () => void;
}

const PaymentSummary: React.FC<PaymentSummaryProps> = ({ receipt, items, isVisible, onClose }) => {
  if (!isVisible) return null;

  const calculateAmounts = () => {
    let paidAmount = 0;
    let pendingAmount = 0;
    let unclaimedAmount = 0;

    const taxTipMultiplier = receipt.total / receipt.subtotal;

    items.forEach(item => {
      const itemSubtotal = item.price * item.quantity;
      const itemTotalWithTaxTip = itemSubtotal * taxTipMultiplier;

      // Compute status based on claimers
      let status = 'available';
      if (item.claimers.length > 0) {
        if (item.claimers.every(c => c.payment_status === 'paid')) {
          status = 'paid';
        } else {
          status = 'pending';
        }
      }

      if (status === 'paid') {
        paidAmount += itemTotalWithTaxTip;
      } else if (status === 'pending') {
        // Calculate paid portion from claimers who have paid
        const paidPortion = item.claimers
          .filter(claimer => claimer.payment_status === 'paid')
          .reduce((sum, claimer) => sum + (claimer.portion * item.price), 0);

        const paidPortionWithTaxTip = paidPortion * taxTipMultiplier;
        const pendingPortionWithTaxTip = (itemSubtotal - paidPortion) * taxTipMultiplier;

        paidAmount += paidPortionWithTaxTip;
        pendingAmount += pendingPortionWithTaxTip;
      } else if (status === 'available') {
        unclaimedAmount += itemTotalWithTaxTip;
      }
    });

    return { paidAmount, pendingAmount, unclaimedAmount };
  };

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const { paidAmount, pendingAmount, unclaimedAmount } = calculateAmounts();
  const totalAmount = receipt.total;
  const claimedAmount = paidAmount + pendingAmount;

  return (
    <>
      <div className="payment-summary-overlay" onClick={onClose} />
      <div className="payment-summary">
        <div className="summary-header">
          <h3 className="summary-title">Payment Status</h3>
          <button className="summary-close" onClick={onClose}>×</button>
        </div>
        <div className="summary-content">
          <div className="amount-breakdown">
            <div className="amount-item paid">
              <div className="amount-label">
                <span className="status-dot paid-dot"></span>
                Paid
              </div>
              <div className="amount-value">{formatPrice(paidAmount)}</div>
            </div>
            <div className="amount-item pending">
              <div className="amount-label">
                <span className="status-dot pending-dot"></span>
                Pending Payment
              </div>
              <div className="amount-value">{formatPrice(pendingAmount)}</div>
            </div>
            <div className="amount-item unclaimed">
              <div className="amount-label">
                <span className="status-dot unclaimed-dot"></span>
                Unclaimed
              </div>
              <div className="amount-value">{formatPrice(unclaimedAmount)}</div>
            </div>
          </div>
          <div className="summary-divider"></div>
          <div className="total-summary">
            <div className="total-line">
              <span className="total-label">Subtotal</span>
              <span className="total-value">{formatPrice(receipt.subtotal)}</span>
            </div>
            <div className="total-line">
              <span className="total-label">Tax</span>
              <span className="total-value">{formatPrice(receipt.tax)}</span>
            </div>
            <div className="total-line">
              <span className="total-label">Tip</span>
              <span className="total-value">{formatPrice(receipt.tip ?? 0)}</span>
            </div>
            <div className="total-line final">
              <span className="total-label">Total</span>
              <span className="total-value">{formatPrice(receipt.total)}</span>
            </div>
          </div>
          <div className="progress-bar">
            <div className="progress-label">Collection Progress</div>
            <div className="progress-track">
              <div 
                className="progress-fill paid-progress" 
                style={{ width: `${(paidAmount / totalAmount) * 100}%` }}
              ></div>
              <div 
                className="progress-fill pending-progress" 
                style={{ 
                  width: `${(pendingAmount / totalAmount) * 100}%`,
                  left: `${(paidAmount / totalAmount) * 100}%`
                }}
              ></div>
              <div 
                className="progress-fill unclaimed-progress" 
                style={{ 
                  width: `${(unclaimedAmount / totalAmount) * 100}%`,
                  left: `${((paidAmount + pendingAmount) / totalAmount) * 100}%`
                }}
              ></div>
            </div>
            <div className="progress-percentage">
              {Math.round((claimedAmount / totalAmount) * 100)}% claimed
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PaymentSummary;