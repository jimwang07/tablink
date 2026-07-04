-- Enable realtime delivery for receipt item changes.
-- Host edits to shared receipt items are intentionally limited in the app,
-- but clients already subscribe to this table and should receive item changes
-- whenever they happen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'receipt_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.receipt_items;
  END IF;
END $$;

-- Include old row values for DELETE/UPDATE events through realtime.
ALTER TABLE public.receipt_items REPLICA IDENTITY FULL;
