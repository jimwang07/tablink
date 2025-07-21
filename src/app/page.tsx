import Link from 'next/link';
import { mockReceipt12, mockReceipt, mockReceipt3 } from '../../data/mockReceipt';

export default function HomePage() {
  const receipts = [
    {
      receipt: mockReceipt12,
      title: 'The Green Kitchen',
      description: 'Italian restaurant dinner with Alice, Bob, and Charlie',
      image: '🍕'
    },
    {
      receipt: mockReceipt,
      title: 'The Krusty Krab',
      description: 'Underwater dining with SpongeBob and friends',
      image: '🍔'
    },
    {
      receipt: mockReceipt3,
      title: 'Ichiraku Ramen',
      description: 'Hidden Leaf Village feast with Team 7 and friends',
      image: '🍜'
    }
  ];

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
        {receipts.map((receiptData) => (
          <div key={receiptData.receipt.id} className="receipt-card">
            <div className="receipt-card-header">
              <div className="receipt-icon">{receiptData.image}</div>
              <div className="receipt-info">
                <h3 className="receipt-title">{receiptData.title}</h3>
                <p className="receipt-description">{receiptData.description}</p>
                <div className="receipt-meta">
                  <span className="receipt-date">{formatDate(receiptData.receipt.date)}</span>
                  <span className="receipt-total">{formatPrice(receiptData.receipt.total)}</span>
                </div>
              </div>
            </div>
            
            <div className="receipt-stats">
              <div className="stat">
                <span className="stat-number">{receiptData.receipt.items.length}</span>
                <span className="stat-label">Items</span>
              </div>
              <div className="stat">
                <span className="stat-number">
                  {receiptData.receipt.items.reduce((total, item) => total + item.claimers.length, 0)}
                </span>
                <span className="stat-label">Claims</span>
              </div>
            </div>

            <div className="receipt-actions">
              <Link 
                href={`/bill-fronter/${receiptData.receipt.id}`} 
                className="action-button primary"
              >
                I Paid the Bill
              </Link>
              <Link 
                href={`/item-claimer/${receiptData.receipt.id}`} 
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
