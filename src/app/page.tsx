'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/libs/supabase';
import Link from 'next/link';

export default function HomePage() {
  const [receipts, setReceipts] = useState<any[]>([]);

  useEffect(() => {
    async function fetchReceipts() {
      const { data, error } = await supabase.from('receipts').select('*');
      if (error) {
        console.error('Error fetching receipts:', error);
      } else {
        setReceipts(data || []);
      }
    }
    fetchReceipts();
  }, []);

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="page-container">
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
            <div className="receipt-actions">
              <Link 
                href={`/bill-fronter/${receipt.id}`} 
                className="action-button primary"
              >
                I Paid the Bill
              </Link>
              <Link 
                href={`/item-claimer/${receipt.id}`} 
                className="action-button secondary"
              >
                Claim My Items
              </Link>
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

