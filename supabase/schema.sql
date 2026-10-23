-- =====================================================================
-- Digital Heroes: database schema. Run this ONCE in Supabase > SQL Editor.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table public.charities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  image_url text,
  events jsonb not null default '[]',   -- [{title, date, location}]
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'subscriber' check (role in ('subscriber','admin')),
  charity_id uuid references public.charities(id) on delete set null,
  charity_percent int not null default 10 check (charity_percent between 10 and 100),
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  plan text not null check (plan in ('monthly','yearly')),
  status text not null check (status in ('active','canceled','past_due','lapsed','incomplete')),
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  score int not null check (score between 1 and 45),
  played_on date not null check (played_on <= current_date),
  created_at timestamptz not null default now(),
  unique (user_id, played_on)            -- one score per date
);

create table public.draws (
  id uuid primary key default gen_random_uuid(),
  month date not null unique,             -- first day of the draw month
  mode text not null check (mode in ('random','algorithmic')),
  numbers int[] not null,
  status text not null default 'published' check (status in ('published')),
  subscriber_count int not null default 0,
  pool_total numeric(12,2) not null default 0,
  tier5_pool numeric(12,2) not null default 0,   -- includes jackpot carried in
  tier4_pool numeric(12,2) not null default 0,
  tier3_pool numeric(12,2) not null default 0,
  jackpot_carry_in numeric(12,2) not null default 0,
  jackpot_rollover_out numeric(12,2) not null default 0,
  published_at timestamptz not null default now()
);

create table public.draw_entries (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scores int[] not null,                  -- snapshot of the 5 scores used
  match_count int not null default 0,
  unique (draw_id, user_id)
);

create table public.winners (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tier int not null check (tier in (3,4,5)),
  prize_amount numeric(12,2) not null,
  proof_url text,                         -- path inside the private 'proofs' bucket
  verification_status text not null default 'awaiting_proof'
    check (verification_status in ('awaiting_proof','submitted','approved','rejected')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid')),
  created_at timestamptz not null default now(),
  unique (draw_id, user_id)
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  charity_id uuid references public.charities(id) on delete set null,
  amount numeric(12,2) not null,
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);

-- ---------- Helper functions ----------
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_active_subscriber() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from subscriptions
    where user_id = auth.uid() and status = 'active'
      and (current_period_end is null or current_period_end > now())
  );
$$;

-- ---------- Triggers ----------
-- Create profile automatically on signup (charity + % come from signup metadata)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, charity_id, charity_percent)
  values (
    new.id, new.email, new.raw_user_meta_data->>'full_name',
    nullif(new.raw_user_meta_data->>'charity_id','')::uuid,
    greatest(coalesce(nullif(new.raw_user_meta_data->>'charity_percent','')::int, 10), 10)
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rolling 5 scores: after every insert keep only the 5 most recent (by played date)
create or replace function public.keep_latest_five() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from scores where user_id = new.user_id and id not in (
    select id from scores where user_id = new.user_id order by played_on desc, created_at desc limit 5
  );
  return null;
end $$;
create trigger scores_keep_five after insert on public.scores
  for each row execute function public.keep_latest_five();

-- Stop normal users from promoting themselves to admin
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.stripe_customer_id := old.stripe_customer_id;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile();

-- ---------- Row Level Security ----------
alter table public.charities enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.scores enable row level security;
alter table public.draws enable row level security;
alter table public.draw_entries enable row level security;
alter table public.winners enable row level security;
alter table public.donations enable row level security;

create policy "charities public read" on public.charities for select using (true);
create policy "charities admin write" on public.charities for all using (is_admin()) with check (is_admin());

create policy "profiles read own/admin" on public.profiles for select using (id = auth.uid() or is_admin());
create policy "profiles update own/admin" on public.profiles for update using (id = auth.uid() or is_admin());

create policy "subs read own/admin" on public.subscriptions for select using (user_id = auth.uid() or is_admin());
create policy "subs admin write" on public.subscriptions for all using (is_admin()) with check (is_admin());
-- (Stripe webhook writes with the service-role key, which bypasses RLS)

-- Score writes require an ACTIVE subscription (server-side enforcement of access control)
create policy "scores read own/admin" on public.scores for select using (user_id = auth.uid() or is_admin());
create policy "scores insert" on public.scores for insert with check ((user_id = auth.uid() and is_active_subscriber()) or is_admin());
create policy "scores update" on public.scores for update using ((user_id = auth.uid() and is_active_subscriber()) or is_admin());
create policy "scores delete" on public.scores for delete using ((user_id = auth.uid() and is_active_subscriber()) or is_admin());

create policy "draws read" on public.draws for select using (true);
create policy "draws admin write" on public.draws for all using (is_admin()) with check (is_admin());

create policy "entries read own/admin" on public.draw_entries for select using (user_id = auth.uid() or is_admin());
create policy "entries admin write" on public.draw_entries for all using (is_admin()) with check (is_admin());

create policy "winners read own/admin" on public.winners for select using (user_id = auth.uid() or is_admin());
create policy "winners admin write" on public.winners for all using (is_admin()) with check (is_admin());
-- winner may attach proof only while awaiting / after rejection, and cannot change money fields
create policy "winners upload proof" on public.winners for update
  using (user_id = auth.uid() and verification_status in ('awaiting_proof','rejected'))
  with check (user_id = auth.uid() and verification_status = 'submitted' and payment_status = 'pending');

create policy "donations read own/admin" on public.donations for select using (user_id = auth.uid() or is_admin());

-- ---------- Storage: private bucket for winner proof screenshots ----------
insert into storage.buckets (id, name, public) values ('proofs', 'proofs', false) on conflict do nothing;
create policy "proofs upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "proofs read own/admin" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- Seed charities ----------
insert into public.charities (name, slug, description, image_url, featured, events) values
 ('Bright Start Education', 'bright-start', 'Funds school supplies, scholarships and after-school tutoring for children in under-served communities across India.', 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=900', true, '[{"title":"Charity Fun Day","date":"2026-12-05","location":"Pune"}]'),
 ('Clean Water Collective', 'clean-water', 'Builds community water filters and wells so that every village has safe drinking water.', 'https://images.unsplash.com/photo-1541544537156-7627a7a4aa1c?w=900', false, '[{"title":"Walk for Water","date":"2027-01-18","location":"Mumbai"}]'),
 ('Second Chance Animals', 'second-chance', 'Rescues, treats and rehomes street animals, with free vaccination camps.', 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=900', false, '[]'),
 ('Green Roots Foundation', 'green-roots', 'Plants native trees and restores local forests while employing local families.', 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=900', false, '[{"title":"Plantation Drive","date":"2026-11-22","location":"Nashik"}]');

-- ---------- AFTER you sign up your own account, make it admin: ----------
-- update public.profiles set role = 'admin' where email = 'YOUR-EMAIL@example.com';
