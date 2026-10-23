create or replace function public.ingest_catalog_batch(
  p_source_provider text,
  p_source_batch text,
  p_candidates jsonb
)
returns table (run_id uuid, processed integer, imported integer, duplicates integer, needs_review integer, failed integer)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
#variable_conflict use_column
declare
  v_run_id uuid;
  v_candidate jsonb;
  v_name text;
  v_slug text;
  v_url text;
  v_domain text;
  v_description text;
  v_category text;
  v_subcategory text;
  v_pricing_model text;
  v_pricing_url text;
  v_pricing_verified_at timestamptz;
  v_source_id text;
  v_source_url text;
  v_attribution text;
  v_verified_at timestamptz;
  v_existing_id uuid;
  v_domain_collision boolean;
  v_outcome public.catalog_import_outcome;
  v_reason text;
  v_row_processed integer := 0;
  v_row_imported integer := 0;
  v_row_duplicates integer := 0;
  v_row_review integer := 0;
  v_row_failed integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') not in ('', 'service_role')
     and current_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'Service role is required for catalog ingestion';
  end if;
  if nullif(trim(p_source_provider), '') is null or nullif(trim(p_source_batch), '') is null then
    raise exception using errcode = '22023', message = 'A source provider and batch key are required';
  end if;
  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) < 1 or jsonb_array_length(p_candidates) > 50 then
    raise exception using errcode = '22023', message = 'Catalog batches must contain between 1 and 50 candidates';
  end if;

  insert into public.catalog_import_runs(source_provider, source_batch)
  values (p_source_provider, p_source_batch)
  on conflict (source_provider, source_batch) do nothing;
  select r.id into v_run_id
  from public.catalog_import_runs r
  where r.source_provider = p_source_provider and r.source_batch = p_source_batch
  for update;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    v_row_processed := v_row_processed + 1;
    v_name := nullif(trim(v_candidate->>'name'), '');
    v_slug := nullif(trim(v_candidate->>'slug'), '');
    v_url := nullif(trim(v_candidate->>'canonical_url'), '');
    v_domain := nullif(lower(trim(v_candidate->>'canonical_domain')), '');
    v_description := nullif(trim(v_candidate->>'description'), '');
    v_category := nullif(trim(v_candidate->>'category'), '');
    v_subcategory := nullif(trim(v_candidate->>'subcategory'), '');
    v_pricing_model := nullif(trim(v_candidate->>'pricing_model'), '');
    v_pricing_url := nullif(trim(v_candidate->>'pricing_url'), '');
    v_pricing_verified_at := nullif(v_candidate->>'pricing_verified_at', '')::timestamptz;
    v_source_id := nullif(trim(v_candidate->>'source_id'), '');
    v_source_url := nullif(trim(v_candidate->>'source_url'), '');
    v_attribution := nullif(trim(v_candidate->>'attribution_text'), '');
    v_verified_at := nullif(v_candidate->>'verified_at', '')::timestamptz;
    v_reason := null;
    v_outcome := 'failed';
    v_existing_id := null;
    v_domain_collision := false;

    begin
      if v_name is null or v_slug is null or v_url is null or v_domain is null
         or v_description is null or v_category is null or v_source_id is null
         or v_source_url is null or v_attribution is null or v_verified_at is null then
        raise exception using errcode = '22023', message = 'Required product or provenance field is missing';
      end if;

      -- A repeated batch resumes from recorded outcomes; failed items may be retried.
      select i.catalog_product_id, i.outcome into v_existing_id, v_outcome
      from public.catalog_import_items i
      where i.run_id = v_run_id and i.source_provider = p_source_provider and i.source_id = v_source_id;
      if found and v_outcome <> 'failed' then
        continue;
      end if;

      -- Exact matches are never overwritten, including founder-owned product data.
      select c.id into v_existing_id from public.catalog_products c
      where (c.source_provider = p_source_provider and c.source_id = v_source_id)
         or c.canonical_url = v_url or c.slug = v_slug or lower(trim(c.name)) = lower(trim(v_name))
      limit 1;
      if found then
        v_outcome := 'duplicate';
        v_reason := 'Matched an existing catalog source ID, canonical URL, slug, or product name; existing data was preserved.';
      else
        select p.id into v_existing_id from public.products p
        where p.website_url = v_url or p.slug = v_slug or lower(trim(p.name)) = lower(trim(v_name))
        limit 1;
        if found then
          v_outcome := 'duplicate';
          v_reason := 'Matched a founder-owned product; existing ownership and product data were preserved.';
        else
          -- Same-site products are distinct candidates, but need a human to confirm they are not suite duplicates.
          select exists (
            select 1 from public.catalog_products c
            where c.canonical_domain = v_domain
               or c.canonical_domain like '%.' || v_domain
               or v_domain like '%.' || c.canonical_domain
            union all
            select 1 from public.products p
            where lower(regexp_replace(split_part(p.website_url, '/', 3), '^www\.', '')) = v_domain
               or lower(regexp_replace(split_part(p.website_url, '/', 3), '^www\.', '')) like '%.' || v_domain
               or v_domain like '%.' || lower(regexp_replace(split_part(p.website_url, '/', 3), '^www\.', ''))
          ) into v_domain_collision;

          v_outcome := case when v_domain_collision then 'needs_review'::public.catalog_import_outcome else 'imported'::public.catalog_import_outcome end;
          if v_domain_collision then
            v_reason := 'A product on this official domain already exists. Confirm this is a distinct product before approval.';
          end if;

          insert into public.catalog_products(
            name, slug, canonical_url, canonical_domain, description, category, subcategory,
            pricing_model, pricing_url, pricing_verified_at, source_provider, source_url,
            source_id, attribution_text, verified_at, moderation_status, moderation_note
          ) values (
            v_name, v_slug, v_url, v_domain, v_description, v_category, v_subcategory,
            v_pricing_model, v_pricing_url, v_pricing_verified_at, p_source_provider, v_source_url,
            v_source_id, v_attribution, v_verified_at,
            case when v_domain_collision then 'needs_review'::public.catalog_moderation_status else 'pending'::public.catalog_moderation_status end,
            v_reason
          ) returning id into v_existing_id;
        end if;
      end if;

      insert into public.catalog_import_items(run_id, source_provider, source_id, candidate_name, canonical_url, catalog_product_id, outcome, reason)
      values (v_run_id, p_source_provider, v_source_id, coalesce(v_name, '(unnamed)'), coalesce(v_url, 'https://invalid.invalid'), v_existing_id, v_outcome, v_reason)
      on conflict (run_id, source_provider, source_id) do update
        set catalog_product_id = excluded.catalog_product_id,
            outcome = excluded.outcome,
            reason = excluded.reason,
            created_at = now();

      if v_outcome = 'imported' then v_row_imported := v_row_imported + 1;
      elsif v_outcome = 'duplicate' then v_row_duplicates := v_row_duplicates + 1;
      elsif v_outcome = 'needs_review' then v_row_review := v_row_review + 1;
      end if;
    exception when others then
      v_reason := left(sqlstate || ': ' || sqlerrm, 500);
      v_outcome := 'failed';
      insert into public.catalog_import_items(run_id, source_provider, source_id, candidate_name, canonical_url, outcome, reason)
      values (v_run_id, p_source_provider, coalesce(v_source_id, 'invalid-' || v_row_processed::text), coalesce(v_name, '(unnamed)'), coalesce(v_url, 'https://invalid.invalid'), 'failed', v_reason)
      on conflict (run_id, source_provider, source_id) do update
        set outcome = 'failed', reason = excluded.reason, created_at = now();
      v_row_failed := v_row_failed + 1;
    end;
  end loop;

  return query select v_run_id, v_row_processed, v_row_imported, v_row_duplicates, v_row_review, v_row_failed;
end;
$$;
revoke all on function public.ingest_catalog_batch(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_catalog_batch(text, text, jsonb) to service_role;


create index catalog_products_reviewed_by_idx on public.catalog_products(reviewed_by) where reviewed_by is not null;
create index catalog_import_items_product_idx on public.catalog_import_items(catalog_product_id) where catalog_product_id is not null;

create policy catalog_import_runs_service_role_access on public.catalog_import_runs
  for all to service_role using (true) with check (true);
create policy catalog_import_items_service_role_access on public.catalog_import_items
  for all to service_role using (true) with check (true);
