-- Participants: friends who claim a spot and pay their share
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null,
  email text not null,
  status text not null default 'invited'
    check (status in ('invited', 'checkout_started', 'paid', 'declined')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_paid_cents integer check (amount_paid_cents is null or amount_paid_cents > 0),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, email)
);

create index if not exists participants_trip_id_idx on public.participants (trip_id);
create index if not exists participants_stripe_checkout_session_id_idx
  on public.participants (stripe_checkout_session_id);

create trigger participants_set_updated_at
  before update on public.participants
  for each row
  execute function public.set_updated_at();
