-- Trips: bookable group packages with shared payment links
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  destination text not null,
  start_date date,
  end_date date,
  group_size integer not null check (group_size > 0),
  price_per_person_cents integer not null check (price_per_person_cents > 0),
  currency text not null default 'gbp',
  organizer_name text not null,
  organizer_email text not null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'fully_paid', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_slug_idx on public.trips (slug);
create index if not exists trips_organizer_email_idx on public.trips (organizer_email);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trips_set_updated_at
  before update on public.trips
  for each row
  execute function public.set_updated_at();
