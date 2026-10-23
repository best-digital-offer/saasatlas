-- Authenticated, owner-scoped workspace data for SaaslistAtlas.
-- The function returns only the caller's own account, wallet, founder products,
-- credit ledger and referrals. Sourced catalog products are intentionally excluded.
begin;

create or replace function public.get_founder_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_owner uuid := auth.uid();
  v_result jsonb;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select jsonb_build_object(
    'account', (select jsonb_build_object(
      'id', a.id,
      'display_name', a.display_name,
      'plan', a.plan,
      'subscription_status', a.subscription_status,
      'subscription_valid_until', a.subscription_valid_until,
      'grace_period_ends_at', a.grace_period_ends_at,
      'email_verified_at', a.email_verified_at,
      'is_admin', a.is_admin,
      'referral_code', a.referral_code
    ) from public.user_accounts a where a.id = v_owner),
    'wallet', (select jsonb_build_object(
      'available', w.available,
      'reserved', w.reserved,
      'purchased_total', w.purchased_total,
      'earned_total', w.earned_total,
      'spent_total', w.spent_total
    ) from public.credit_accounts w where w.owner_id = v_owner),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'tagline', p.tagline,
        'description', p.description, 'category', p.category,
        'website_url', p.website_url, 'state', p.state,
        'current_rank', p.current_rank, 'previous_rank', p.previous_rank,
        'standing_bid', case when b.state = 'active' then b.amount else null end, 'bid_state', b.state,
        'last_withdrawn_at', b.last_withdrawn_at, 'created_at', p.created_at
      ) order by p.created_at desc)
      from public.products p
      left join public.standing_bids b on b.product_id = p.id and b.owner_id = v_owner
      where p.owner_id = v_owner
    ), '[]'::jsonb),
    'ledger', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select l.id, l.source_type, l.credit_amount, l.available_delta,
          l.reserved_delta, l.reason, l.created_at
        from public.credit_ledger l
        where l.owner_id = v_owner
        order by l.created_at desc
        limit 25
      ) recent
    ), '[]'::jsonb),
    'referrals', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select r.id, r.state, r.reward_credits, r.attribution_at, r.created_at
        from public.referrals r
        where r.referrer_id = v_owner
        order by r.created_at desc
        limit 25
      ) recent
    ), '[]'::jsonb)
  ) into v_result;

  if v_result->'account' is null or v_result->'account' = 'null'::jsonb then
    raise exception using errcode = 'P0002', message = 'Founder account is not initialized';
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_founder_workspace() from public, anon;
grant execute on function public.get_founder_workspace() to authenticated;


-- Align listing submission with the PRD: an email-verified founder and an eligible
-- subscription are required. The check is repeated in PostgreSQL, not trusted to UI.
create or replace function public.create_product_listing(
  p_name text, p_tagline text, p_description text, p_category text, p_website_url text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $
declare
  v_owner uuid := auth.uid();
  v_plan public.plan_tier;
  v_sub public.subscription_state;
  v_verified timestamptz;
  v_valid_until timestamptz;
  v_grace timestamptz;
  v_limit integer;
  v_plan_config jsonb;
  v_count integer;
  v_id uuid := gen_random_uuid();
  v_slug text;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 100
     or p_tagline is null or char_length(trim(p_tagline)) not between 5 and 180 then
    raise exception using errcode = '22023', message = 'Product name or tagline is invalid';
  end if;
  if p_website_url is null or p_website_url !~* '^https://[^[:space:]]+
 then
    raise exception using errcode = '22023', message = 'Website must use HTTPS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('saaslistatlas-listings:' || v_owner::text, 0));
  select plan, subscription_status, email_verified_at, subscription_valid_until, grace_period_ends_at
    into v_plan, v_sub, v_verified, v_valid_until, v_grace
    from public.user_accounts where id = v_owner for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Founder account is not initialized';
  end if;
  if v_verified is null then
    raise exception using errcode = '42501', message = 'Verify your email before submitting a listing';
  end if;
  if not public.subscription_is_eligible(v_sub, v_valid_until, v_grace) then
    raise exception using errcode = '42501', message = 'An eligible subscription is required to submit a listing';
  end if;

  select plan_catalog -> v_plan::text into v_plan_config from public.credit_rules where singleton;
  if v_plan_config is null then
    raise exception using errcode = 'P0002', message = 'Account plan has no configured listing rule';
  end if;
  v_limit := nullif(v_plan_config ->> 'listing_limit', '')::integer;
  select count(*) into v_count from public.products
    where owner_id = v_owner and state in ('pending', 'approved', 'paused');
  if v_limit is not null and v_count >= v_limit then
    raise exception using errcode = '22023', message = 'Your plan listing limit has been reached';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'))
    || '-' || substr(v_id::text, 1, 8);
  insert into public.products(id, owner_id, name, slug, tagline, description, category, website_url)
    values (v_id, v_owner, trim(p_name), v_slug, trim(p_tagline), coalesce(p_description, ''), trim(p_category), p_website_url);
  return v_id;
end;
$;

revoke all on function public.create_product_listing(text, text, text, text, text) from public, anon;
grant execute on function public.create_product_listing(text, text, text, text, text) to authenticated;

commit;
