-- Add PayPal handle to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN paypal_handle text;

-- Add payment tracking columns to receipt_participants
ALTER TABLE public.receipt_participants
ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'paid')),
ADD COLUMN paid_at timestamptz,
ADD COLUMN payment_method text,
ADD COLUMN payment_amount_cents integer;

-- Allow anonymous users (guests) to update their own payment status
-- They need to be able to mark themselves as paid
CREATE POLICY "Guests can update own payment status"
ON public.receipt_participants
FOR UPDATE
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.receipts
    WHERE receipts.id = receipt_participants.receipt_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.receipts
    WHERE receipts.id = receipt_participants.receipt_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
);
