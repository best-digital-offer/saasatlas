-- Separates sourced catalog entries from founder-owned products and bidding.
-- Additive only: existing products, accounts, bids, credits, and leaderboard data are untouched.

create type public.catalog_moderation_status as enum ('pending', 'needs_review', 'approved', 'rejected');
create type public.catalog_import_outcome as enum ('imported', 'duplicate', 'needs_review', 'failed');

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  canonical_url text not null check (canonical_url ~* '^https://[^[:space:]]+$'),
  canonical_domain text not null check (canonical_domain = lower(canonical_domain) and canonical_domain !~ '^www\.'),
  description text not null check (char_length(description) between 20 and 2000),
  category text not null check (char_length(category) between 2 and 60),
  subcategory text,
  pricing_model text check (pricing_model is null or pricing_model in ('free', 'freemium', 'paid', 'usage-based', 'enterprise', 'unknown')),
  pricing_url text check (pricing_url is null or pricing_url ~* '^https://[^[:space:]]+$'),
  pricing_verified_at timestamptz,
  source_provider text not null check (char_length(source_provider) between 2 and 80),
  source_url text not null check (source_url ~* '^https://[^[:space:]]+$'),
  source_id text,
  attribution_text text not null,
  verified_at timestamptz not null,
  moderation_status public.catalog_moderation_status not null default 'pending',
  moderation_note text,
  reviewed_by uuid references public.user_accounts(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((moderation_status in ('approved', 'rejected')) = (reviewed_at is not null)),
  check ((moderation_status in ('approved', 'rejected')) = (reviewed_by is not null)),
  check (moderation_status <> 'rejected' or nullif(trim(moderation_note), '') is not null)
);

-- Exact identifiers are protected by unique indexes. Domain collisions are indexed
-- for review but are not unique because a vendor can publish several real products.
create unique index catalog_products_slug_uidx on public.catalog_products (slug);
create unique index catalog_products_url_uidx on public.catalog_products (canonical_url);
create unique index catalog_products_name_uidx on public.catalog_products (lower(trim(name)));
create unique index catalog_products_source_uidx on public.catalog_products (source_provider, source_id) where source_id is not null;
create index catalog_products_domain_idx on public.catalog_products (canonical_domain);
create index catalog_products_moderation_idx on public.catalog_products (moderation_status, category, created_at desc);

create table public.catalog_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_provider text not null,
  source_batch text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'completed_with_errors', 'failed')),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_summary jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (source_provider, source_batch)
);

create table public.catalog_import_items (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.catalog_import_runs(id) on delete cascade,
  source_provider text not null,
  source_id text,
  candidate_name text not null,
  canonical_url text not null,
  catalog_product_id uuid references public.catalog_products(id) on delete set null,
  outcome public.catalog_import_outcome not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (run_id, source_provider, source_id)
);
create index catalog_import_items_run_idx on public.catalog_import_items (run_id, outcome);

alter table public.catalog_products enable row level security;
alter table public.catalog_import_runs enable row level security;
alter table public.catalog_import_items enable row level security;

-- Private helper used by catalog RLS and the moderation RPC. Only returns a boolean.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
create or replace function private.is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.user_accounts
    where id = (select auth.uid()) and is_admin
  )
$$;
revoke all on function private.is_catalog_admin() from public, anon;
grant execute on function private.is_catalog_admin() to authenticated;

create policy catalog_products_approved_read on public.catalog_products
  for select to anon using (moderation_status = 'approved');
create policy catalog_products_authenticated_read on public.catalog_products
  for select to authenticated
  using (moderation_status = 'approved' or (select private.is_catalog_admin()));

-- This public view includes only approved catalog records and safe display/provenance fields.
create view public.published_catalog_products with (security_invoker = true) as
select id, name, slug, canonical_url, description, category, subcategory,
       pricing_model, pricing_url, pricing_verified_at, source_provider,
       source_url, attribution_text, verified_at, created_at, updated_at
from public.catalog_products
where moderation_status = 'approved';

grant select (id, name, slug, canonical_url, description, category, subcategory,
  pricing_model, pricing_url, pricing_verified_at, source_provider, source_url,
  attribution_text, verified_at, created_at, updated_at)
  on public.catalog_products to anon, authenticated;
grant select on public.published_catalog_products to anon, authenticated;
grant select on public.catalog_products to authenticated;

revoke all on public.catalog_import_runs, public.catalog_import_items from public, anon, authenticated;
grant select, insert, update on public.catalog_products to service_role;
grant all on public.catalog_import_runs, public.catalog_import_items to service_role;
grant usage, select on sequence public.catalog_import_items_id_seq to service_role;

create function public.review_catalog_product(
  p_product_id uuid,
  p_decision public.catalog_moderation_status,
  p_note text default null
)
returns public.catalog_products
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_product public.catalog_products;
  v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null or not private.is_catalog_admin() then
    raise exception using errcode = '42501', message = 'Catalog administrator access required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Decision must be approved or rejected';
  end if;
  if p_decision = 'rejected' and nullif(trim(p_note), '') is null then
    raise exception using errcode = '22023', message = 'A reason is required when rejecting a product';
  end if;

  update public.catalog_products
     set moderation_status = p_decision,
         moderation_note = case when p_decision = 'rejected' then trim(p_note) else null end,
         reviewed_by = v_admin_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_product_id
     and moderation_status in ('pending', 'needs_review')
  returning * into v_product;

  if not found then
    raise exception using errcode = 'P0002', message = 'Catalog product not found or already reviewed';
  end if;
  return v_product;
end;
$$;
revoke all on function public.review_catalog_product(uuid, public.catalog_moderation_status, text) from public, anon;
grant execute on function public.review_catalog_product(uuid, public.catalog_moderation_status, text) to authenticated;
