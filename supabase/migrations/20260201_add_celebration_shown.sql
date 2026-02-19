-- Track whether the settled celebration has been shown for a receipt
ALTER TABLE public.receipts
ADD COLUMN celebration_shown boolean NOT NULL DEFAULT false;
