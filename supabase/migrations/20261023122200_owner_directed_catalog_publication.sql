-- Records owner-directed bulk publication distinctly from individual moderation.
-- This does not create founder ownership or bidding eligibility for catalog rows.
begin;

alter table public.catalog_products
  add column moderation_authority text
  check (moderation_authority in ('owner_directed'));

alter table public.catalog_products
  drop constraint catalog_products_check1;

alter table public.catalog_products
  add constraint catalog_products_check1 check (
    (moderation_status in ('pending', 'needs_review')
      and reviewed_by is null and reviewed_at is null and moderation_authority is null)
    or (moderation_status = 'approved' and reviewed_at is not null and (
      (reviewed_by is not null and moderation_authority is null)
      or (reviewed_by is null and moderation_authority = 'owner_directed')
    ))
    or (moderation_status = 'rejected' and reviewed_by is not null
      and reviewed_at is not null and moderation_authority is null)
  );

do $$
declare
  v_pending integer;
  v_needs_review integer;
  v_published integer;
begin
  select count(*) filter (where moderation_status = 'pending'),
         count(*) filter (where moderation_status = 'needs_review')
    into v_pending, v_needs_review
  from public.catalog_products;

  if v_pending <> 278 or v_needs_review <> 22 then
    raise exception 'Expected 278 pending and 22 needs_review catalog products; found % and %',
      v_pending, v_needs_review;
  end if;

  update public.catalog_products
     set moderation_status = 'approved',
         moderation_authority = 'owner_directed',
         moderation_note = 'Published at the product owner’s explicit direction without individual moderation review.',
         reviewed_at = now(),
         updated_at = now()
   where moderation_status in ('pending', 'needs_review');

  get diagnostics v_published = row_count;
  if v_published <> 300 then
    raise exception 'Expected to publish 300 catalog products; published %', v_published;
  end if;
end;
$$;

commit;
