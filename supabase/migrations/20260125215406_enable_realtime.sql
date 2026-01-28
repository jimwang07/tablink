-- Enable Supabase Realtime on tables needed for live updates

-- item_claims: For tracking when guests claim/unclaim items
ALTER PUBLICATION supabase_realtime ADD TABLE item_claims;

-- receipt_participants: For tracking when guests join a receipt
ALTER PUBLICATION supabase_realtime ADD TABLE receipt_participants;

-- receipts: For tracking status changes
ALTER PUBLICATION supabase_realtime ADD TABLE receipts;
