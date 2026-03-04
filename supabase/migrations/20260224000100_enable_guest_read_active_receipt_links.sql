-- Allow anonymous guests to resolve active tablinks by short code
-- Guests can only read links that are active and tied to receipts currently shareable.

CREATE POLICY "Anyone can view active receipt links"
ON public.receipt_links
FOR SELECT
TO anon
USING (
  revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > timezone('utc', now()))
  AND EXISTS (
    SELECT 1
    FROM public.receipts
    WHERE receipts.id = receipt_links.receipt_id
      AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
);
