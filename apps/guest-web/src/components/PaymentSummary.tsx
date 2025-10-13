import React from 'react';
import { Receipt as ReceiptType, ReceiptItem as ReceiptItemType, ItemClaim as ItemClaimType } from '@/types/supabase';
import { formatPrice } from '@/utils/formatters';

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

    // Handle null tip and ensure we have valid numbers
    const receiptSubtotal = receipt.subtotal || 0;
    const receiptTax = receipt.tax || 0;
    const receiptTip = receipt.tip || 0;
    const receiptTotal = receipt.total || 0;

    // Calculate the total of all items at their base price
    const itemsSubtotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
    
    items.forEach(item => {
      const itemSubtotal = (item.price || 0) * (item.quantity || 1);
      
      // Calculate this item's share of tax and tip based on its proportion of the subtotal
      let itemTotalWithTaxTip = itemSubtotal;
      if (receiptSubtotal > 0) {
        const itemProportion = itemSubtotal / receiptSubtotal;
        const itemTax = receiptTax * itemProportion;
        const itemTip = receiptTip * itemProportion;
        itemTotalWithTaxTip = itemSubtotal + itemTax + itemTip;
      }

      // Compute status based on claimers
      let status = 'available';
      if (item.claimers.length > 0) {
        if (item.claimers.every(c => c.payment_status === 'paid')) {
          status = 'settled';
        } else {
          status = 'claimed';
        }
      }

      if (status === 'settled') {
        paidAmount += itemTotalWithTaxTip;
      } else if (status === 'claimed') {
        // Calculate paid and pending portions for claimed items
        const totalClaimedPortion = item.claimers.reduce((sum, claimer) => sum + (claimer.portion || 0), 0);
        const paidPortion = item.claimers
          .filter(claimer => claimer.payment_status === 'paid')
          .reduce((sum, claimer) => sum + (claimer.portion || 0), 0);
        
        const pendingPortion = Math.max(0, totalClaimedPortion - paidPortion);
        
        // Calculate actual amounts with tax and tip
        const paidPortionWithTaxTip = (paidPortion * itemTotalWithTaxTip) / (item.quantity || 1);
        const pendingPortionWithTaxTip = (pendingPortion * itemTotalWithTaxTip) / (item.quantity || 1);

        paidAmount += paidPortionWithTaxTip;
        pendingAmount += pendingPortionWithTaxTip;
      } else if (status === 'available') {
        unclaimedAmount += itemTotalWithTaxTip;
      }
    });

    return { 
      paidAmount: isNaN(paidAmount) ? 0 : paidAmount,
      pendingAmount: isNaN(pendingAmount) ? 0 : pendingAmount,
      unclaimedAmount: isNaN(unclaimedAmount) ? 0 : unclaimedAmount
    };
  };

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
            <div className="amount-item settled">
              <div className="amount-label">
                <span className="status-dot settled-dot"></span>
                Settled
              </div>
              <div className="amount-value">{formatPrice(paidAmount)}</div>
            </div>
            <div className="amount-item claimed">
              <div className="amount-label">
                <span className="status-dot claimed-dot"></span>
                Claimed
              </div>
              <div className="amount-value">{formatPrice(pendingAmount)}</div>
            </div>
            <div className="amount-item available">
              <div className="amount-label">
                <span className="status-dot available-dot"></span>
                Available
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
                className="progress-fill settled-progress" 
                style={{ width: `${totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0}%` }}
              ></div>
              <div 
                className="progress-fill claimed-progress" 
                style={{ 
                  width: `${totalAmount > 0 ? (pendingAmount / totalAmount) * 100 : 0}%`,
                  left: `${totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0}%`
                }}
              ></div>
              <div 
                className="progress-fill available-progress" 
                style={{ 
                  width: `${totalAmount > 0 ? (unclaimedAmount / totalAmount) * 100 : 0}%`,
                  left: `${totalAmount > 0 ? ((paidAmount + pendingAmount) / totalAmount) * 100 : 0}%`
                }}
              ></div>
            </div>
            <div className="progress-percentage">
              {totalAmount > 0 ? Math.round((claimedAmount / totalAmount) * 100) : 0}% claimed
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PaymentSummary;