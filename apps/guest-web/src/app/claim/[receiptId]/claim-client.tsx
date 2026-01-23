'use client';

import { useState, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

type ReceiptItem = {
  id: string;
  label: string;
  price_cents: number;
  quantity: number;
  position: number | null;
};

type Receipt = {
  id: string;
  merchant_name: string | null;
  receipt_date: string | null;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  status: string;
};

type ItemClaim = {
  id: string;
  item_id: string;
  participant_id: string;
  portion: number;
  amount_cents: number;
};

type Participant = {
  id: string;
  display_name: string;
  emoji: string | null;
  color_token: string | null;
};

const EMOJIS = ['😀', '🎉', '🍕', '🌟', '🎸', '🌈', '🚀', '🎨', '🍦', '🎯'];
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Props = {
  receiptId: string;
  receipt: Receipt;
  items: ReceiptItem[];
  initialClaims: ItemClaim[];
  initialParticipants: Participant[];
};

export function ClaimPageClient({ receiptId, receipt, items, initialClaims, initialParticipants }: Props) {
  const [claims, setClaims] = useState<ItemClaim[]>(initialClaims);
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [guestName, setGuestName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = useCallback(async () => {
    if (!guestName.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];

      const { data, error: insertError } = await supabase
        .from('receipt_participants')
        .insert({
          receipt_id: receiptId,
          display_name: guestName.trim(),
          emoji,
          color_token: color,
          role: 'guest',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setCurrentParticipant(data);
      setParticipants(prev => [...prev, data]);
    } catch (err) {
      console.error('Failed to join:', err);
      setError('Failed to join. Please try again.');
    } finally {
      setIsJoining(false);
    }
  }, [guestName, receiptId]);

  const handleClaimItem = useCallback(async (itemId: string) => {
    if (!currentParticipant) return;

    const item = items.find(i => i.id === itemId);
    if (!item) return;

    try {
      const supabase = getSupabaseClient();

      // Check if already claimed by this participant
      const existingClaim = claims.find(
        c => c.item_id === itemId && c.participant_id === currentParticipant.id
      );

      if (existingClaim) {
        // Remove claim
        const { error: deleteError } = await supabase
          .from('item_claims')
          .delete()
          .eq('id', existingClaim.id);

        if (deleteError) throw deleteError;

        setClaims(prev => prev.filter(c => c.id !== existingClaim.id));
      } else {
        // Add claim
        const { data, error: insertError } = await supabase
          .from('item_claims')
          .insert({
            item_id: itemId,
            participant_id: currentParticipant.id,
            portion: 1,
            amount_cents: item.price_cents,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        setClaims(prev => [...prev, data]);
      }
    } catch (err) {
      console.error('Failed to update claim:', err);
      setError('Failed to update claim. Please try again.');
    }
  }, [currentParticipant, items, claims]);

  const getItemClaimers = (itemId: string) => {
    const itemClaims = claims.filter(c => c.item_id === itemId);
    return itemClaims.map(claim => {
      const participant = participants.find(p => p.id === claim.participant_id);
      return participant;
    }).filter(Boolean) as Participant[];
  };

  const isClaimedByMe = (itemId: string) => {
    if (!currentParticipant) return false;
    return claims.some(c => c.item_id === itemId && c.participant_id === currentParticipant.id);
  };

  const myTotal = currentParticipant
    ? claims
        .filter(c => c.participant_id === currentParticipant.id)
        .reduce((sum, c) => sum + c.amount_cents, 0)
    : 0;

  // Calculate share of tax and tip proportionally
  const itemsTotal = items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
  const myShare = itemsTotal > 0 ? myTotal / itemsTotal : 0;
  const myTax = Math.round(receipt.tax_cents * myShare);
  const myTip = Math.round(receipt.tip_cents * myShare);
  const myGrandTotal = myTotal + myTax + myTip;

  if (!currentParticipant) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">
                {receipt.merchant_name || 'Split the Bill'}
              </h1>
              {receipt.receipt_date && (
                <p className="text-gray-400 text-sm">{formatDate(receipt.receipt_date)}</p>
              )}
              <p className="text-gray-300 mt-4">
                Total: <span className="font-semibold">{formatCents(receipt.total_cents)}</span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  Enter your name to claim items
                </label>
                <input
                  id="name"
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="Your name"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              <button
                onClick={handleJoin}
                disabled={isJoining || !guestName.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {isJoining ? 'Joining...' : 'Join & Claim Items'}
              </button>

              {participants.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-700">
                  <p className="text-sm text-gray-400 mb-2">Already joined:</p>
                  <div className="flex flex-wrap gap-2">
                    {participants.map(p => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 rounded-full text-sm text-gray-300"
                      >
                        <span>{p.emoji}</span>
                        <span>{p.display_name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">
                {receipt.merchant_name || 'Receipt'}
              </h1>
              {receipt.receipt_date && (
                <p className="text-sm text-gray-400">{formatDate(receipt.receipt_date)}</p>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 rounded-full">
              <span>{currentParticipant.emoji}</span>
              <span className="text-white text-sm">{currentParticipant.display_name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Items List */}
      <main className="flex-1 overflow-auto p-4">
        <div className="max-w-lg mx-auto space-y-2">
          <p className="text-gray-400 text-sm mb-4">Tap items to claim them</p>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {items.map(item => {
            const claimers = getItemClaimers(item.id);
            const isMine = isClaimedByMe(item.id);

            return (
              <button
                key={item.id}
                onClick={() => handleClaimItem(item.id)}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  isMine
                    ? 'bg-blue-900/30 border-blue-600'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <span className="text-white">{item.label}</span>
                    {item.quantity > 1 && (
                      <span className="text-gray-400 text-sm ml-2">×{item.quantity}</span>
                    )}
                  </div>
                  <span className="text-white font-medium ml-4">
                    {formatCents(item.price_cents * item.quantity)}
                  </span>
                </div>

                {claimers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {claimers.map(claimer => (
                      <span
                        key={claimer.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700 rounded text-xs"
                        style={{ borderLeft: `3px solid ${claimer.color_token}` }}
                      >
                        <span>{claimer.emoji}</span>
                        <span className="text-gray-300">{claimer.display_name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </main>

      {/* Footer with totals */}
      <footer className="bg-gray-800 border-t border-gray-700 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Your items</span>
              <span>{formatCents(myTotal)}</span>
            </div>
            {receipt.tax_cents > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>Tax (proportional)</span>
                <span>{formatCents(myTax)}</span>
              </div>
            )}
            {receipt.tip_cents > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>Tip (proportional)</span>
                <span>{formatCents(myTip)}</span>
              </div>
            )}
            <div className="flex justify-between text-white font-semibold text-lg pt-2 border-t border-gray-700">
              <span>Your total</span>
              <span>{formatCents(myGrandTotal)}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
