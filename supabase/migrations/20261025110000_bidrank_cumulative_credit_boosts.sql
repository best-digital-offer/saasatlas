-- Bidrank-style cumulative-credit boosts for every unified leaderboard entry.
-- Founder listings keep any pre-existing standing bid as their starting score; new boosts
-- are additive credit spends. Approved catalog entries become first-class leaderboard rows.

create table if not exists public.leaderboard_credit_bids (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.user_accounts(id) on delete cascade,
  entry_type text not null check (entry_type in ('founder', 'catalog')),
  product_id uuid references public.products(id) on delete cascade,
  catalog_product_id uuid references public.catalog_products(id) on delete cascade,
  amount integer not null check (amount > 0),
  idempotency_key uuid not null,
  result jsonb,
  created_at timestamptz not null default now(),
  constraint leaderboard_credit_bids_entry_check check (
    (entry_type = 'founder' and product_id is not null and catalog_product_id is null)
    or (entry_type = 'catalog' and catalog_product_id is not null and product_id is null)
  ),
  unique (owner_id, idempotency_key)
);
create index if not exists leaderboard_credit_bids_product_idx
  on public.leaderboard_credit_bids(product_id, created_at)
  where product_id is not null;
create index if not exists leaderboard_credit_bids_catalog_idx
  on public.leaderboard_credit_bids(catalog_product_id, created_at)
  where catalog_product_id is not null;
alter table public.leaderboard_credit_bids enable row level security;
revoke all on public.leaderboard_credit_bids from anon, authenticated;

-- Preserve every existing active standing bid as the product's initial cumulative score.
insert into public.leaderboard_credit_bids(owner_id, entry_type, product_id, catalog_product_id, amount, idempotency_key, created_at)
select b.owner_id, 'founder', b.product_id, null, b.amount, gen_random_uuid(), b.accepted_at
from public.standing_bids b
where b.state = 'active';

-- Convert the old reservation bucket into permanently spent boost credits without
-- changing each account's available balance. The idempotency key prevents double conversion.
with inserted_conversions as (
  insert into public.credit_ledger(
    owner_id, product_id, source_type, source_id, idempotency_key,
    credit_amount, available_delta, reserved_delta, reason, audit_metadata
  )
  select b.owner_id, b.product_id, 'bid_spend',
    'legacy-standing-bid:' || b.product_id::text,
    'legacy-standing-bid-conversion:' || b.product_id::text,
    b.amount, 0, -b.amount, 'Converted legacy standing bid into cumulative bid credits',
    jsonb_build_object('conversion', 'bidrank_cumulative_credit', 'original_accepted_at', b.accepted_at)
  from public.standing_bids b
  where b.state = 'active'
  on conflict (owner_id, idempotency_key) do nothing
  returning owner_id, credit_amount
), account_conversions as (
  select owner_id, sum(credit_amount)::integer as converted_amount
  from inserted_conversions
  group by owner_id
)
update public.credit_accounts ca
set reserved = greatest(0, ca.reserved - ac.converted_amount),
    spent_total = ca.spent_total + ac.converted_amount,
    updated_at = now()
from account_conversions ac
where ca.owner_id = ac.owner_id;

update public.standing_bids
set state = 'withdrawn', withdrawn_at = now(), last_withdrawn_at = now(), updated_at = now()
where state = 'active';

revoke execute on function public.place_or_update_bid(uuid, integer, uuid, integer) from public, anon, authenticated;
revoke execute on function public.withdraw_standing_bid(uuid, uuid) from public, anon, authenticated;

alter table public.credit_ledger drop constraint if exists credit_ledger_source_type_check;
alter table public.credit_ledger add constraint credit_ledger_source_type_check
  check (source_type in ('purchase', 'referral', 'bid_reserve', 'bid_release', 'withdrawal', 'refund', 'chargeback', 'admin_adjustment', 'reconciliation', 'bid_spend'));

create or replace view public.public_leaderboard as
with founder_boosts as (
  select product_id, sum(amount)::bigint as boost_credits, min(created_at) as first_boost_at
  from public.leaderboard_credit_bids
  where entry_type = 'founder' and product_id is not null
  group by product_id
),
catalog_boosts as (
  select catalog_product_id, sum(amount)::bigint as boost_credits, min(created_at) as first_boost_at
  from public.leaderboard_credit_bids
  where entry_type = 'catalog' and catalog_product_id is not null
  group by catalog_product_id
),
founder_entries as (
  select
    p.id, p.slug, p.name, p.tagline, p.category, p.website_url,
    null::integer as standing_bid,
    p.previous_rank, p.rank_changed_at,
    p.logo_url,
    coalesce(fb.boost_credits, 0)::bigint as total_bid_credits,
    fb.first_boost_at as first_bid_at,
    p.created_at,
    'founder'::text as entry_type,
    null::text as source_provider,
    null::text as source_url,
    null::text as attribution_text,
    null::timestamptz as verified_at,
    null::text as pricing_model,
    null::text as pricing_url,
    null::timestamptz as pricing_verified_at,
    null::text as description_source_url,
    null::timestamptz as description_verified_at,
    p.website_url as canonical_url,
    null::text as seo_path
  from public.products p
  left join founder_boosts fb on fb.product_id = p.id
  join public.user_accounts a on a.id = p.owner_id
  where p.state = 'approved' and p.participates
    and a.email_verified_at is not null
    and public.subscription_is_eligible(a.subscription_status, a.subscription_valid_until, a.grace_period_ends_at)
),
catalog_entries as (
  select
    c.id, c.slug, c.name, c.description as tagline, c.category, c.canonical_url as website_url,
    null::integer as standing_bid,
    null::integer as previous_rank,
    c.updated_at as rank_changed_at,
    c.logo_path as logo_url,
    coalesce(cb.boost_credits, 0)::bigint as total_bid_credits,
    cb.first_boost_at as first_bid_at,
    c.created_at,
    'catalog'::text as entry_type,
    c.source_provider,
    c.source_url,
    c.attribution_text,
    c.verified_at,
    c.pricing_model,
    c.pricing_url,
    c.pricing_verified_at,
    c.description_source_url,
    c.description_verified_at,
    c.canonical_url,
    ('/products/' || c.slug || '/')::text as seo_path
  from public.catalog_products c
  left join catalog_boosts cb on cb.catalog_product_id = c.id
  where c.moderation_status = 'approved'
),
all_entries as (
  select * from founder_entries
  union all
  select * from catalog_entries
),
ranked as (
  select e.*,
    row_number() over (
      order by e.total_bid_credits desc,
        e.first_bid_at asc nulls last,
        e.created_at asc,
        e.entry_type asc,
        e.id asc
    )::integer as current_rank
  from all_entries e
)
select id, slug, name, tagline, category, website_url, standing_bid,
  current_rank, previous_rank, rank_changed_at, first_bid_at as accepted_at, logo_url,
  entry_type, total_bid_credits, source_provider, source_url, attribution_text, verified_at,
  pricing_model, pricing_url, pricing_verified_at, description_source_url, description_verified_at,
  canonical_url, seo_path, created_at
from ranked;

create or replace function public.boost_leaderboard_entry(
  p_entry_type text,
  p_entry_id uuid,
  p_amount integer,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  v_owner uuid := auth.uid();
  v_account public.credit_accounts%rowtype;
  v_rule public.credit_rules%rowtype;
  v_bid public.leaderboard_credit_bids%rowtype;
  v_sub public.subscription_state;
  v_verified timestamptz;
  v_valid_until timestamptz;
  v_grace timestamptz;
  v_current_total bigint;
  v_old_rank integer;
  v_new_total bigint;
  v_new_rank integer;
  v_entry_name text;
  v_product_id uuid := null;
  v_catalog_product_id uuid := null;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_entry_type not in ('founder', 'catalog') then
    raise exception using errcode = '22023', message = 'Choose a valid leaderboard listing';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Enter a positive whole number of credits to add';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'Idempotency key required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('saaslistatlas-leaderboard', 0));

  insert into public.leaderboard_credit_bids(owner_id, entry_type, product_id, catalog_product_id, amount, idempotency_key)
  values (v_owner, p_entry_type,
    case when p_entry_type = 'founder' then p_entry_id else null end,
    case when p_entry_type = 'catalog' then p_entry_id else null end,
    p_amount, p_idempotency_key)
  on conflict (owner_id, idempotency_key) do nothing;

  select * into v_bid from public.leaderboard_credit_bids
  where owner_id = v_owner and idempotency_key = p_idempotency_key
  for update;
  if v_bid.entry_type <> p_entry_type
    or coalesce(v_bid.product_id, v_bid.catalog_product_id) <> p_entry_id
    or v_bid.amount <> p_amount then
    raise exception using errcode = '22023', message = 'Idempotency key was already used for a different boost';
  end if;
  if v_bid.result is not null then return v_bid.result; end if;

  select * into v_rule from public.credit_rules where singleton;
  select subscription_status, email_verified_at, subscription_valid_until, grace_period_ends_at
    into v_sub, v_verified, v_valid_until, v_grace
  from public.user_accounts where id = v_owner for update;
  if v_verified is null then
    raise exception using errcode = '42501', message = 'Verify your email before boosting listings';
  end if;
  if not public.subscription_is_eligible(v_sub, v_valid_until, v_grace) then
    raise exception using errcode = '42501', message = 'An eligible subscription is required to boost listings';
  end if;

  select total_bid_credits, current_rank, name
    into v_current_total, v_old_rank, v_entry_name
  from public.public_leaderboard
  where entry_type = p_entry_type and id = p_entry_id;
  if not found then
    raise exception using errcode = '42501', message = 'This listing is not eligible for leaderboard boosts';
  end if;
  if v_current_total = 0 and p_amount < v_rule.min_initial_bid then
    raise exception using errcode = '22023', message = format('The first boost for a listing must be at least %s credits', v_rule.min_initial_bid);
  end if;

  select * into v_account from public.credit_accounts where owner_id = v_owner for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Credit account not found';
  end if;
  if p_amount > v_account.available then
    raise exception using errcode = '22023', message = 'Insufficient available credits';
  end if;

  update public.credit_accounts
  set available = available - p_amount,
      spent_total = spent_total + p_amount,
      updated_at = v_now
  where owner_id = v_owner;

  insert into public.credit_ledger(
    owner_id, product_id, source_type, source_id, idempotency_key,
    credit_amount, available_delta, reserved_delta, reason, audit_metadata
  ) values (
    v_owner, case when p_entry_type = 'founder' then p_entry_id else null end,
    'bid_spend', p_entry_type || ':' || p_entry_id::text,
    'leaderboard-boost:' || p_idempotency_key::text,
    p_amount, -p_amount, 0, 'Credits added to cumulative listing bid',
    jsonb_build_object('entry_type', p_entry_type, 'entry_id', p_entry_id, 'entry_name', v_entry_name, 'added_credits', p_amount)
  );

  update public.products set previous_rank = current_rank where current_rank is not null;

  with fresh_ranks as materialized (
    select id, current_rank
    from public.public_leaderboard
    where entry_type = 'founder'
  )
  update public.products p
  set current_rank = fr.current_rank,
      rank_changed_at = case when p.current_rank is distinct from fr.current_rank then v_now else p.rank_changed_at end
  from fresh_ranks fr
  where p.id = fr.id;

  select total_bid_credits, current_rank into v_new_total, v_new_rank
  from public.public_leaderboard
  where entry_type = p_entry_type and id = p_entry_id;

  v_result := jsonb_build_object(
    'entry_type', p_entry_type, 'entry_id', p_entry_id, 'entry_name', v_entry_name,
    'added_credits', p_amount, 'total_bid_credits', v_new_total,
    'previous_rank', v_old_rank, 'rank', v_new_rank,
    'available_credits', (select available from public.credit_accounts where owner_id = v_owner),
    'spent_total', (select spent_total from public.credit_accounts where owner_id = v_owner)
  );
  update public.leaderboard_credit_bids set result = v_result where id = v_bid.id;
  if p_entry_type = 'founder' then
    insert into public.bid_events(product_id, previous_rank, new_rank, event_type)
    values (p_entry_id, v_old_rank, v_new_rank, 'bid_changed');
  end if;
  return v_result;
end;
$function$;

revoke execute on function public.boost_leaderboard_entry(text, uuid, integer, uuid) from public, anon;
grant execute on function public.boost_leaderboard_entry(text, uuid, integer, uuid) to authenticated;

-- Keep legacy workspace data in step with the newly computed unified rank and score.
create or replace function public.get_founder_workspace()
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_owner uuid := auth.uid();
  v_result jsonb;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select jsonb_build_object(
    'account', (select jsonb_build_object(
      'id', a.id, 'display_name', a.display_name, 'plan', a.plan,
      'subscription_status', a.subscription_status, 'subscription_valid_until', a.subscription_valid_until,
      'grace_period_ends_at', a.grace_period_ends_at, 'email_verified_at', a.email_verified_at,
      'is_admin', a.is_admin, 'referral_code', a.referral_code
    ) from public.user_accounts a where a.id = v_owner),
    'wallet', (select jsonb_build_object(
      'available', w.available, 'reserved', w.reserved, 'purchased_total', w.purchased_total,
      'earned_total', w.earned_total, 'spent_total', w.spent_total
    ) from public.credit_accounts w where w.owner_id = v_owner),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'tagline', p.tagline, 'description', p.description,
        'category', p.category, 'website_url', p.website_url, 'logo_url', p.logo_url, 'state', p.state,
        'current_rank', (select pl.current_rank from public.public_leaderboard pl where pl.entry_type = 'founder' and pl.id = p.id),
        'previous_rank', p.previous_rank,
        'standing_bid', case when b.state = 'active' then b.amount else null end,
        'total_bid_credits', (select pl.total_bid_credits from public.public_leaderboard pl where pl.entry_type = 'founder' and pl.id = p.id),
        'bid_state', b.state, 'last_withdrawn_at', b.last_withdrawn_at, 'created_at', p.created_at
      ) order by p.created_at desc)
      from public.products p
      left join public.standing_bids b on b.product_id = p.id and b.owner_id = v_owner
      where p.owner_id = v_owner
    ), '[]'::jsonb),
    'ledger', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select l.id, l.source_type, l.credit_amount, l.available_delta, l.reserved_delta, l.reason, l.created_at
        from public.credit_ledger l where l.owner_id = v_owner order by l.created_at desc limit 25
      ) recent
    ), '[]'::jsonb),
    'referrals', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select r.id, r.state, r.reward_credits, r.attribution_at, r.created_at
        from public.referrals r where r.referrer_id = v_owner order by r.created_at desc limit 25
      ) recent
    ), '[]'::jsonb)
  ) into v_result;

  if v_result->'account' is null or v_result->'account' = 'null'::jsonb then
    raise exception using errcode = 'P0002', message = 'Founder account is not initialized';
  end if;
  return v_result;
end;
$function$;

-- Ensure stored founder ranks include the same catalog entries shown on the public board.
with fresh_ranks as materialized (
  select id, current_rank from public.public_leaderboard where entry_type = 'founder'
)
update public.products p
set previous_rank = p.current_rank,
    current_rank = fr.current_rank,
    rank_changed_at = case when p.current_rank is distinct from fr.current_rank then now() else p.rank_changed_at end
from fresh_ranks fr
where p.id = fr.id;
