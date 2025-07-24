'use client';

import { useEffect, useState } from 'react';
import { receiptService } from '@/services/receipts';
import { formatPrice, formatDate } from '@/utils/formatters';
import Link from 'next/link';

export default function HomePage() {
  const [receipts, setReceipts] = useState<any[]>([]);

  useEffect(() => {
    async function fetchReceipts() {
      try {
        const data = await receiptService.getAllReceipts();
        setReceipts(data);
      } catch (error) {
        console.error('Error fetching receipts:', error);
      }
    }
    fetchReceipts();
  }, []);


  return (
    <div className="page-container">
      <div className="navbar-spacer"></div>
      <div className="page-header">
        <h1 className="page-title">Split receipts with friends</h1>
        <p className="page-description">
          Upload a receipt and easily split the bill with your friends. Everyone pays their fair share.
        </p>
      </div>

      {receipts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <h3 className="empty-state-title">No receipts yet</h3>
          <p className="empty-state-description">
            Upload your first receipt to get started splitting bills with friends.
          </p>
          <Link href="/create-receipt" className="action-button primary">
            <span>📷</span>
            Upload Receipt
          </Link>
        </div>
      ) : (
        <div className="receipts-grid">
          {receipts.map((receipt) => (
            <div key={receipt.id} className="receipt-card">
              <div className="receipt-card-header">
                <div className="receipt-icon">🍽️</div>
                <div className="receipt-info">
                  <h3 className="receipt-title">{receipt.merchant_name}</h3>
                  <p className="receipt-description">{receipt.description}</p>
                  <div className="receipt-meta">
                    <span className="receipt-date">{formatDate(receipt.date)}</span>
                    <span className="receipt-total">{formatPrice(receipt.total)}</span>
                  </div>
                </div>
              </div>
              <div className="receipt-actions">
                <Link 
                  href={`/bill-fronter/${receipt.id}`} 
                  className="action-button primary"
                >
                  <span>💳</span>
                  I Paid the Bill
                </Link>
                <Link 
                  href={`/item-claimer/${receipt.id}`} 
                  className="action-button secondary"
                >
                  <span>🛒</span>
                  Claim My Items
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="home-footer">
        <p>💡 <strong>Pro tip:</strong> Share the "Claim My Items" link with friends so they can select their items and pay you back instantly.</p>
      </div>

    </div>
  );
}
