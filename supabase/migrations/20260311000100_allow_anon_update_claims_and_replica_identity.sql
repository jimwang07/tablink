-- Allow anonymous users to update claim amounts on shared receipts
-- (needed when a new claimer joins/leaves and the split is recalculated)
CREATE POLICY "Anyone can update claims on shared receipts"
ON public.item_claims
FOR UPDATE
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.receipt_items
    JOIN public.receipts ON receipts.id = receipt_items.receipt_id
    WHERE receipt_items.id = item_claims.item_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.receipt_items
    JOIN public.receipts ON receipts.id = receipt_items.receipt_id
    WHERE receipt_items.id = item_claims.item_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
);

-- REPLICA IDENTITY FULL is required for Supabase Realtime to deliver
-- UPDATE events through RLS-filtered channels.
ALTER TABLE public.item_claims REPLICA IDENTITY FULL;
ALTER TABLE public.receipt_participants REPLICA IDENTITY FULL;
