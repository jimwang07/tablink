'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

const colors = {
  background: '#080A0C',
  surface: '#111418',
  surfaceBorder: '#1C2126',
  muted: '#5A6371',
  text: '#F5F7FA',
  textSecondary: '#C3C8D4',
  primary: '#34D399',
  primaryBright: '#57E6AE',
  danger: '#FF5C5C',
  warning: '#F2C94C',
};

const FACE_EMOJIS = ['😀', '😄', '😁', '😆', '😎', '🤠', '🥸', '🤓', '😋', '😜', '🤪', '🥳'];
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#74B9FF', '#FD79A8'];

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
  raw_payload: {
    adjustments?: Array<{
      type: 'discount' | 'fee' | 'other';
      label: string;
      amount: number;
    }>;
  } | null;
  status: string;
};

type ReceiptAdjustment = {
  type: 'discount' | 'fee' | 'other';
  label: string;
  amount: number;
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
  role?: 'owner' | 'guest';
  payment_status?: string;
};

type OwnerProfile = {
  display_name: string | null;
  venmo_handle: string | null;
  cashapp_handle: string | null;
  paypal_handle: string | null;
};

type Props = {
  receiptId: string;
  receipt: Receipt;
  items: ReceiptItem[];
  initialClaims: ItemClaim[];
  initialParticipants: Participant[];
  ownerProfile: OwnerProfile | null;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function calculateClaimAmountCents(item: ReceiptItem, portion: number): number {
  const quantity = item.quantity > 0 ? item.quantity : 1;
  return Math.round((item.price_cents * portion) / quantity);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatAdjustmentLabel(adjustment: ReceiptAdjustment): string {
  const trimmed = adjustment.label.trim();
  return trimmed || adjustment.type.replace(/_/g, ' ');
}

function buildVenmoPaymentUrl(username: string, amountDollars: string, note: string): string {
  const params = new URLSearchParams({
    txn: 'pay',
    recipients: username,
    amount: amountDollars,
    note,
  });

  return `https://venmo.com/?${params.toString()}`;
}

function normalizePaypalMeUsername(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/(www\.)?paypal\.me\//i, '')
    .replace(/^paypal\.me\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0];

  if (!cleaned || cleaned.includes('@')) return null;
  return cleaned;
}

function getSignedAdjustmentCents(adjustment: ReceiptAdjustment): number {
  const amountCents = Math.round(Math.abs(adjustment.amount) * 100);
  return adjustment.type === 'discount' ? -amountCents : amountCents;
}

function pickUniqueEmoji(usedEmojis: string[]): string {
  const available = FACE_EMOJIS.filter((emoji) => !usedEmojis.includes(emoji));
  const pool = available.length > 0 ? available : FACE_EMOJIS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function ArrowIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CopyIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function EditIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.9 4.7 2.4 2.4M4 20h4.7L19.9 8.8a1.7 1.7 0 0 0 0-2.4l-2.3-2.3a1.7 1.7 0 0 0-2.4 0L4 15.3V20Z" />
    </svg>
  );
}

type PaymentProvider = 'venmo' | 'cashapp' | 'paypal';

function PaymentLogo({ provider }: { provider: PaymentProvider }) {
  switch (provider) {
    case 'venmo':
      return (
        <svg className="tablink-payment-logo" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="18" fill="#008CFF" />
          <path
            d="M45.7 18.9c1.1 1.8 1.6 3.8 1.6 6.1 0 7.6-6.5 17.4-11.7 24H25.2l-8.5-33.7 9.1-.9 4.5 24.1c2.6-4.3 5.8-10.9 5.8-15.4 0-2.5-.4-4.2-1-5.7l10.6 1.5Z"
            fill="#fff"
          />
        </svg>
      );
    case 'cashapp':
      return (
        <svg className="tablink-payment-logo" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="18" fill="#00D632" />
          <text
            x="32"
            y="42"
            textAnchor="middle"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize="32"
            fontWeight="800"
            fill="#fff"
          >
            $
          </text>
        </svg>
      );
    case 'paypal':
      return (
        <svg className="tablink-payment-logo" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="18" fill="#003087" />
          <path
            d="M24.5 18h13.1c5.6 0 10 4.3 9.1 9.9-.9 6.2-5.8 9.7-11.7 9.7h-5.7L27 49H18l6.5-31Zm9.3 7.2h-2.1l-1.7 9h3.1c3 0 4.9-1.7 5.3-4.4.4-2.8-1.1-4.6-4.6-4.6Z"
            fill="#fff"
          />
          <path
            d="M40.6 24.1h6.8c4.3 0 7.2 3.4 6.5 7.7-.9 5.5-5.3 8.6-10.6 8.6h-4.2L37.4 49h-7.1l4.3-24.9Z"
            fill="#009CDE"
          />
        </svg>
      );
  }
}

function AppMark() {
  return (
    <span className="tablink-wordmark">
      Tab<span className="tablink-wordmark-accent">link</span>
    </span>
  );
}

function PrimaryAction({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="tablink-primary-button"
    >
      {children}
    </button>
  );
}

function SecondaryAction({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tablink-secondary-button"
    >
      {children}
    </button>
  );
}

function PaymentLinkAction({
  href,
  children,
  accent,
}: {
  href: string;
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tablink-payment-link"
      style={{
        borderColor: `${accent}55`,
        background: `linear-gradient(180deg, ${accent}20 0%, rgba(17,20,24,0.98) 100%)`,
      }}
    >
      {children}
    </a>
  );
}

export function ClaimPageClient({
  receiptId,
  receipt,
  items,
  initialClaims,
  initialParticipants,
  ownerProfile,
}: Props) {
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
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [coverEditor, setCoverEditor] = useState<{ itemId: string; claimId: string } | null>(null);
  const [customCoverInput, setCustomCoverInput] = useState('');
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const itemIdSet = useMemo(() => new Set(itemIds), [itemIds]);

  const coverEditorItem = coverEditor ? items.find((item) => item.id === coverEditor.itemId) : undefined;
  const coverEditorClaim = coverEditor ? claims.find((claim) => claim.id === coverEditor.claimId) : undefined;
  const coverEditorMaxCents =
    coverEditor && coverEditorItem && coverEditorClaim
      ? Math.max(
          0,
          coverEditorItem.price_cents -
            claims
              .filter((claim) => claim.item_id === coverEditor.itemId && claim.id !== coverEditor.claimId)
              .reduce((sum, claim) => sum + claim.amount_cents, 0)
        )
      : 0;

  const refreshRealtimeState = useCallback(async () => {
    const supabase = getSupabaseClient();

    const [claimsResult, participantsResult] = await Promise.all([
      itemIds.length > 0
        ? supabase
            .from('item_claims')
            .select('id, item_id, participant_id, portion, amount_cents')
            .in('item_id', itemIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('receipt_participants')
        .select('id, display_name, emoji, color_token, role, payment_status')
        .eq('receipt_id', receiptId),
    ]);

    if (!claimsResult.error && claimsResult.data) {
      setClaims(claimsResult.data as ItemClaim[]);
    }

    if (!participantsResult.error && participantsResult.data) {
      setParticipants(participantsResult.data as Participant[]);
      setCurrentParticipant((current) => {
        if (!current) return current;
        const updated = (participantsResult.data as Participant[]).find((participant) => participant.id === current.id);
        return updated ? { ...current, ...updated } : current;
      });
    }
  }, [itemIds, receiptId]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`receipt:${receiptId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_claims' },
        (payload: RealtimePostgresChangesPayload<ItemClaim>) => {
          if (payload.eventType === 'INSERT') {
            const newClaim = payload.new as ItemClaim;
            if (itemIdSet.has(newClaim.item_id)) {
              setClaims((prev) => {
                if (prev.some((claim) => claim.id === newClaim.id)) return prev;
                return [...prev, newClaim];
              });
              void refreshRealtimeState();
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ItemClaim;
            if (itemIdSet.has(updated.item_id)) {
              setClaims((prev) => prev.map((claim) => (claim.id === updated.id ? { ...claim, ...updated } : claim)));
            }
          } else if (payload.eventType === 'DELETE') {
            const oldClaim = payload.old as { id: string };
            setClaims((prev) => prev.filter((claim) => claim.id !== oldClaim.id));
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
          setParticipants((prev) => {
            if (prev.some((participant) => participant.id === newParticipant.id)) return prev;
            return [...prev, newParticipant];
          });
          void refreshRealtimeState();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'receipt_participants',
          filter: `receipt_id=eq.${receiptId}`,
        },
        (payload: RealtimePostgresChangesPayload<Participant>) => {
          const updated = payload.new as Participant;
          setParticipants((prev) =>
            prev.map((participant) => (participant.id === updated.id ? { ...participant, ...updated } : participant))
          );
          setCurrentParticipant((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemIdSet, receiptId, refreshRealtimeState]);

  const handleJoin = useCallback(async () => {
    if (!guestName.trim()) {
      setError('Please enter your name.');
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      const emoji = pickUniqueEmoji(
        participants
          .map((participant) => participant.emoji)
          .filter((value): value is string => Boolean(value))
      );
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
      setParticipants((prev) => {
        if (prev.some((participant) => participant.id === data.id)) return prev;
        return [...prev, data];
      });
    } catch (err) {
      console.error('Failed to join:', err);
      setError('Failed to join. Please try again.');
    } finally {
      setIsJoining(false);
    }
  }, [guestName, participants, receiptId]);

  const handleClaimItem = useCallback(
    async (itemId: string) => {
      if (!currentParticipant || claimingItemId) return;

      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;

      const itemClaims = claims.filter((claim) => claim.item_id === itemId);
      const existingClaim = itemClaims.find((claim) => claim.participant_id === currentParticipant.id);
      const claimerIds = itemClaims.map((claim) => claim.participant_id);
      const hasAnyPaid = participants.some(
        (participant) => claimerIds.includes(participant.id) && participant.payment_status === 'paid'
      );

      if (hasAnyPaid) {
        setError('This item has already been paid for and can no longer be changed.');
        return;
      }

      setClaimingItemId(itemId);
      setError(null);

      try {
        const supabase = getSupabaseClient();

        if (existingClaim) {
          const { error: deleteError } = await supabase.from('item_claims').delete().eq('id', existingClaim.id);
          if (deleteError) throw deleteError;

          setClaims((prev) => prev.filter((claim) => claim.id !== existingClaim.id));
        } else {
          const claimedPortion = itemClaims.reduce((sum, claim) => sum + Number(claim.portion || 0), 0);
          const remainingPortion = Math.max(0, item.quantity - claimedPortion);
          const defaultPortion = Math.min(1, remainingPortion);

          if (defaultPortion <= 0) {
            setError('This item has already been fully claimed.');
            return;
          }

          const { data, error: insertError } = await supabase
            .from('item_claims')
            .insert({
              item_id: itemId,
              participant_id: currentParticipant.id,
              portion: defaultPortion,
              amount_cents: calculateClaimAmountCents(item, defaultPortion),
            })
            .select()
            .single();

          if (insertError) throw insertError;

          setClaims((prev) => (prev.some((claim) => claim.id === data.id) ? prev : [...prev, data]));
        }
      } catch (err) {
        console.error('Failed to update claim:', err);
        setError('Failed to update claim. Please try again.');
      } finally {
        setClaimingItemId(null);
      }
    },
    [claimingItemId, claims, currentParticipant, items, participants]
  );

  const handleAdjustClaimQuantity = useCallback(
    async (itemId: string, nextPortion: number) => {
      if (!currentParticipant || claimingItemId) return;

      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;

      const itemClaims = claims.filter((claim) => claim.item_id === itemId);
      const existingClaim = itemClaims.find((claim) => claim.participant_id === currentParticipant.id);
      if (!existingClaim) return;

      const claimerIds = itemClaims.map((claim) => claim.participant_id);
      const hasAnyPaid = participants.some(
        (participant) => claimerIds.includes(participant.id) && participant.payment_status === 'paid'
      );

      if (hasAnyPaid) {
        setError('This item has already been paid for and can no longer be changed.');
        return;
      }

      const claimedByOthers = itemClaims
        .filter((claim) => claim.participant_id !== currentParticipant.id)
        .reduce((sum, claim) => sum + Number(claim.portion || 0), 0);
      const maxPortion = Math.max(0, item.quantity - claimedByOthers);
      const clampedPortion = Math.min(Math.max(0, nextPortion), maxPortion);

      setClaimingItemId(itemId);
      setError(null);

      try {
        const supabase = getSupabaseClient();

        if (clampedPortion <= 0) {
          const { error: deleteError } = await supabase.from('item_claims').delete().eq('id', existingClaim.id);
          if (deleteError) throw deleteError;
          setClaims((prev) => prev.filter((claim) => claim.id !== existingClaim.id));
          return;
        }

        const amountCents = calculateClaimAmountCents(item, clampedPortion);
        const { error: updateError } = await supabase
          .from('item_claims')
          .update({ portion: clampedPortion, amount_cents: amountCents })
          .eq('id', existingClaim.id);

        if (updateError) throw updateError;

        setClaims((prev) =>
          prev.map((claim) =>
            claim.id === existingClaim.id
              ? { ...claim, portion: clampedPortion, amount_cents: amountCents }
              : claim
          )
        );
      } catch (err) {
        console.error('Failed to update claim quantity:', err);
        setError('Failed to update claim. Please try again.');
      } finally {
        setClaimingItemId(null);
      }
    },
    [claimingItemId, claims, currentParticipant, items, participants]
  );

  const handleOpenCoverEditor = useCallback((itemId: string, claim: ItemClaim) => {
    setCoverEditor({ itemId, claimId: claim.id });
    setCustomCoverInput((claim.amount_cents / 100).toFixed(2));
  }, []);

  const handleUpdateCoverAmount = useCallback(
    async (amountCents: number) => {
      if (!coverEditor || !coverEditorClaim || !coverEditorItem || !currentParticipant) return;

      const itemClaims = claims.filter((claim) => claim.item_id === coverEditor.itemId);
      const claimerIds = itemClaims.map((claim) => claim.participant_id);
      const hasAnyPaid = participants.some(
        (participant) => claimerIds.includes(participant.id) && participant.payment_status === 'paid'
      );

      if (hasAnyPaid) {
        setError('This item has already been paid for and can no longer be changed.');
        return;
      }

      const nextAmount = Math.min(Math.max(1, Math.round(amountCents)), coverEditorMaxCents);
      if (nextAmount <= 0) return;

      setClaimingItemId(coverEditor.itemId);
      setError(null);

      try {
        const supabase = getSupabaseClient();
        const { error: updateError } = await supabase
          .from('item_claims')
          .update({ amount_cents: nextAmount })
          .eq('id', coverEditorClaim.id);

        if (updateError) throw updateError;

        setClaims((prev) =>
          prev.map((claim) =>
            claim.id === coverEditorClaim.id ? { ...claim, amount_cents: nextAmount } : claim
          )
        );
        setCoverEditor(null);
      } catch (err) {
        console.error('Failed to update cover amount:', err);
        setError('Failed to update cover amount. Please try again.');
      } finally {
        setClaimingItemId(null);
      }
    },
    [
      claims,
      coverEditor,
      coverEditorClaim,
      coverEditorItem,
      coverEditorMaxCents,
      currentParticipant,
      participants,
    ]
  );

  const handleApplyCustomCover = useCallback(() => {
    const parsed = Number.parseFloat(customCoverInput.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a valid amount to cover.');
      return;
    }

    void handleUpdateCoverAmount(Math.round(parsed * 100));
  }, [customCoverInput, handleUpdateCoverAmount]);

  const myTotal = currentParticipant
    ? claims
        .filter((claim) => claim.participant_id === currentParticipant.id)
        .reduce((sum, claim) => sum + claim.amount_cents, 0)
    : 0;

  const itemsTotal = items.reduce((sum, item) => sum + item.price_cents, 0);
  const myShare = itemsTotal > 0 ? myTotal / itemsTotal : 0;
  const parsedAdjustments = receipt.raw_payload?.adjustments ?? [];
  const adjustmentBreakdown = parsedAdjustments.map((adjustment) => ({
    ...adjustment,
    signedCents: getSignedAdjustmentCents(adjustment),
    myCents: Math.round(getSignedAdjustmentCents(adjustment) * myShare),
  }));
  const myTax = Math.round(receipt.tax_cents * myShare);
  const myTip = Math.round(receipt.tip_cents * myShare);
  const myAdjustments = adjustmentBreakdown.reduce((sum, adjustment) => sum + adjustment.myCents, 0);
  const totalExtrasCents = receipt.total_cents - receipt.subtotal_cents;
  const myExtrasFallback = Math.round(totalExtrasCents * myShare);
  const myKnownExtras = myTax + myTip + myAdjustments;
  const myUnknownExtras = myExtrasFallback - myKnownExtras;
  const myGrandTotal = myTotal + myKnownExtras + myUnknownExtras;

  const handleMarkPaid = useCallback(
    async (method: string) => {
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
        setCurrentParticipant((prev) => (prev ? { ...prev, payment_status: 'paid' } : null));
        setParticipants((prev) =>
          prev.map((participant) =>
            participant.id === currentParticipant.id ? { ...participant, payment_status: 'paid' } : participant
          )
        );
      } catch (err) {
        console.error('Failed to mark as paid:', err);
        setError('Failed to update payment status. Please try again.');
      } finally {
        setIsMarkingPaid(false);
      }
    },
    [currentParticipant, isMarkingPaid, myGrandTotal]
  );

  const handleCopyAmount = useCallback(() => {
    navigator.clipboard.writeText((myGrandTotal / 100).toFixed(2));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  }, [myGrandTotal]);

  const paymentOptions = useMemo(() => {
    if (!ownerProfile) return [];

    const amountDollars = (myGrandTotal / 100).toFixed(2);
    const options: { name: string; provider: PaymentProvider; accent: string; url: string }[] = [];

    if (ownerProfile.venmo_handle) {
      const username = ownerProfile.venmo_handle.replace(/^@/, '');
      const note = receipt.merchant_name || 'Receipt split';
      options.push({
        name: 'Venmo',
        provider: 'venmo',
        accent: '#3D95CE',
        url: buildVenmoPaymentUrl(username, amountDollars, note),
      });
    }

    if (ownerProfile.cashapp_handle) {
      const cashtag = ownerProfile.cashapp_handle.replace(/^\$/, '');
      options.push({
        name: 'Cash App',
        provider: 'cashapp',
        accent: '#00D632',
        url: `https://cash.app/$${cashtag}/${amountDollars}`,
      });
    }

    if (ownerProfile.paypal_handle) {
      const paypalUsername = normalizePaypalMeUsername(ownerProfile.paypal_handle);
      if (!paypalUsername) return options;

      options.push({
        name: 'PayPal',
        provider: 'paypal',
        accent: '#003087',
        url: `https://paypal.me/${paypalUsername}/${amountDollars}`,
      });
    }

    return options;
  }, [myGrandTotal, ownerProfile, receipt.merchant_name]);

  const guestParticipants = participants.filter((participant) => participant.role !== 'owner');
  const otherParticipants = participants.filter((participant) => participant.id !== currentParticipant?.id);

  const getItemClaimers = useCallback(
    (itemId: string) => {
      const itemClaims = claims.filter((claim) => claim.item_id === itemId);
      return itemClaims
        .map((claim) => participants.find((participant) => participant.id === claim.participant_id))
        .filter(Boolean) as Participant[];
    },
    [claims, participants]
  );

  if (!currentParticipant) {
    return (
      <div className="tablink-guest-shell">
        <div className="tablink-bg-orb tablink-bg-orb-top" />
        <div className="tablink-bg-orb tablink-bg-orb-bottom" />

        <div className="tablink-join-layout">
          <AppMark />

          <section className="tablink-overview-card">
            <div className="tablink-overline">Receipt</div>
            <h2 className="tablink-overview-title">{receipt.merchant_name || 'Shared receipt'}</h2>
            {receipt.receipt_date ? <p className="tablink-overview-date">{formatDate(receipt.receipt_date)}</p> : null}
            <div className="tablink-detail-rows">
              <div className="tablink-detail-row">
                <span className="tablink-detail-label">Total</span>
                <span className="tablink-detail-value">{formatCents(receipt.total_cents)}</span>
              </div>
              <div className="tablink-detail-row">
                <span className="tablink-detail-label">Items</span>
                <span className="tablink-detail-value">{items.length}</span>
              </div>
              <div className="tablink-detail-row">
                <span className="tablink-detail-label">Extras</span>
                <span className="tablink-detail-value">{formatCents(receipt.total_cents - receipt.subtotal_cents)}</span>
              </div>
            </div>
          </section>

          <section className="tablink-card">
            <div className="tablink-card-head">
              <div className="tablink-overline">Join</div>
              <h2 className="tablink-section-title">Who are you?</h2>
              <p className="tablink-section-body">
                Claim what you ordered and pay the host.
              </p>
            </div>

            {error ? <div className="tablink-alert">{error}</div> : null}

            {guestParticipants.length > 0 && !showNewNameInput ? (
              <>
                <div className="tablink-name-list">
                  {guestParticipants.map((participant) => (
                    <button
                      key={participant.id}
                      type="button"
                      onClick={() => setCurrentParticipant(participant)}
                      disabled={isJoining}
                      className="tablink-name-option"
                    >
                      <div
                        className="tablink-name-emoji"
                        style={{ backgroundColor: `${participant.color_token ?? colors.primary}22` }}
                      >
                        <span>{participant.emoji}</span>
                      </div>
                      <div className="tablink-name-copy">
                        <div className="tablink-name-title">{participant.display_name}</div>
                        <div className="tablink-name-subtitle">Continue as this guest</div>
                      </div>
                      <ArrowIcon />
                    </button>
                  ))}
                </div>

                <div className="tablink-name-list-action">
                  <SecondaryAction onClick={() => setShowNewNameInput(true)}>
                    <span>I&apos;m someone else</span>
                  </SecondaryAction>
                </div>
              </>
            ) : (
              <div className="tablink-form-stack">
                <label className="tablink-input-label" htmlFor="guest-name">
                  {guestParticipants.length > 0 ? 'Enter your name' : 'What should the host call you?'}
                </label>
                <input
                  id="guest-name"
                  type="text"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleJoin();
                  }}
                  placeholder="Your name"
                  className="tablink-input"
                  autoFocus
                />
                <PrimaryAction onClick={handleJoin} disabled={isJoining || !guestName.trim()}>
                  <span>{isJoining ? 'Joining...' : 'Continue'}</span>
                  <ArrowIcon />
                </PrimaryAction>

                {guestParticipants.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewNameInput(false);
                      setGuestName('');
                    }}
                    className="tablink-text-button"
                  >
                    Back to name list
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="tablink-guest-shell">
      <div className="tablink-bg-orb tablink-bg-orb-top" />
      <div className="tablink-bg-orb tablink-bg-orb-bottom" />

      <header className="tablink-claim-header">
        <div className="tablink-header-inner">
          <AppMark />
          <div className="tablink-identity-pill">
            <span className="tablink-identity-emoji">{currentParticipant.emoji}</span>
            <span>{currentParticipant.display_name}</span>
          </div>
        </div>
      </header>

      <main className="tablink-claim-layout">
        <section className="tablink-card">
          <div className="tablink-card-head">
            <div className="tablink-overline">Receipt</div>
            <div className="tablink-summary-row">
              <div>
                <h1 className="tablink-section-title">{receipt.merchant_name || 'Shared receipt'}</h1>
                {receipt.receipt_date ? <p className="tablink-section-body">{formatDate(receipt.receipt_date)}</p> : null}
              </div>
              <span className="tablink-header-total">{formatCents(receipt.total_cents)}</span>
            </div>
          </div>

          <div className="tablink-detail-rows">
            <div className="tablink-detail-row">
              <span className="tablink-detail-label">Items</span>
              <span className="tablink-detail-value">{items.length}</span>
            </div>
            <div className="tablink-detail-row">
              <span className="tablink-detail-label">Subtotal</span>
              <span className="tablink-detail-value">{formatCents(receipt.subtotal_cents)}</span>
            </div>
            <div className="tablink-detail-row">
              <span className="tablink-detail-label">Extras</span>
              <span className="tablink-detail-value">{formatCents(receipt.total_cents - receipt.subtotal_cents)}</span>
            </div>
          </div>
        </section>

        <section className="tablink-card tablink-item-panel">
          <div className="tablink-card-head">
            <div className="tablink-overline">Step 2</div>
            <h2 className="tablink-section-title">Claim what you ordered</h2>
            <p className="tablink-section-body">
              Tap any item that belongs to you. Claims update live for everyone viewing the receipt.
            </p>
          </div>

          {error ? <div className="tablink-alert">{error}</div> : null}

          <div className="tablink-item-grid">
            {items.map((item) => {
              const itemClaims = claims.filter((claim) => claim.item_id === item.id);
              const myClaim = currentParticipant
                ? itemClaims.find((claim) => claim.participant_id === currentParticipant.id)
                : undefined;
              const claimedPortion = itemClaims.reduce((sum, claim) => sum + Number(claim.portion || 0), 0);
              const claimedByOthers = itemClaims
                .filter((claim) => claim.participant_id !== currentParticipant?.id)
                .reduce((sum, claim) => sum + Number(claim.portion || 0), 0);
              const remainingPortion = Math.max(0, item.quantity - claimedPortion);
              const maxMyPortion = Math.max(0, item.quantity - claimedByOthers);
              const claimers = getItemClaimers(item.id);
              const isMine = Boolean(myClaim);
              const isLoading = claimingItemId === item.id;
              const hasAnyPaid = claimers.some((claimer) => claimer.payment_status === 'paid');
              const isSettled = claimers.length > 0 && claimers.every((claimer) => claimer.payment_status === 'paid');
              const isClaimed = claimers.length > 0 && !isSettled;
              const isFullyClaimed = remainingPortion <= 0;
              const canClaim = !isLoading && paymentStatus !== 'paid' && !hasAnyPaid && (!isFullyClaimed || isMine);
              const canDecrease = Boolean(myClaim) && !isLoading && paymentStatus !== 'paid' && !hasAnyPaid;
              const canIncrease =
                Boolean(myClaim) &&
                !isLoading &&
                paymentStatus !== 'paid' &&
                !hasAnyPaid &&
                Number(myClaim?.portion || 0) < maxMyPortion;

              return (
                <div
                  key={item.id}
                  className={`tablink-item-card${isMine ? ' is-mine' : ''}${isClaimed ? ' is-claimed' : ''}${isSettled ? ' is-settled' : ''}`}
                >
                  <div className="tablink-item-row-content">
                    <button
                      type="button"
                      onClick={() => handleClaimItem(item.id)}
                      disabled={!canClaim}
                      className="tablink-item-main-button"
                    >
                      <div className="tablink-item-leading">
                        <div className="tablink-item-check">
                          {isMine || isSettled ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                        </div>
                        <div className="tablink-item-copy">
                          <div className="tablink-item-title-row">
                            <span className="tablink-item-title">{item.label}</span>
                            {item.quantity > 1 ? <span className="tablink-qty-pill">×{item.quantity}</span> : null}
                          </div>

                          {claimers.length > 0 ? (
                            <div className="tablink-claimer-row">
                              {itemClaims.map((claim) => {
                                const claimer = participants.find((participant) => participant.id === claim.participant_id);
                                if (!claimer) return null;
                                return (
                                  <span
                                    key={claim.id}
                                    className="tablink-claimer-pill"
                                    style={{ borderLeftColor: claimer.color_token ?? colors.primary }}
                                  >
                                    <span>{claimer.emoji}</span>
                                    <span>{claimer.display_name}</span>
                                    {item.quantity > 1 ? <span>×{formatQuantity(Number(claim.portion || 0))}</span> : null}
                                    {claimer.payment_status === 'paid' ? <CheckIcon className="h-3 w-3" /> : null}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="tablink-item-subtitle">Unclaimed</div>
                          )}
                          {item.quantity > 1 && !isFullyClaimed ? (
                            <div className="tablink-item-subtitle">
                              {formatQuantity(remainingPortion)} of {formatQuantity(item.quantity)} left
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>

                    <div className="tablink-item-trailing">
                      {isSettled ? <span className="tablink-paid-pill">Paid</span> : null}
                      {myClaim && item.quantity > 1 ? (
                        <div className="tablink-quantity-stack">
                          <div className="tablink-quantity-stepper">
                            <button
                              type="button"
                              onClick={() => handleAdjustClaimQuantity(item.id, Number(myClaim.portion || 0) - 1)}
                              disabled={!canDecrease}
                              className="tablink-quantity-button"
                              aria-label={`Claim fewer ${item.label}`}
                            >
                              -
                            </button>
                            <span className="tablink-quantity-value">
                              {formatQuantity(Number(myClaim.portion || 0))}/{formatQuantity(item.quantity)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAdjustClaimQuantity(item.id, Number(myClaim.portion || 0) + 1)}
                              disabled={!canIncrease}
                              className="tablink-quantity-button"
                              aria-label={`Claim more ${item.label}`}
                            >
                              +
                            </button>
                          </div>
                          <span className="tablink-covering-line">
                            <span className="tablink-covering-amount">Covering {formatCents(myClaim.amount_cents)}</span>
                            <button
                              type="button"
                              className="tablink-cover-edit-button"
                              onClick={() => handleOpenCoverEditor(item.id, myClaim)}
                              aria-label={`Edit amount covered for ${item.label}`}
                            >
                              <EditIcon />
                            </button>
                          </span>
                        </div>
                      ) : null}
                      {myClaim && item.quantity <= 1 ? (
                        <span className="tablink-covering-line tablink-covering-amount-inline">
                          <span className="tablink-covering-amount">Covering {formatCents(myClaim.amount_cents)}</span>
                          <button
                            type="button"
                            className="tablink-cover-edit-button"
                            onClick={() => handleOpenCoverEditor(item.id, myClaim)}
                            aria-label={`Edit amount covered for ${item.label}`}
                          >
                            <EditIcon />
                          </button>
                        </span>
                      ) : null}
                      <span className="tablink-item-price">{formatCents(item.price_cents)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {otherParticipants.length > 0 ? (
          <section className="tablink-card">
            <div className="tablink-card-head">
              <div className="tablink-overline">People</div>
              <h2 className="tablink-section-title">Splitting with</h2>
            </div>

            <div className="tablink-participant-list">
              {otherParticipants.map((participant) => (
                <div key={participant.id} className="tablink-participant-row">
                  <div className="tablink-participant-leading">
                    <div
                      className="tablink-participant-avatar"
                      style={{ backgroundColor: `${participant.color_token ?? colors.primary}22` }}
                    >
                      <span>{participant.emoji}</span>
                    </div>
                    <div>
                      <div className="tablink-participant-name">{participant.display_name}</div>
                      <div className="tablink-participant-meta">
                        {participant.role === 'owner' ? 'Host' : 'Guest'}
                      </div>
                    </div>
                  </div>
                  {participant.payment_status === 'paid' ? <span className="tablink-paid-pill">Paid</span> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="tablink-card">
          <div className="tablink-card-head">
            <div className="tablink-overline">Your Share</div>
            <h2 className="tablink-section-title">Your total</h2>
          </div>

          <div className="tablink-total-breakdown">
            <div className="tablink-total-line">
              <span>Your items</span>
              <span>{formatCents(myTotal)}</span>
            </div>
            {receipt.tax_cents > 0 ? (
              <div className="tablink-total-line">
                <span>Tax (Proportional)</span>
                <span>{formatCents(myTax)}</span>
              </div>
            ) : null}
            {receipt.tip_cents > 0 ? (
              <div className="tablink-total-line">
                <span>Tip (Proportional)</span>
                <span>{formatCents(myTip)}</span>
              </div>
            ) : null}
            {adjustmentBreakdown.map((adjustment) => (
              <div key={`${adjustment.type}-${adjustment.label}`} className="tablink-total-line">
                <span>{formatAdjustmentLabel(adjustment)} (Proportional)</span>
                <span>{formatCents(adjustment.myCents)}</span>
              </div>
            ))}
            {myUnknownExtras !== 0 ? (
              <div className="tablink-total-line">
                <span>Other Extras (Proportional)</span>
                <span>{formatCents(myUnknownExtras)}</span>
              </div>
            ) : null}
            <div className="tablink-total-grand">
              <span>Your total</span>
              <span>{formatCents(myGrandTotal)}</span>
            </div>
          </div>

          {myGrandTotal > 0 ? (
            paymentStatus === 'paid' ? (
              <div className="tablink-paid-card">
                <div className="tablink-paid-badge">
                  <CheckIcon />
                </div>
                <div>
                  <div className="tablink-paid-title">Payment confirmed</div>
                  <div className="tablink-paid-copy">Thanks for settling up.</div>
                </div>
              </div>
            ) : (
              <PrimaryAction onClick={() => setShowPaymentModal(true)}>
                <span>Pay {ownerProfile?.display_name || 'Host'}</span>
                <ArrowIcon />
              </PrimaryAction>
            )
          ) : (
            <div className="tablink-empty-note">Claim one or more items to calculate your share.</div>
          )}
        </section>
      </main>

      {showPaymentModal ? (
        <div className="tablink-modal-backdrop" onClick={() => setShowPaymentModal(false)}>
          <div className="tablink-modal" onClick={(event) => event.stopPropagation()}>
            <div className="tablink-modal-head">
              <div>
                <div className="tablink-overline">Payment</div>
                <h2 className="tablink-section-title">Settle with {ownerProfile?.display_name || 'Host'}</h2>
              </div>
              <button type="button" className="tablink-icon-button" onClick={() => setShowPaymentModal(false)}>
                <CloseIcon />
              </button>
            </div>

            <button type="button" className="tablink-payment-amount-card" onClick={handleCopyAmount}>
              <span className="tablink-payment-copy-hint">
                <CopyIcon className="h-3.5 w-3.5" />
                {copiedAmount ? 'Copied' : 'Tap to copy'}
              </span>
              <div className="tablink-stat-label">Amount due</div>
              <div className="tablink-payment-amount">{formatCents(myGrandTotal)}</div>
            </button>

            {paymentOptions.length > 0 ? (
              <div className="tablink-payment-stack">
                {paymentOptions.map((option) => (
                    <PaymentLinkAction key={option.name} href={option.url} accent={option.accent}>
                      <span className="tablink-payment-link-label">
                        <PaymentLogo provider={option.provider} />
                        <span>Pay with {option.name}</span>
                      </span>
                      <ArrowIcon />
                    </PaymentLinkAction>
                ))}
              </div>
            ) : (
              <div className="tablink-empty-note">
                No payment links are available yet. Contact the host directly to settle up.
              </div>
            )}

            <div className="tablink-modal-footer">
              <SecondaryAction
                onClick={() => {
                  handleMarkPaid('manual');
                  setShowPaymentModal(false);
                }}
                disabled={isMarkingPaid}
              >
                <span>{isMarkingPaid ? 'Confirming...' : "I've already paid"}</span>
              </SecondaryAction>
            </div>
          </div>
        </div>
      ) : null}

      {coverEditor && coverEditorItem && coverEditorClaim ? (
        <div className="tablink-modal-backdrop" onClick={() => setCoverEditor(null)}>
          <div className="tablink-modal" onClick={(event) => event.stopPropagation()}>
            <div className="tablink-modal-head">
              <div>
                <div className="tablink-overline">Cover Amount</div>
                <h2 className="tablink-section-title">{coverEditorItem.label}</h2>
                <p className="tablink-section-body">Choose how much of this item you want to cover.</p>
              </div>
              <button type="button" className="tablink-icon-button" onClick={() => setCoverEditor(null)}>
                <CloseIcon />
              </button>
            </div>

            <div className="tablink-cover-option-grid">
              {[
                { label: '1/3', amount: Math.round(coverEditorItem.price_cents / 3) },
                { label: 'Half', amount: Math.round(coverEditorItem.price_cents / 2) },
                { label: 'Full', amount: coverEditorItem.price_cents },
              ].map((option) => {
                const amount = Math.min(option.amount, coverEditorMaxCents);
                return (
                  <button
                    key={option.label}
                    type="button"
                    className="tablink-cover-option"
                    onClick={() => handleUpdateCoverAmount(amount)}
                    disabled={amount <= 0 || claimingItemId === coverEditor.itemId}
                  >
                    <span>{option.label}</span>
                    <strong>{formatCents(amount)}</strong>
                  </button>
                );
              })}
            </div>

            <div className="tablink-cover-custom">
              <label className="tablink-input-label" htmlFor="custom-cover-amount">
                Custom amount
              </label>
              <div className="tablink-cover-custom-row">
                <input
                  id="custom-cover-amount"
                  className="tablink-input"
                  inputMode="decimal"
                  value={customCoverInput}
                  onChange={(event) => setCustomCoverInput(event.target.value)}
                  placeholder="0.00"
                />
                <button
                  type="button"
                  className="tablink-cover-apply-button"
                  onClick={handleApplyCustomCover}
                  disabled={claimingItemId === coverEditor.itemId}
                >
                  Apply
                </button>
              </div>
              <div className="tablink-cover-max">Max {formatCents(coverEditorMaxCents)}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
