-- Relax anon link resolution policy to depend on link validity only.
-- This avoids false negatives when receipt status transitions after sharing.

DROP POLICY IF EXISTS "Anyone can view active receipt links" ON public.receipt_links;

CREATE POLICY "Anyone can view active receipt links"
ON public.receipt_links
FOR SELECT
TO anon
USING (
  revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > now())
);
