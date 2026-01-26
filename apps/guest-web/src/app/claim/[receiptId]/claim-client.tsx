'use client';

import { useState, useCallback, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Theme colors matching mobile app
const colors = {
  background: '#080A0C',
  surface: '#111418',
  surfaceBorder: '#1C2126',
  muted: '#5A6371',
  text: '#F5F7FA',
  textSecondary: '#C3C8D4',
  primary: '#2DD36F',
  danger: '#FF5C5C',
  warning: '#FFB347',
};

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

const EMOJIS = ['😀', '🎉', '🍕', '🌟', '🎸', '🌈', '🚀', '🎨', '🍦', '🎯', '🦊', '🐱', '🦁', '🐸'];
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#74b9ff', '#fd79a8'];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
  const [claimingItemId, setClaimingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to realtime updates
  useEffect(() => {
    const supabase = getSupabaseClient();
    const itemIds = items.map(i => i.id);

    const channel = supabase
      .channel(`receipt:${receiptId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'item_claims',
        },
        (payload: RealtimePostgresChangesPayload<ItemClaim>) => {
          if (payload.eventType === 'INSERT') {
            const newClaim = payload.new as ItemClaim;
            // Only add if it's for an item on this receipt and not already in our list
            if (itemIds.includes(newClaim.item_id)) {
              setClaims(prev => {
                if (prev.some(c => c.id === newClaim.id)) return prev;
                return [...prev, newClaim];
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const oldClaim = payload.old as { id: string };
            setClaims(prev => prev.filter(c => c.id !== oldClaim.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'receipt_participants',
          filter: `receipt_id=eq.${receiptId}`,
        },
        (payload: RealtimePostgresChangesPayload<Participant>) => {
          const newParticipant = payload.new as Participant;
          setParticipants(prev => {
            if (prev.some(p => p.id === newParticipant.id)) return prev;
            return [...prev, newParticipant];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [receiptId, items]);

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
    if (!currentParticipant || claimingItemId) return;

    const item = items.find(i => i.id === itemId);
    if (!item) return;

    setClaimingItemId(itemId);
    setError(null);

    try {
      const supabase = getSupabaseClient();

      const existingClaim = claims.find(
        c => c.item_id === itemId && c.participant_id === currentParticipant.id
      );

      if (existingClaim) {
        const { error: deleteError } = await supabase
          .from('item_claims')
          .delete()
          .eq('id', existingClaim.id);

        if (deleteError) throw deleteError;
        setClaims(prev => prev.filter(c => c.id !== existingClaim.id));
      } else {
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
    } finally {
      setClaimingItemId(null);
    }
  }, [currentParticipant, items, claims, claimingItemId]);

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

  const itemsTotal = items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
  const myShare = itemsTotal > 0 ? myTotal / itemsTotal : 0;
  const myTax = Math.round(receipt.tax_cents * myShare);
  const myTip = Math.round(receipt.tip_cents * myShare);
  const myGrandTotal = myTotal + myTax + myTip;

  // Join screen
  if (!currentParticipant) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: colors.background }}>
        {/* Header */}
        <header className="px-6 pt-12 pb-4">
          <h1 className="text-2xl font-bold" style={{ color: colors.primary }}>Tablink</h1>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 pb-8">
          <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.surfaceBorder}` }}>
            {/* Receipt info */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: colors.surfaceBorder }}>
                <span className="text-3xl">🧾</span>
              </div>
              <h2 className="text-2xl font-bold mb-1" style={{ color: colors.text }}>
                {receipt.merchant_name || 'Split the Bill'}
              </h2>
              {receipt.receipt_date && (
                <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>{formatDate(receipt.receipt_date)}</p>
              )}
              <div className="inline-block px-4 py-2 rounded-full" style={{ backgroundColor: colors.surfaceBorder }}>
                <span style={{ color: colors.textSecondary }}>Total: </span>
                <span className="font-bold" style={{ color: colors.text }}>{formatCents(receipt.total_cents)}</span>
              </div>
            </div>

            {/* Join form */}
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Enter your name to claim items
                </label>
                <input
                  id="name"
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="Your name"
                  className="w-full px-4 py-3 rounded-xl text-base outline-none transition-all focus:ring-2"
                  style={{
                    backgroundColor: colors.background,
                    border: `1px solid ${colors.surfaceBorder}`,
                    color: colors.text,
                  }}
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm" style={{ color: colors.danger }}>{error}</p>
              )}

              <button
                onClick={handleJoin}
                disabled={isJoining || !guestName.trim()}
                className="w-full py-3.5 rounded-full font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: colors.primary,
                  color: colors.background,
                }}
              >
                {isJoining ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Joining...
                  </span>
                ) : 'Join & Claim Items'}
              </button>

              {participants.length > 0 && (
                <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${colors.surfaceBorder}` }}>
                  <p className="text-sm mb-3" style={{ color: colors.muted }}>Already joined:</p>
                  <div className="flex flex-wrap gap-2">
                    {participants.map(p => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
                        style={{ backgroundColor: colors.surfaceBorder, color: colors.textSecondary }}
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

  // Claim screen
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: colors.background }}>
      {/* Header */}
      <header className="sticky top-0 z-10 px-4 py-4" style={{ backgroundColor: colors.surface, borderBottom: `1px solid ${colors.surfaceBorder}` }}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold" style={{ color: colors.primary }}>Tablink</span>
              <span style={{ color: colors.surfaceBorder }}>|</span>
              <div>
                <h1 className="text-lg font-semibold" style={{ color: colors.text }}>
                  {receipt.merchant_name || 'Receipt'}
                </h1>
                {receipt.receipt_date && (
                  <p className="text-xs" style={{ color: colors.textSecondary }}>{formatDate(receipt.receipt_date)}</p>
                )}
              </div>
            </div>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: colors.surfaceBorder }}
            >
              <span>{currentParticipant.emoji}</span>
              <span className="text-sm font-medium" style={{ color: colors.text }}>{currentParticipant.display_name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Items List */}
      <main className="flex-1 overflow-auto px-4 py-4">
        <div className="max-w-lg mx-auto">
          <p className="text-sm mb-4" style={{ color: colors.muted }}>Tap items to claim them</p>

          {error && (
            <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: `${colors.danger}20`, border: `1px solid ${colors.danger}40` }}>
              <p className="text-sm" style={{ color: colors.danger }}>{error}</p>
            </div>
          )}

          <div className="space-y-2">
            {items.map(item => {
              const claimers = getItemClaimers(item.id);
              const isMine = isClaimedByMe(item.id);
              const isLoading = claimingItemId === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleClaimItem(item.id)}
                  disabled={isLoading}
                  className="w-full text-left p-4 rounded-xl transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: isMine ? `${colors.primary}15` : colors.surface,
                    border: `1px solid ${isMine ? colors.primary : colors.surfaceBorder}`,
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 flex items-center gap-2">
                      {isMine && (
                        <svg className="w-5 h-5 flex-shrink-0" style={{ color: colors.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      <div>
                        <span style={{ color: colors.text }}>{item.label}</span>
                        {item.quantity > 1 && (
                          <span className="text-sm ml-2" style={{ color: colors.textSecondary }}>×{item.quantity}</span>
                        )}
                      </div>
                    </div>
                    <span className="font-semibold ml-4" style={{ color: colors.text }}>
                      {formatCents(item.price_cents * item.quantity)}
                    </span>
                  </div>

                  {claimers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {claimers.map(claimer => (
                        <span
                          key={claimer.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                          style={{
                            backgroundColor: colors.surfaceBorder,
                            borderLeft: `3px solid ${claimer.color_token}`,
                          }}
                        >
                          <span>{claimer.emoji}</span>
                          <span style={{ color: colors.textSecondary }}>{claimer.display_name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Participants */}
          {participants.length > 1 && (
            <div className="mt-6 p-4 rounded-xl" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.surfaceBorder}` }}>
              <p className="text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>Splitting with</p>
              <div className="flex flex-wrap gap-2">
                {participants.filter(p => p.id !== currentParticipant.id).map(p => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
                    style={{ backgroundColor: colors.surfaceBorder, color: colors.textSecondary }}
                  >
                    <span>{p.emoji}</span>
                    <span>{p.display_name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer with totals */}
      <footer className="sticky bottom-0 px-4 py-4" style={{ backgroundColor: colors.surface, borderTop: `1px solid ${colors.surfaceBorder}` }}>
        <div className="max-w-lg mx-auto">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between" style={{ color: colors.textSecondary }}>
              <span>Your items</span>
              <span>{formatCents(myTotal)}</span>
            </div>
            {receipt.tax_cents > 0 && (
              <div className="flex justify-between" style={{ color: colors.textSecondary }}>
                <span>Tax (proportional)</span>
                <span>{formatCents(myTax)}</span>
              </div>
            )}
            {receipt.tip_cents > 0 && (
              <div className="flex justify-between" style={{ color: colors.textSecondary }}>
                <span>Tip (proportional)</span>
                <span>{formatCents(myTip)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold pt-3" style={{ color: colors.text, borderTop: `1px solid ${colors.surfaceBorder}` }}>
              <span>Your total</span>
              <span style={{ color: colors.primary }}>{formatCents(myGrandTotal)}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
