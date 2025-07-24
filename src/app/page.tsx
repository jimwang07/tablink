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
        <h1 className="page-title">SplitCash</h1>
        <p className="page-description">
          Select a receipt to start splitting the bill with your friends
        </p>
      </div>

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
            {/* You can add stats and actions here, depending on your schema */}
            <div className="receipt-actions-container">
              <div className="receipt-actions-divider"></div>
              <div className="receipt-actions">
                <Link 
                  href={`/bill-fronter/${receipt.id}`} 
                  className="action-button primary"
                >
                  Fronter
                </Link>
                <Link 
                  href={`/item-claimer/${receipt.id}`} 
                  className="action-button secondary"
                >
                  Claimer
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="home-footer">
        <p>💡 <strong>Tip:</strong> Share the "Claim My Items" link with friends so they can claim their items and pay you back!</p>
      </div>
    </div>
  );
}

