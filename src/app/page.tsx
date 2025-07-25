'use client';

import { useEffect, useState } from 'react';
import { receiptService } from '@/services/receipts';
import { settlementService, ReceiptWithSettlement } from '@/services/settlementStatus';
import { formatPrice, formatDate } from '@/utils/formatters';
import Link from 'next/link';

export default function HomePage() {
  const [receipts, setReceipts] = useState<ReceiptWithSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchReceipts() {
      try {
        setLoading(true);
        const data = await receiptService.getAllReceipts();
        const receiptsWithSettlement = await settlementService.getReceiptsWithSettlement(data);
        setReceipts(receiptsWithSettlement);
      } catch (error) {
        console.error('Error fetching receipts:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchReceipts();
  }, []);

  // Calculate summary amounts
  const calculateSummary = () => {
    let friendsOweYou = 0.00;
    let youOwe = 0.00;
    
    // Calculate from receipts data
    receipts.forEach(receipt => {
      // For receipts you created (My Scans), friends still owe you the claimed (but not settled) amount
      friendsOweYou += receipt.settlement.claimedAmount;
      
      // TODO: For receipts shared with you (Shared With Me), calculate what you owe
      // This would require knowing which receipts are shared with you vs created by you
      // For now, youOwe stays 0.00 since we don't have "Shared With Me" data yet
    });
    
    return {
      friendsOweYou,
      youOwe
    };
  };

  const summary = calculateSummary();

  // Filter receipts based on search query
  const filteredReceipts = receipts.filter(receipt => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      receipt.merchant_name?.toLowerCase().includes(query) ||
      receipt.description?.toLowerCase().includes(query) ||
      formatDate(receipt.date).toLowerCase().includes(query) ||
      formatPrice(receipt.total).toLowerCase().includes(query) ||
      receipt.total.toString().includes(query)
    );
  });

  const copyShareLink = async (receiptId: string) => {
    const shareUrl = `${window.location.origin}/item-claimer/${receiptId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      // TODO: Show success toast
      alert('Link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy link:', err);
      // Fallback: show the link in a prompt
      prompt('Copy this link:', shareUrl);
    }
  };

  const deleteReceipt = async (receiptId: string, merchantName: string) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the receipt from ${merchantName}? This action cannot be undone.`
    );
    
    if (!confirmDelete) return;

    try {
      await receiptService.deleteReceipt(receiptId);
      // Refresh the receipts list
      setLoading(true);
      const data = await receiptService.getAllReceipts();
      const receiptsWithSettlement = await settlementService.getReceiptsWithSettlement(data);
      setReceipts(receiptsWithSettlement);
      setLoading(false);
    } catch (error) {
      console.error('Failed to delete receipt:', error);
      alert('Failed to delete receipt. Please try again.');
    }
  };

  return (
    <div className="activity-container">
      {/* Hero Section */}
      <div className="hero-section">
        <div className="hero-icon">
          <img src="/infinite-receipt-light.svg" alt="Calculator" width="160" height="160" />
        </div>
        <h1 className="hero-title">Get paid back for group bills</h1>
        <p className="hero-description">
          Fronted the bill? Scan your receipt, share the link, and let friends claim and pay for their items.
        </p>
        <Link href="/create-receipt" className="hero-action-button">
          <span>📷</span>
          Scan Receipt
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-icon">💰</div>
          <div className="summary-content">
            <div className="summary-label">Friends still owe you</div>
            <div className="summary-amount">{formatPrice(summary.friendsOweYou)}</div>
            <div className="summary-subtitle">From receipts you created</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">💳</div>
          <div className="summary-content">
            <div className="summary-label">You owe</div>
            <div className="summary-amount">{formatPrice(summary.youOwe)}</div>
            <div className="summary-subtitle">From receipts shared with you</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="search-section">
        <div className="search-container">
          <div className="search-icon">🔍</div>
          <input 
            type="text" 
            placeholder="Search receipts by merchant, description, date, or amount..." 
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              className="search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="search-results-info">
            {filteredReceipts.length} result{filteredReceipts.length !== 1 ? 's' : ''} found
          </div>
        )}
      </div>

      {/* My Scans Section */}
      <div className="receipts-section">
        <div className="section-header">
          <h2 className="section-title">My Scans</h2>
        </div>
        
{loading ? (
          <div className="loading-state">
            <div className="loading-spinner">⏳</div>
            <p>Loading receipts...</p>
          </div>
        ) : filteredReceipts.length === 0 && !searchQuery ? (
          <div className="empty-transactions">
            <div className="empty-icon">📄</div>
            <h3 className="empty-title">No receipts yet</h3>
            <p className="empty-description">
              Scan your first receipt to start splitting bills with friends.
            </p>
            <Link href="/create-receipt" className="empty-action-button">
              <span>📷</span>
              Scan Receipt
            </Link>
          </div>
        ) : filteredReceipts.length === 0 && searchQuery ? (
          <div className="empty-transactions">
            <div className="empty-icon">🔍</div>
            <h3 className="empty-title">No receipts found</h3>
            <p className="empty-description">
              Try searching with different keywords or check your spelling.
            </p>
          </div>
        ) : (
          <div className="transactions-list">
            {filteredReceipts.map((receipt) => (
              <div key={receipt.id} className="transaction-item my-scan-item">
                <div className="transaction-icon">🍽️</div>
                <div className="transaction-details">
                  <div className="transaction-title">{receipt.merchant_name}</div>
                  <div className="transaction-description">{receipt.description}</div>
                  <div className="transaction-date">{formatDate(receipt.date)}</div>
                  <div className="settlement-status">
                    <div className="settlement-amounts">
                      <span className="settlement-amount settled">
                        {formatPrice(receipt.settlement.settledAmount)} settled
                      </span>
                      <span className="settlement-amount claimed">
                        {formatPrice(receipt.settlement.claimedAmount)} claimed
                      </span>
                      <span className="settlement-amount available">
                        {formatPrice(receipt.settlement.availableAmount)} available
                      </span>
                    </div>
                    <div className="settlement-progress">
                      <div 
                        className="settlement-progress-bar settled"
                        style={{ width: `${receipt.settlement.settlementPercentage}%` }}
                      />
                      <div 
                        className="settlement-progress-bar claimed"
                        style={{ 
                          width: `${(receipt.settlement.claimedAmount / receipt.settlement.totalAmount) * 100}%`,
                          left: `${receipt.settlement.settlementPercentage}%`
                        }}
                      />
                    </div>
                    <div className="settlement-percentages">
                      <span className="settlement-percentage settled">
                        {Math.round(receipt.settlement.settlementPercentage)}% settled
                      </span>
                      <span className="settlement-percentage claimed">
                        {Math.round((receipt.settlement.claimedAmount / receipt.settlement.totalAmount) * 100)}% claimed
                      </span>
                    </div>
                  </div>
                </div>
                <div className="transaction-amount-section">
                  <div className="transaction-amount">{formatPrice(receipt.total)}</div>
                  <div className={`settlement-badge ${receipt.settlement.isFullySettled ? 'settled' : 'pending'}`}>
                    {receipt.settlement.isFullySettled ? 'Fully Settled' : 'Pending'}
                  </div>
                </div>
                <div className="transaction-actions">
                  <Link 
                    href={`/bill-fronter/${receipt.id}`} 
                    className="transaction-action-button primary"
                  >
                    📊 View Receipt
                  </Link>
                  <button 
                    onClick={() => copyShareLink(receipt.id)}
                    className="transaction-action-button secondary"
                  >
                    📋 Copy Link
                  </button>
                  <button 
                    onClick={() => deleteReceipt(receipt.id, receipt.merchant_name || 'Unknown')}
                    className="transaction-action-button danger"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shared With Me Section */}
      <div className="receipts-section">
        <div className="section-header">
          <h2 className="section-title">Shared With Me</h2>
        </div>
        
        <div className="empty-transactions">
          <div className="empty-icon">📤</div>
          <h3 className="empty-title">No shared receipts</h3>
          <p className="empty-description">
            When friends share receipts with you, they'll appear here.
          </p>
        </div>
      </div>
    </div>
  );
}
