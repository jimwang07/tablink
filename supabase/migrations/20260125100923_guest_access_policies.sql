-- Allow anonymous users to read shared receipts
CREATE POLICY "Anyone can view shared receipts"
ON public.receipts
FOR SELECT
TO anon
USING (status IN ('shared', 'partially_claimed', 'fully_claimed'));

-- Allow anonymous users to read items for shared receipts
CREATE POLICY "Anyone can view items of shared receipts"
ON public.receipt_items
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.receipts
    WHERE receipts.id = receipt_items.receipt_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
);

-- Allow anonymous users to view participants of shared receipts
CREATE POLICY "Anyone can view participants of shared receipts"
ON public.receipt_participants
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.receipts
    WHERE receipts.id = receipt_participants.receipt_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
);

-- Allow anonymous users to join as participants on shared receipts
CREATE POLICY "Anyone can join shared receipts as participant"
ON public.receipt_participants
FOR INSERT
TO anon
WITH CHECK (
  role = 'guest'
  AND EXISTS (
    SELECT 1 FROM public.receipts
    WHERE receipts.id = receipt_participants.receipt_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
);

-- Allow anonymous users to view claims on shared receipts
CREATE POLICY "Anyone can view claims on shared receipts"
ON public.item_claims
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.receipt_items
    JOIN public.receipts ON receipts.id = receipt_items.receipt_id
    WHERE receipt_items.id = item_claims.item_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
);

-- Allow anonymous users to create/delete claims on shared receipts
CREATE POLICY "Anyone can manage claims on shared receipts"
ON public.item_claims
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.receipt_items
    JOIN public.receipts ON receipts.id = receipt_items.receipt_id
    WHERE receipt_items.id = item_claims.item_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
);

CREATE POLICY "Anyone can delete their claims on shared receipts"
ON public.item_claims
FOR DELETE
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.receipt_items
    JOIN public.receipts ON receipts.id = receipt_items.receipt_id
    WHERE receipt_items.id = item_claims.item_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
);
