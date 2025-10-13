-- Tablink initial schema
-- Defines core entities for receipts, sharing links, item claims, and settlements

set check_function_bodies = off;

create extension if not exists "pgcrypto";

-- Enum definitions ---------------------------------------------------------

create type receipt_status as enum (
  'draft',
  'ready',
  'shared',
  'partially_claimed',
  'fully_claimed',
  'settled'
);

create type participant_role as enum ('owner', 'guest');

create type claim_status as enum ('unrequested', 'requested', 'paid');

create type settlement_status as enum ('open', 'requested', 'paid');

create type receipt_event_type as enum (
  'item_claimed',
  'item_unclaimed',
  'item_settled',
  'receipt_status_changed',
  'participant_added',
  'participant_removed',
  'payment_requested',
  'payment_marked_paid'
);

-- Helper functions ---------------------------------------------------------

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Tables -------------------------------------------------------------------

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  cashapp_handle text,
  venmo_handle text,
  zelle_identifier text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  merchant_name text,
  description text,
  receipt_date timestamptz,
  image_path text,
  thumb_path text,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  tip_cents integer not null default 0 check (tip_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  status receipt_status not null default 'draft',
  ocr_version text,
  parse_confidence numeric,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index receipts_owner_id_idx on public.receipts(owner_id);

create table public.receipt_links (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  short_code text not null,
  secret_hash text,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint receipt_links_short_code_unique unique (short_code)
);

create index receipt_links_receipt_id_idx on public.receipt_links(receipt_id);

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  label text not null,
  notes text,
  price_cents integer not null check (price_cents >= 0),
  quantity numeric(10,4) not null default 1 check (quantity > 0),
  position integer,
  source_tag text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index receipt_items_receipt_id_idx on public.receipt_items(receipt_id);

create table public.receipt_participants (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  profile_id uuid references public.user_profiles(user_id) on delete set null,
  display_name text not null,
  emoji text,
  color_token text,
  email text,
  phone text,
  cashapp_handle text,
  venmo_handle text,
  zelle_identifier text,
  role participant_role not null default 'guest',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index receipt_participants_receipt_id_idx on public.receipt_participants(receipt_id);

create unique index receipt_participants_unique_profile
  on public.receipt_participants(receipt_id, profile_id)
  where profile_id is not null;

create index receipt_participants_profile_id_idx on public.receipt_participants(profile_id);

create table public.item_claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.receipt_items(id) on delete cascade,
  participant_id uuid not null references public.receipt_participants(id) on delete cascade,
  portion numeric(10,4) not null default 1 check (portion > 0),
  amount_cents integer not null check (amount_cents >= 0),
  status claim_status not null default 'unrequested',
  requested_at timestamptz,
  paid_at timestamptz,
  note text,
  confirmation_method text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint item_claims_unique_participant_per_item unique (item_id, participant_id)
);

create index item_claims_item_id_idx on public.item_claims(item_id);
create index item_claims_participant_id_idx on public.item_claims(participant_id);

create table public.participant_settlements (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  participant_id uuid not null references public.receipt_participants(id) on delete cascade,
  amount_due_cents integer not null default 0 check (amount_due_cents >= 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  status settlement_status not null default 'open',
  reminder_count integer not null default 0 check (reminder_count >= 0),
  last_reminded_at timestamptz,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint participant_settlements_unique_participant unique (receipt_id, participant_id)
);

create index participant_settlements_receipt_id_idx on public.participant_settlements(receipt_id);

create table public.receipt_events (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  actor_participant_id uuid references public.receipt_participants(id) on delete set null,
  event_type receipt_event_type not null,
  payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index receipt_events_receipt_id_idx on public.receipt_events(receipt_id);

-- Trigger hooks -------------------------------------------------------------

create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row
  execute function public.set_current_timestamp_updated_at();

create trigger set_receipts_updated_at
  before update on public.receipts
  for each row
  execute function public.set_current_timestamp_updated_at();

create trigger set_receipt_items_updated_at
  before update on public.receipt_items
  for each row
  execute function public.set_current_timestamp_updated_at();

create trigger set_receipt_participants_updated_at
  before update on public.receipt_participants
  for each row
  execute function public.set_current_timestamp_updated_at();

create trigger set_item_claims_updated_at
  before update on public.item_claims
  for each row
  execute function public.set_current_timestamp_updated_at();

create trigger set_participant_settlements_updated_at
  before update on public.participant_settlements
  for each row
  execute function public.set_current_timestamp_updated_at();

-- Helper functions that rely on tables ------------------------------------

create or replace function public.owns_receipt(p_receipt_id uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.receipts r
    where r.id = p_receipt_id
      and r.owner_id = auth.uid()
  );
$$;

create or replace function public.is_receipt_participant(p_receipt_id uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.receipt_participants rp
    where rp.receipt_id = p_receipt_id
      and rp.profile_id = auth.uid()
  );
$$;

-- Row Level Security --------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_links enable row level security;
alter table public.receipt_items enable row level security;
alter table public.receipt_participants enable row level security;
alter table public.item_claims enable row level security;
alter table public.participant_settlements enable row level security;
alter table public.receipt_events enable row level security;

-- user_profiles policies
create policy "Users can view own profile" on public.user_profiles
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own profile" on public.user_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own profile" on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- receipts policies
create policy "Owners and participants can view receipts" on public.receipts
  for select
  using (
    public.owns_receipt(id) or public.is_receipt_participant(id)
  );

create policy "Only owners manage receipts" on public.receipts
  for all
  using (public.owns_receipt(id))
  with check (public.owns_receipt(id));

-- receipt_links policies (owners only by default)
create policy "Owners manage receipt_links" on public.receipt_links
  for all
  using (public.owns_receipt(receipt_id))
  with check (public.owns_receipt(receipt_id));

-- receipt_items policies
create policy "View items if owner or participant" on public.receipt_items
  for select
  using (
    public.owns_receipt(receipt_id) or public.is_receipt_participant(receipt_id)
  );

create policy "Owners manage items" on public.receipt_items
  for all
  using (public.owns_receipt(receipt_id))
  with check (public.owns_receipt(receipt_id));

-- receipt_participants policies
create policy "View participants if owner or matching profile" on public.receipt_participants
  for select
  using (
    public.owns_receipt(receipt_id)
    or (profile_id is not null and profile_id = auth.uid())
  );

create policy "Owners manage participants" on public.receipt_participants
  for all using (public.owns_receipt(receipt_id))
  with check (public.owns_receipt(receipt_id));

-- item_claims policies
create policy "View claims if owner or participant" on public.item_claims
  for select
  using (
    public.owns_receipt((select ri.receipt_id from public.receipt_items ri where ri.id = item_id))
    or exists (
      select 1
      from public.receipt_participants rp
      where rp.id = participant_id
        and rp.profile_id = auth.uid()
    )
  );

create policy "Owners manage claims" on public.item_claims
  for all
  using (
    public.owns_receipt((select ri.receipt_id from public.receipt_items ri where ri.id = item_id))
  )
  with check (
    public.owns_receipt((select ri.receipt_id from public.receipt_items ri where ri.id = item_id))
  );

-- participant_settlements policies
create policy "View settlements if owner or participant" on public.participant_settlements
  for select
  using (
    public.owns_receipt(receipt_id)
    or exists (
      select 1
      from public.receipt_participants rp
      where rp.id = participant_id
        and rp.profile_id = auth.uid()
    )
  );

create policy "Owners manage settlements" on public.participant_settlements
  for all
  using (public.owns_receipt(receipt_id))
  with check (public.owns_receipt(receipt_id));

-- receipt_events policies
create policy "View receipt events if owner or participant" on public.receipt_events
  for select
  using (
    public.owns_receipt(receipt_id) or public.is_receipt_participant(receipt_id)
  );

create policy "Owners insert receipt events" on public.receipt_events
  for insert
  with check (public.owns_receipt(receipt_id));
