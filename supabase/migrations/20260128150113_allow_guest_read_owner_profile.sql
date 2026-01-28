-- Allow anonymous users (guests) to read owner profile payment handles
-- This is needed so guests can see payment options when splitting a receipt

CREATE POLICY "Guests can view owner payment info for shared receipts"
ON public.user_profiles
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.receipts
    WHERE receipts.owner_id = user_profiles.user_id
    AND receipts.status IN ('shared', 'partially_claimed', 'fully_claimed')
  )
);
