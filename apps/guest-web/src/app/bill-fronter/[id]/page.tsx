'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Receipt from '@/components/Receipt';
import PaymentSummary from '@/components/PaymentSummary';
import { receiptService } from '@/services/receipts';
import { Receipt as ReceiptType, ReceiptItem as ReceiptItemType } from '@/types/supabase';
import { useReceiptClaims } from '@/hooks/useReceiptClaims';
import Link from 'next/link';

export default function BillFronterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [receipt, setReceipt] = useState<ReceiptType | null>(null);
  const [items, setItems] = useState<ReceiptItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);

  const itemIds = items.map(item => item.id);
  const claimsByItemId = useReceiptClaims(receipt?.id || '', itemIds);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch the receipt and items using the service
        const { receiptData, items: itemsData } = await receiptService.getReceipt(id);
        
        setReceipt(receiptData);
        setItems(itemsData || []);
      } catch (error) {
        console.error('Error fetching receipt data:', error);
        setReceipt(null);
        setItems([]);
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="activity-container">
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

  const mappedItems = items.map(item => ({ ...item, claimers: claimsByItemId[item.id] || [] }));

  const handleItemClick = (item: ReceiptItemType) => {
    console.log('Bill fronter clicked item:', item);
  };

  const openPaymentSummary = () => setShowPaymentSummary(true);
  const closePaymentSummary = () => setShowPaymentSummary(false);


  const copyShareLink = async () => {
    const shareUrl = `${window.location.origin}/item-claimer/${id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      // TODO: Replace with toast notification
      alert('Link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy link:', err);
      // Fallback: show the link in a prompt
      prompt('Copy this link:', shareUrl);
    }
  };

  return (
    <div className="activity-container">
      {/* Back Button */}
      <div className="back-button-container">
        <Link href="/" className="back-button">
          ← Back to Home
        </Link>
      </div>

      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Receipt Dashboard</h1>
        <p className="page-description">
          Share this receipt with friends so they can claim and pay for their items.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="fronter-actions">
        <button 
          className="action-button primary"
          onClick={copyShareLink}
        >
          📋 Copy Share Link
        </button>
        <button 
          className="action-button secondary"
          onClick={openPaymentSummary}
        >
          📊 View Payment Status
        </button>
      </div>

      {/* Receipt Display */}
      <Receipt 
        receipt={receipt}
        items={mappedItems}
        claimsByItemId={claimsByItemId}
        onItemClick={handleItemClick}
        viewType="bill-fronter"
      />

      {/* Payment Summary Modal */}
      <PaymentSummary 
        receipt={receipt}
        items={mappedItems}
        isVisible={showPaymentSummary}
        onClose={closePaymentSummary}
      />


    </div>
  );
}
