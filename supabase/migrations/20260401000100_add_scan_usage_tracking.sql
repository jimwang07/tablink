-- Add subscription tier to user profiles
ALTER TABLE user_profiles
  ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free';

-- Track individual scan events for usage limiting
CREATE TABLE scan_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  receipt_id UUID REFERENCES receipts(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for efficient monthly usage queries
CREATE INDEX idx_scan_events_user_created ON scan_events(user_id, created_at);

-- RLS
ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own scan events"
  ON scan_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scan events"
  ON scan_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
