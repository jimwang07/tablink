import { getSupabaseClient } from '@/lib/supabase';
import { ClaimPageClient } from './claim-client';

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
  owner_id: string;
};

type OwnerProfile = {
  display_name: string | null;
  venmo_handle: string | null;
  cashapp_handle: string | null;
  paypal_handle: string | null;
  zelle_identifier: string | null;
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
};

async function resolveReceiptIdFromShortCode(shortCode: string) {
  const supabase = getSupabaseClient();

  const { data: link, error } = await supabase
    .from('receipt_links')
    .select('receipt_id, expires_at, revoked_at')
    .eq('short_code', shortCode)
    .maybeSingle();

  if (error) {
    console.error('[claim] Failed to resolve short code', {
      shortCode,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { error: 'Unable to resolve this link right now. Please try again.' };
  }

  if (!link) {
    return { error: 'This link is invalid or has expired.' };
  }

  if (link.revoked_at) {
    return { error: 'This link has been revoked.' };
  }

  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
    return { error: 'This link has expired.' };
  }

  return { receiptId: link.receipt_id };
}

async function getReceiptData(receiptId: string) {
  const supabase = getSupabaseClient();

  // Fetch receipt
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('id, merchant_name, receipt_date, subtotal_cents, tax_cents, tip_cents, total_cents, status, owner_id')
    .eq('id', receiptId)
    .single();

  if (receiptError || !receipt) {
    return { error: 'Receipt not found' };
  }

  // Only allow claiming for shared receipts
  if (receipt.status !== 'shared' && receipt.status !== 'partially_claimed' && receipt.status !== 'fully_claimed') {
    return { error: 'This receipt is not available for claiming' };
  }

  // Fetch items
  const { data: items, error: itemsError } = await supabase
    .from('receipt_items')
    .select('id, label, price_cents, quantity, position')
    .eq('receipt_id', receiptId)
    .order('position', { ascending: true });

  if (itemsError) {
    return { error: 'Failed to load items' };
  }

  // Fetch existing claims
  const { data: claims, error: claimsError } = await supabase
    .from('item_claims')
    .select('id, item_id, participant_id, portion, amount_cents')
    .in('item_id', items?.map(i => i.id) || []);

  // Fetch participants
  const { data: participants, error: participantsError } = await supabase
    .from('receipt_participants')
    .select('id, display_name, emoji, color_token, role, payment_status')
    .eq('receipt_id', receiptId);

  // Fetch owner profile for payment handles
  const { data: ownerProfile } = await supabase
    .from('user_profiles')
    .select('display_name, venmo_handle, cashapp_handle, paypal_handle, zelle_identifier')
    .eq('user_id', receipt.owner_id)
    .single();

  return {
    receipt: receipt as Receipt,
    items: (items || []) as ReceiptItem[],
    claims: (claims || []) as ItemClaim[],
    participants: (participants || []) as Participant[],
    ownerProfile: (ownerProfile || null) as OwnerProfile | null,
  };
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId: linkCode } = await params;
  const linkResult = await resolveReceiptIdFromShortCode(linkCode);

  if ('error' in linkResult) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full text-center">
          <div className="text-red-400 text-lg mb-2">Oops!</div>
          <p className="text-gray-300">{linkResult.error}</p>
        </div>
      </div>
    );
  }

  const data = await getReceiptData(linkResult.receiptId);

  if ('error' in data) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full text-center">
          <div className="text-red-400 text-lg mb-2">Oops!</div>
          <p className="text-gray-300">{data.error}</p>
        </div>
      </div>
    );
  }

  return (
    <ClaimPageClient
      receiptId={linkResult.receiptId}
      receipt={data.receipt}
      items={data.items}
      initialClaims={data.claims}
      initialParticipants={data.participants}
      ownerProfile={data.ownerProfile}
    />
  );
}
