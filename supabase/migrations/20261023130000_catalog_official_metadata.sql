-- Stores first-party descriptions and brand mark provenance for the public catalog.
begin;

alter table public.catalog_products
  add column logo_path text,
  add column logo_source_url text,
  add column logo_verified_at timestamptz,
  add column description_source_url text,
  add column description_verified_at timestamptz;

alter table public.catalog_products
  add constraint catalog_products_logo_metadata_check check (
    (logo_path is null and logo_source_url is null and logo_verified_at is null)
    or (logo_path is not null and logo_source_url is not null and logo_verified_at is not null
      and logo_path ~ '^/catalog-logos/[a-z0-9-]+\.(png|jpg|webp|gif|ico|svg)$'
      and logo_source_url ~* '^https://[^[:space:]]+$')
  ),
  add constraint catalog_products_description_metadata_check check (
    (description_source_url is null and description_verified_at is null)
    or (description_source_url is not null and description_verified_at is not null
      and description_source_url ~* '^https://[^[:space:]]+$')
  );

create or replace view public.published_catalog_products with (security_invoker = true) as
select id, name, slug, canonical_url, description, category, subcategory,
       pricing_model, pricing_url, pricing_verified_at, source_provider,
       source_url, attribution_text, verified_at, created_at, updated_at,
       logo_path, logo_source_url, logo_verified_at,
       description_source_url, description_verified_at
from public.catalog_products
where moderation_status = 'approved';

grant select (logo_path, logo_source_url, logo_verified_at,
  description_source_url, description_verified_at)
  on public.catalog_products to anon, authenticated;
grant select on public.published_catalog_products to anon, authenticated;

commit;
