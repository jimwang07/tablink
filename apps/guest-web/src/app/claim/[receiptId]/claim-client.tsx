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
  payment_status?: string;
};

type OwnerProfile = {
  display_name: string | null;
  venmo_handle: string | null;
  cashapp_handle: string | null;
  paypal_handle: string | null;
  zelle_identifier: string | null;
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
  ownerProfile: OwnerProfile | null;
};

export function ClaimPageClient({ receiptId, receipt, items, initialClaims, initialParticipants, ownerProfile }: Props) {
  const [claims, setClaims] = useState<ItemClaim[]>(initialClaims);
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [guestName, setGuestName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showNewNameInput, setShowNewNameInput] = useState(false);
  const [claimingItemId, setClaimingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'paid'>('unpaid');
  const [copiedZelle, setCopiedZelle] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

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

  // Calculate totals - needed before payment callbacks
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

  const handleMarkPaid = useCallback(async (method: string) => {
    if (!currentParticipant || isMarkingPaid) return;

    setIsMarkingPaid(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();

      const { error: updateError } = await supabase
        .from('receipt_participants')
        .update({
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: method,
          payment_amount_cents: myGrandTotal,
        })
        .eq('id', currentParticipant.id);

      if (updateError) throw updateError;

      setPaymentStatus('paid');
      setCurrentParticipant(prev => prev ? { ...prev, payment_status: 'paid' } : null);
      // Also update the participants array so item highlighting works
      setParticipants(prev => prev.map(p =>
        p.id === currentParticipant.id ? { ...p, payment_status: 'paid' } : p
      ));
    } catch (err) {
      console.error('Failed to mark as paid:', err);
      setError('Failed to update payment status. Please try again.');
    } finally {
      setIsMarkingPaid(false);
    }
  }, [currentParticipant, isMarkingPaid, myGrandTotal]);

  const handleCopyZelle = useCallback(() => {
    if (ownerProfile?.zelle_identifier) {
      navigator.clipboard.writeText(ownerProfile.zelle_identifier);
      setCopiedZelle(true);
      setTimeout(() => setCopiedZelle(false), 2000);
    }
  }, [ownerProfile?.zelle_identifier]);

  const getPaymentOptions = useCallback(() => {
    if (!ownerProfile) return [];

    const amountDollars = (myGrandTotal / 100).toFixed(2);
    const options = [];

    if (ownerProfile.venmo_handle) {
      const username = ownerProfile.venmo_handle.replace(/^@/, '');
      // Use web URL - works on both desktop and mobile (mobile will prompt to open app)
      // Note: Venmo web doesn't support pre-filled amounts
      options.push({
        name: 'Venmo',
        color: '#3D95CE',
        url: `https://venmo.com/u/${username}`,
      });
    }

    if (ownerProfile.cashapp_handle) {
      const cashtag = ownerProfile.cashapp_handle.replace(/^\$/, '');
      options.push({
        name: 'Cash App',
        color: '#00D632',
        url: `https://cash.app/$${cashtag}/${amountDollars}`,
      });
    }

    if (ownerProfile.paypal_handle) {
      options.push({
        name: 'PayPal',
        color: '#003087',
        url: `https://paypal.me/${ownerProfile.paypal_handle}/${amountDollars}`,
      });
    }

    if (ownerProfile.zelle_identifier) {
      options.push({
        name: 'Zelle',
        color: '#6D1ED4',
        identifier: ownerProfile.zelle_identifier,
      });
    }

    return options;
  }, [ownerProfile, myGrandTotal]);

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
              {error && (
                <p className="text-sm" style={{ color: colors.danger }}>{error}</p>
              )}

              {/* Existing participants to select from */}
              {participants.length > 0 && !showNewNameInput && (
                <div>
                  <p className="text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>
                    Select your name
                  </p>
                  <div className="space-y-2">
                    {participants.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setCurrentParticipant(p)}
                        disabled={isJoining}
                        className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all active:scale-[0.98]"
                        style={{
                          backgroundColor: colors.background,
                          border: `1px solid ${colors.surfaceBorder}`,
                        }}
                      >
                        <span className="text-2xl">{p.emoji}</span>
                        <span className="font-medium" style={{ color: colors.text }}>{p.display_name}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowNewNameInput(true)}
                    className="w-full mt-3 py-3 rounded-full font-medium text-sm transition-all"
                    style={{
                      backgroundColor: 'transparent',
                      color: colors.textSecondary,
                      border: `1px dashed ${colors.surfaceBorder}`,
                    }}
                  >
                    + Add a different name
                  </button>
                </div>
              )}

              {/* New name input - shown if no participants or user clicks "Add different name" */}
              {(participants.length === 0 || showNewNameInput) && (
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
                  <button
                    onClick={handleJoin}
                    disabled={isJoining || !guestName.trim()}
                    className="w-full mt-4 py-3.5 rounded-full font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <button
                      onClick={() => {
                        setShowNewNameInput(false);
                        setGuestName('');
                      }}
                      className="w-full mt-2 py-2 text-sm"
                      style={{ color: colors.muted }}
                    >
                      Cancel
                    </button>
                  )}
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
              // Item is settled only when it has claimers AND all claimers have paid
              const isSettled = claimers.length > 0 && claimers.every(c => c.payment_status === 'paid');

              return (
                <button
                  key={item.id}
                  onClick={() => handleClaimItem(item.id)}
                  disabled={isLoading || paymentStatus === 'paid'}
                  className="w-full text-left p-4 rounded-xl transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: isSettled ? `${colors.primary}25` : isMine ? `${colors.primary}15` : colors.surface,
                    border: `2px solid ${isSettled ? colors.primary : isMine ? `${colors.primary}80` : colors.surfaceBorder}`,
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 flex items-center gap-2">
                      {isSettled ? (
                        <svg className="w-5 h-5 flex-shrink-0" style={{ color: colors.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : isMine ? (
                        <svg className="w-5 h-5 flex-shrink-0" style={{ color: colors.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : null}
                      <div>
                        <span style={{ color: colors.text }}>{item.label}</span>
                        {item.quantity > 1 && (
                          <span className="text-sm ml-2" style={{ color: colors.textSecondary }}>×{item.quantity}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {isSettled && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: `${colors.primary}25`, color: colors.primary }}>
                          Settled
                        </span>
                      )}
                      <span className="font-semibold" style={{ color: isSettled ? colors.primary : colors.text }}>
                        {formatCents(item.price_cents * item.quantity)}
                      </span>
                    </div>
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

      {/* Footer with totals and payment */}
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

          {/* Payment Button */}
          {myGrandTotal > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${colors.surfaceBorder}` }}>
              {paymentStatus === 'paid' ? (
                <div className="text-center py-3 rounded-xl" style={{ backgroundColor: `${colors.primary}15` }}>
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" style={{ color: colors.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-semibold" style={{ color: colors.primary }}>Payment confirmed!</span>
                  </div>
                  <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>Thanks for settling up</p>
                </div>
              ) : (
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="w-full py-3.5 rounded-full font-semibold text-base transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: colors.primary,
                    color: colors.background,
                  }}
                >
                  Pay {ownerProfile?.display_name || 'Host'}
                </button>
              )}
            </div>
          )}
        </div>
      </footer>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl p-6 pb-10"
            style={{ backgroundColor: colors.surface }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold" style={{ color: colors.text }}>
                Pay {ownerProfile?.display_name || 'Host'}
              </h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-2 rounded-full"
                style={{ backgroundColor: colors.surfaceBorder }}
              >
                <svg className="w-5 h-5" style={{ color: colors.text }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="text-center mb-6">
              <p className="text-sm" style={{ color: colors.textSecondary }}>Amount due</p>
              <p className="text-3xl font-bold" style={{ color: colors.primary }}>{formatCents(myGrandTotal)}</p>
            </div>

            {ownerProfile && getPaymentOptions().length > 0 ? (
              <div className="space-y-3">
                {getPaymentOptions().map(option => (
                  'url' in option ? (
                    <a
                      key={option.name}
                      href={option.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 py-4 rounded-xl font-semibold text-base transition-all active:scale-[0.98] w-full"
                      style={{ backgroundColor: option.color, color: '#fff' }}
                    >
                      Pay with {option.name}
                    </a>
                  ) : (
                    <button
                      key={option.name}
                      onClick={handleCopyZelle}
                      className="flex items-center justify-center gap-3 py-4 rounded-xl font-semibold text-base transition-all active:scale-[0.98] w-full"
                      style={{ backgroundColor: option.color, color: '#fff' }}
                    >
                      {copiedZelle ? 'Copied to clipboard!' : `Zelle: ${option.identifier}`}
                    </button>
                  )
                ))}
              </div>
            ) : (
              <p className="text-center py-4" style={{ color: colors.textSecondary }}>
                No payment methods available. Contact the host directly.
              </p>
            )}

            <div className="mt-6 pt-4" style={{ borderTop: `1px solid ${colors.surfaceBorder}` }}>
              <button
                onClick={() => {
                  handleMarkPaid('manual');
                  setShowPaymentModal(false);
                }}
                disabled={isMarkingPaid}
                className="w-full py-3 rounded-full font-medium text-base transition-all disabled:opacity-50"
                style={{
                  backgroundColor: 'transparent',
                  color: colors.text,
                  border: `1px solid ${colors.surfaceBorder}`,
                }}
              >
                {isMarkingPaid ? 'Confirming...' : "I've paid!"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
