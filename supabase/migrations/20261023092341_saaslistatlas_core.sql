-- SaaslistAtlas core data model. Apply only to a newly created Supabase project.
-- Standing bids remain reserved at every rank until changed or withdrawn.
create extension if not exists pgcrypto;

create type public.plan_tier as enum ('starter', 'growth', 'business');
create type public.subscription_state as enum ('inactive', 'trialing', 'active', 'past_due', 'cancelled', 'expired', 'refunded');
create type public.product_state as enum ('pending', 'approved', 'paused', 'rejected', 'archived');
create type public.bid_state as enum ('active', 'withdrawn');
create type public.referral_state as enum ('pending', 'qualified', 'rewarded', 'reversed', 'rejected');
create type public.purchase_state as enum ('pending', 'paid', 'failed', 'refunded', 'charged_back');

create table public.credit_rules (
  singleton boolean primary key default true check (singleton),
  min_initial_bid integer not null default 5 check (min_initial_bid > 0),
  min_increment integer not null default 5 check (min_increment > 0),
  withdrawal_cooldown interval not null default interval '24 hours' check (withdrawal_cooldown >= interval '0'),
  subscription_grace_period interval not null default interval '7 days' check (subscription_grace_period >= interval '0'),
  referral_attribution_days integer not null default 30 check (referral_attribution_days between 1 and 365),
  plan_catalog jsonb not null default '{"starter":{"monthly_price_minor":500,"listing_limit":1},"growth":{"monthly_price_minor":2500,"listing_limit":5},"business":{"monthly_price_minor":5000,"listing_limit":null}}'::jsonb,
  referral_rewards jsonb not null default '{"starter":5,"growth":50,"business":100}'::jsonb,
  package_catalog jsonb not null default '[{"credits":50,"price_minor":500},{"credits":120,"price_minor":1000},{"credits":300,"price_minor":2000},{"credits":800,"price_minor":4500}]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.credit_rules(singleton) values (true);

create function public.subscription_is_eligible(p_status public.subscription_state, p_valid_until timestamptz, p_grace_ends_at timestamptz)
returns boolean language sql stable set search_path = public as $$
  select case p_status
    when 'active' then p_valid_until is null or p_valid_until > now()
    when 'trialing' then p_valid_until is null or p_valid_until > now()
    when 'cancelled' then p_valid_until is not null and p_valid_until > now()
    when 'past_due' then p_grace_ends_at is not null and p_grace_ends_at > now()
    else false
  end
$$;

create table public.user_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan public.plan_tier not null default 'starter',
  subscription_status public.subscription_state not null default 'inactive',
  subscription_valid_until timestamptz,
  grace_period_ends_at timestamptz,
  email_verified_at timestamptz,
  referral_code text not null unique default lower(encode(gen_random_bytes(8), 'hex')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (display_name is null or char_length(display_name) between 1 and 80)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.user_accounts(id),
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique,
  tagline text not null check (char_length(tagline) between 5 and 180),
  description text not null default '' check (char_length(description) <= 5000),
  category text not null check (char_length(category) between 2 and 60),
  website_url text not null check (website_url ~* '^https://[^[:space:]]+$'),
  state public.product_state not null default 'pending',
  participates boolean not null default true,
  current_rank integer check (current_rank is null or current_rank > 0),
  previous_rank integer check (previous_rank is null or previous_rank > 0),
  rank_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_owner_state_idx on public.products(owner_id, state);
create index products_category_idx on public.products(category);

create table public.credit_accounts (
  owner_id uuid primary key references public.user_accounts(id) on delete cascade,
  available integer not null default 0 check (available >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  purchased_total integer not null default 0 check (purchased_total >= 0),
  earned_total integer not null default 0 check (earned_total >= 0),
  spent_total integer not null default 0 check (spent_total >= 0),
  reversed_total integer not null default 0 check (reversed_total >= 0),
  updated_at timestamptz not null default now()
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.user_accounts(id),
  product_id uuid references public.products(id),
  referral_id uuid,
  source_type text not null check (source_type in ('purchase', 'referral', 'bid_reserve', 'bid_release', 'withdrawal', 'refund', 'chargeback', 'admin_adjustment', 'reconciliation')),
  source_id text,
  idempotency_key text not null,
  credit_amount integer not null check (credit_amount > 0),
  available_delta integer not null,
  reserved_delta integer not null,
  reason text not null check (char_length(reason) between 3 and 240),
  audit_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  check (available_delta + reserved_delta = 0 or source_type not in ('bid_reserve', 'bid_release', 'withdrawal'))
);
create index credit_ledger_owner_time_idx on public.credit_ledger(owner_id, created_at desc);

create table public.standing_bids (
  product_id uuid primary key references public.products(id),
  owner_id uuid not null references public.user_accounts(id),
  amount integer not null check (amount > 0),
  state public.bid_state not null default 'active',
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  last_withdrawn_at timestamptz
);
create index standing_bids_rank_idx on public.standing_bids(amount desc, accepted_at asc, product_id) where state = 'active';
create index standing_bids_owner_idx on public.standing_bids(owner_id, state);

create table public.bid_requests (
  owner_id uuid not null references public.user_accounts(id),
  idempotency_key uuid not null,
  product_id uuid not null references public.products(id),
  requested_amount integer not null check (requested_amount > 0),
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (owner_id, idempotency_key)
);

create table public.bid_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  previous_rank integer,
  new_rank integer,
  event_type text not null check (event_type in ('rank_changed', 'bid_changed', 'bid_withdrawn')),
  happened_at timestamptz not null default now(),
  check (previous_rank is distinct from new_rank or event_type <> 'rank_changed')
);
create index bid_events_product_time_idx on public.bid_events(product_id, happened_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.user_accounts(id) on delete cascade,
  event_id uuid references public.bid_events(id),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, event_id, kind)
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.user_accounts(id),
  referred_user_id uuid unique references public.user_accounts(id),
  attribution_code text not null,
  state public.referral_state not null default 'pending',
  attribution_at timestamptz not null default now(),
  qualified_at timestamptz,
  reward_credits integer check (reward_credits is null or reward_credits > 0),
  qualifying_subscription_id text unique,
  reviewed_at timestamptz,
  review_reason text,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_id is distinct from referred_user_id)
);
alter table public.credit_ledger add constraint credit_ledger_referral_fk foreign key (referral_id) references public.referrals(id);
create index referrals_referrer_time_idx on public.referrals(referrer_id, created_at desc);

create table public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.user_accounts(id),
  package_credits integer not null check (package_credits > 0),
  amount_minor integer not null check (amount_minor > 0),
  currency char(3) not null default 'USD',
  state public.purchase_state not null default 'pending',
  provider text,
  provider_transaction_id text unique,
  checkout_reference text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.payment_webhook_events (
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload_hash text not null,
  processing_state text not null default 'received' check (processing_state in ('received', 'processed', 'ignored', 'retryable_error', 'permanent_error')),
  purchase_id uuid references public.credit_purchases(id),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  primary key (provider, provider_event_id)
);

-- Provision a zero-credit wallet whenever an account is created. Subscription and roles
-- are intentionally writable only by trusted server/webhook code.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_accounts(id, display_name, email_verified_at)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)), 80), new.email_confirmed_at);
  insert into public.credit_accounts(owner_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.sync_user_email_verification() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.user_accounts set email_verified_at = new.email_confirmed_at, updated_at = now() where id = new.id;
  return new;
end;
$$;
create trigger on_auth_user_verified after update of email_confirmed_at on auth.users for each row
  when (old.email_confirmed_at is distinct from new.email_confirmed_at) execute function public.sync_user_email_verification();

create function public.reject_ledger_mutation() returns trigger language plpgsql as $$
begin raise exception 'Credit ledger entries are immutable'; end;
$$;
create trigger credit_ledger_immutable before update or delete on public.credit_ledger for each row execute function public.reject_ledger_mutation();

create view public.public_leaderboard as
select p.id, p.slug, p.name, p.tagline, p.category, p.website_url, b.amount as standing_bid,
       case when b.amount is not null then row_number() over (order by b.amount desc nulls last, b.accepted_at asc nulls last, p.id asc)::integer end as current_rank,
       p.previous_rank, p.rank_changed_at, b.accepted_at
from public.products p
left join public.standing_bids b on b.product_id = p.id and b.state = 'active'
join public.user_accounts a on a.id = p.owner_id
where p.state = 'approved' and p.participates
  and a.email_verified_at is not null
  and public.subscription_is_eligible(a.subscription_status, a.subscription_valid_until, a.grace_period_ends_at);

create function public.refresh_leaderboard(p_event_type text default 'rank_changed') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_changes jsonb;
begin
  update public.products set previous_rank = current_rank where current_rank is not null;
  update public.products p set current_rank = null, rank_changed_at = now()
    where p.current_rank is not null and not exists (
      select 1 from public.standing_bids b join public.user_accounts a on a.id = b.owner_id
      where b.product_id = p.id and b.state = 'active' and p.state = 'approved' and p.participates
        and a.email_verified_at is not null
        and public.subscription_is_eligible(a.subscription_status, a.subscription_valid_until, a.grace_period_ends_at)
    );
  with ranked as (
    select p.id, row_number() over (order by b.amount desc, b.accepted_at asc, p.id asc)::integer as next_rank
    from public.products p
    join public.standing_bids b on b.product_id = p.id and b.state = 'active'
    join public.user_accounts a on a.id = p.owner_id
    where p.state = 'approved' and p.participates and a.email_verified_at is not null
      and public.subscription_is_eligible(a.subscription_status, a.subscription_valid_until, a.grace_period_ends_at)
  )
  update public.products p set current_rank = ranked.next_rank,
    rank_changed_at = case when p.current_rank is distinct from ranked.next_rank then now() else p.rank_changed_at end
  from ranked where ranked.id = p.id;
  with changed as (
    insert into public.bid_events(product_id, previous_rank, new_rank, event_type)
    select id, previous_rank, current_rank, p_event_type from public.products
    where previous_rank is distinct from current_rank and (previous_rank is not null or current_rank is not null)
    returning id, product_id, previous_rank, new_rank
  ), notified as (
    insert into public.notifications(owner_id, event_id, kind, payload)
    select p.owner_id, e.id, 'rank_changed', jsonb_build_object('product_id', e.product_id, 'previous_rank', e.previous_rank, 'new_rank', e.new_rank)
    from changed e join public.products p on p.id = e.product_id
    on conflict (owner_id, event_id, kind) do nothing
    returning id, event_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('event_id', e.id, 'product_id', e.product_id,
      'previous_rank', e.previous_rank, 'new_rank', e.new_rank, 'notification_event_id', n.id)), '[]'::jsonb)
    into v_changes from changed e left join notified n on n.event_id = e.id;
  return v_changes;
end;
$$;

create function public.place_or_update_bid(p_product_id uuid, p_amount integer, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid := auth.uid(); v_product public.products%rowtype; v_account public.credit_accounts%rowtype;
  v_bid public.standing_bids%rowtype; v_rule public.credit_rules%rowtype;
  v_plan public.plan_tier; v_sub public.subscription_state; v_verified timestamptz; v_valid_until timestamptz; v_grace timestamptz;
  v_other_top integer; v_old_amount integer := 0; v_delta integer; v_now timestamptz := clock_timestamp();
  v_rank_changes jsonb;
  v_request public.bid_requests%rowtype; v_result jsonb;
begin
  if v_owner is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception using errcode = '22023', message = 'Bid amount must be a positive integer'; end if;
  if p_idempotency_key is null then raise exception using errcode = '22023', message = 'Idempotency key required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('saaslistatlas-leaderboard', 0));
  insert into public.bid_requests(owner_id, idempotency_key, product_id, requested_amount)
    values (v_owner, p_idempotency_key, p_product_id, p_amount) on conflict do nothing;
  select * into v_request from public.bid_requests where owner_id = v_owner and idempotency_key = p_idempotency_key for update;
  if v_request.result is not null then return v_request.result; end if;
  if v_request.product_id <> p_product_id or v_request.requested_amount <> p_amount then
    raise exception using errcode = '22023', message = 'Idempotency key was already used for a different request';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found or v_product.owner_id <> v_owner then raise exception using errcode = '42501', message = 'Product not found or not owned by account'; end if;
  select plan, subscription_status, email_verified_at, subscription_valid_until, grace_period_ends_at
    into v_plan, v_sub, v_verified, v_valid_until, v_grace from public.user_accounts where id = v_owner for update;
  if v_verified is null then raise exception using errcode = '42501', message = 'Verify your account before bidding'; end if;
  if not public.subscription_is_eligible(v_sub, v_valid_until, v_grace) then
    raise exception using errcode = '42501', message = 'An eligible subscription is required to bid';
  end if;
  if v_product.state <> 'approved' or not v_product.participates then raise exception using errcode = '42501', message = 'This listing is not eligible to bid'; end if;
  select * into v_rule from public.credit_rules where singleton;
  select * into v_bid from public.standing_bids where product_id = p_product_id for update;
  if found and v_bid.state = 'active' then v_old_amount := v_bid.amount; end if;
  if v_bid.state = 'withdrawn' and v_bid.last_withdrawn_at > v_now - v_rule.withdrawal_cooldown then
    raise exception using errcode = '22023', message = 'This listing is in its bid withdrawal cooldown';
  end if;
  if v_old_amount = 0 and p_amount < v_rule.min_initial_bid then
    raise exception using errcode = '22023', message = 'Bid is below the configured initial minimum';
  end if;
  if p_amount = v_old_amount then raise exception using errcode = '22023', message = 'Your listing already has this standing bid'; end if;
  select coalesce(max(b.amount), 0) into v_other_top
    from public.standing_bids b join public.products p on p.id = b.product_id
      join public.user_accounts a on a.id = b.owner_id
    where b.state = 'active' and b.product_id <> p_product_id and p.state = 'approved' and p.participates
      and a.email_verified_at is not null
      and public.subscription_is_eligible(a.subscription_status, a.subscription_valid_until, a.grace_period_ends_at);
  if p_amount > v_other_top and v_other_top > 0 and p_amount < v_other_top + v_rule.min_increment then
    raise exception using errcode = '22023', message = format('To take the lead, bid at least %s credits', v_other_top + v_rule.min_increment);
  end if;
  v_delta := p_amount - v_old_amount;
  select * into v_account from public.credit_accounts where owner_id = v_owner for update;
  if not found then raise exception using errcode = 'P0002', message = 'Credit account not found'; end if;
  if v_delta > v_account.available then raise exception using errcode = '22023', message = 'Insufficient available credits'; end if;
  update public.credit_accounts set available = available - v_delta, reserved = reserved + v_delta, updated_at = v_now where owner_id = v_owner;
  if v_delta <> 0 then
    insert into public.credit_ledger(owner_id, product_id, source_type, source_id, idempotency_key, credit_amount, available_delta, reserved_delta, reason, audit_metadata)
      values (v_owner, p_product_id, case when v_delta > 0 then 'bid_reserve' else 'bid_release' end,
        p_product_id::text, 'bid:' || p_idempotency_key::text, abs(v_delta), -v_delta, v_delta,
        case when v_delta > 0 then 'Standing bid reserved' else 'Standing bid reduced; excess reservation released' end,
        jsonb_build_object('previous_amount', v_old_amount, 'new_amount', p_amount));
  end if;
  insert into public.standing_bids(product_id, owner_id, amount, state, accepted_at, updated_at, withdrawn_at, last_withdrawn_at)
    values (p_product_id, v_owner, p_amount, 'active', v_now, v_now, null, v_bid.last_withdrawn_at)
    on conflict (product_id) do update set amount = excluded.amount, owner_id = excluded.owner_id,
      state = 'active', accepted_at = case when standing_bids.amount = excluded.amount and standing_bids.state = 'active' then standing_bids.accepted_at else excluded.accepted_at end,
      updated_at = excluded.updated_at, withdrawn_at = null;
  v_rank_changes := public.refresh_leaderboard('rank_changed');
  select jsonb_build_object('product_id', p_product_id, 'accepted_bid', p_amount,
      'available_credits', available, 'reserved_credits', reserved, 'additional_reserved', greatest(v_delta,0),
      'released_credits', greatest(-v_delta,0), 'rank', current_rank,
      'minimum_initial_bid', v_rule.min_initial_bid, 'minimum_increment', v_rule.min_increment,
      'affected_rank_changes', v_rank_changes)
    into v_result from public.credit_accounts ca join public.products p on p.id = p_product_id where ca.owner_id = v_owner;
  update public.bid_requests set result = v_result where owner_id = v_owner and idempotency_key = p_idempotency_key;
  insert into public.bid_events(product_id, previous_rank, new_rank, event_type)
    values (p_product_id, v_product.current_rank, (v_result->>'rank')::integer, 'bid_changed');
  return v_result;
end;
$$;

create function public.withdraw_standing_bid(p_product_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid := auth.uid(); v_bid public.standing_bids%rowtype; v_rule public.credit_rules%rowtype;
  v_account public.credit_accounts%rowtype; v_product public.products%rowtype; v_now timestamptz := clock_timestamp(); v_result jsonb; v_rank_changes jsonb;
begin
  if v_owner is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('saaslistatlas-leaderboard', 0));
  select * into v_bid from public.standing_bids where product_id = p_product_id for update;
  if not found or v_bid.owner_id <> v_owner then raise exception using errcode = '42501', message = 'Active bid not found for this account'; end if;
  if v_bid.state = 'withdrawn' then return jsonb_build_object('product_id', p_product_id, 'withdrawn', true, 'released_credits', 0); end if;
  select * into v_rule from public.credit_rules where singleton;
  if v_bid.last_withdrawn_at is not null and v_bid.last_withdrawn_at > v_now - v_rule.withdrawal_cooldown then
    raise exception using errcode = '22023', message = 'This listing is in its bid withdrawal cooldown';
  end if;
  select * into v_account from public.credit_accounts where owner_id = v_owner for update;
  select * into v_product from public.products where id = p_product_id for update;
  update public.credit_accounts set available = available + v_bid.amount, reserved = reserved - v_bid.amount, updated_at = v_now where owner_id = v_owner;
  update public.standing_bids set state = 'withdrawn', withdrawn_at = v_now, last_withdrawn_at = v_now, updated_at = v_now where product_id = p_product_id;
  insert into public.credit_ledger(owner_id, product_id, source_type, source_id, idempotency_key, credit_amount, available_delta, reserved_delta, reason)
    values (v_owner, p_product_id, 'withdrawal', p_idempotency_key::text, 'withdraw:' || p_idempotency_key::text, v_bid.amount, v_bid.amount, -v_bid.amount, 'Founder withdrew the active standing bid');
  v_rank_changes := public.refresh_leaderboard('rank_changed');
  select jsonb_build_object('product_id', p_product_id, 'withdrawn', true, 'released_credits', v_bid.amount,
      'available_credits', available, 'reserved_credits', reserved, 'affected_rank_changes', v_rank_changes) into v_result
    from public.credit_accounts where owner_id = v_owner;
  insert into public.bid_events(product_id, previous_rank, new_rank, event_type)
    values (p_product_id, v_product.current_rank, null, 'bid_withdrawn');
  return v_result;
end;
$$;

-- Trusted billing jobs call this after a subscription state change. Once a founder
-- is outside their paid period and grace window, preserve products/history but
-- withdraw active bids and return the reservations in one transaction.
create function public.release_ineligible_standing_bids(p_owner_id uuid, p_subscription_event_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status public.subscription_state; v_valid_until timestamptz; v_grace timestamptz;
  v_account public.credit_accounts%rowtype; v_bid record; v_released integer := 0;
  v_rank_changes jsonb; v_now timestamptz := clock_timestamp();
begin
  if p_owner_id is null or p_subscription_event_id is null or length(trim(p_subscription_event_id)) < 4 then
    raise exception using errcode = '22023', message = 'Account and provider event ID are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('saaslistatlas-leaderboard', 0));
  select subscription_status, subscription_valid_until, grace_period_ends_at
    into v_status, v_valid_until, v_grace from public.user_accounts where id = p_owner_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Account not found'; end if;
  if public.subscription_is_eligible(v_status, v_valid_until, v_grace) then
    return jsonb_build_object('released_credits', 0, 'affected_rank_changes', '[]'::jsonb, 'reason', 'subscription_still_eligible');
  end if;
  select * into v_account from public.credit_accounts where owner_id = p_owner_id for update;
  for v_bid in select b.product_id, b.amount from public.standing_bids b
    where b.owner_id = p_owner_id and b.state = 'active' order by b.product_id for update
  loop
    update public.standing_bids set state = 'withdrawn', withdrawn_at = v_now, updated_at = v_now where product_id = v_bid.product_id;
    update public.credit_accounts set available = available + v_bid.amount, reserved = reserved - v_bid.amount, updated_at = v_now where owner_id = p_owner_id;
    insert into public.credit_ledger(owner_id, product_id, source_type, source_id, idempotency_key, credit_amount,
      available_delta, reserved_delta, reason, audit_metadata)
    values (p_owner_id, v_bid.product_id, 'withdrawal', p_subscription_event_id,
      'subscription-expiry:' || p_subscription_event_id || ':' || v_bid.product_id::text,
      v_bid.amount, v_bid.amount, -v_bid.amount, 'Standing bid released after subscription eligibility ended',
      jsonb_build_object('subscription_status', v_status));
    v_released := v_released + v_bid.amount;
  end loop;
  v_rank_changes := public.refresh_leaderboard('rank_changed');
  return jsonb_build_object('released_credits', v_released, 'affected_rank_changes', v_rank_changes);
end;
$$;

create function public.create_product_listing(p_name text, p_tagline text, p_description text, p_category text, p_website_url text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); v_plan public.plan_tier; v_sub public.subscription_state; v_valid_until timestamptz; v_grace timestamptz;
  v_limit integer; v_plan_config jsonb; v_count integer; v_id uuid := gen_random_uuid(); v_slug text;
begin
  if v_owner is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 100 or p_tagline is null or char_length(trim(p_tagline)) not between 5 and 180 then
    raise exception using errcode = '22023', message = 'Product name or tagline is invalid'; end if;
  if p_website_url is null or p_website_url !~* '^https://[^[:space:]]+$' then raise exception using errcode = '22023', message = 'Website must use HTTPS'; end if;
  perform pg_advisory_xact_lock(hashtextextended('saaslistatlas-listings:' || v_owner::text, 0));
  select plan, subscription_status, subscription_valid_until, grace_period_ends_at into v_plan, v_sub, v_valid_until, v_grace
    from public.user_accounts where id = v_owner for update;
  if not public.subscription_is_eligible(v_sub, v_valid_until, v_grace) then
    raise exception using errcode = '42501', message = 'An eligible subscription is required to submit a listing'; end if;
  select plan_catalog -> v_plan::text into v_plan_config from public.credit_rules where singleton;
  if v_plan_config is null then raise exception using errcode = 'P0002', message = 'Account plan has no configured listing rule'; end if;
  v_limit := nullif(v_plan_config ->> 'listing_limit', '')::integer;
  select count(*) into v_count from public.products where owner_id = v_owner and state in ('pending', 'approved', 'paused');
  if v_limit is not null and v_count >= v_limit then raise exception using errcode = '22023', message = 'Your plan listing limit has been reached'; end if;
  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')) || '-' || substr(v_id::text, 1, 8);
  insert into public.products(id, owner_id, name, slug, tagline, description, category, website_url)
    values (v_id, v_owner, trim(p_name), v_slug, trim(p_tagline), coalesce(p_description, ''), trim(p_category), p_website_url);
  return v_id;
end;
$$;

create function public.admin_credit_reconciliation()
returns table(owner_id uuid, cached_available integer, ledger_available bigint, cached_reserved integer, ledger_reserved bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_accounts where id = auth.uid() and is_admin) then raise exception using errcode = '42501', message = 'Admin access required'; end if;
  return query
  select ca.owner_id, ca.available, coalesce(sum(cl.available_delta),0)::bigint, ca.reserved, coalesce(sum(cl.reserved_delta),0)::bigint
  from public.credit_accounts ca left join public.credit_ledger cl on cl.owner_id = ca.owner_id
  group by ca.owner_id, ca.available, ca.reserved
  having ca.available <> coalesce(sum(cl.available_delta),0) or ca.reserved <> coalesce(sum(cl.reserved_delta),0);
end;
$$;

alter table public.user_accounts enable row level security;
alter table public.products enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.standing_bids enable row level security;
alter table public.bid_events enable row level security;
alter table public.notifications enable row level security;
alter table public.referrals enable row level security;
alter table public.credit_purchases enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.credit_rules enable row level security;

create policy account_self_read on public.user_accounts for select to authenticated using (id = auth.uid());
create policy products_public_read on public.products for select to anon, authenticated using (state = 'approved');
create policy products_owner_read on public.products for select to authenticated using (owner_id = auth.uid());
create policy balances_self_read on public.credit_accounts for select to authenticated using (owner_id = auth.uid());
create policy ledger_self_read on public.credit_ledger for select to authenticated using (owner_id = auth.uid());
create policy standing_bids_public_read on public.standing_bids for select to anon, authenticated using (state = 'active');
create policy standing_bids_owner_read on public.standing_bids for select to authenticated using (owner_id = auth.uid());
create policy notifications_self_read on public.notifications for select to authenticated using (owner_id = auth.uid());
create policy referrals_referrer_read on public.referrals for select to authenticated using (referrer_id = auth.uid());
create policy purchases_self_read on public.credit_purchases for select to authenticated using (owner_id = auth.uid());
create policy rules_read on public.credit_rules for select to anon, authenticated using (true);

grant select on public.public_leaderboard to anon, authenticated;
revoke all on public.products, public.standing_bids, public.bid_events from anon, authenticated;
grant select on public.credit_rules to anon, authenticated;
grant select on public.user_accounts, public.credit_accounts, public.credit_ledger, public.notifications, public.referrals, public.credit_purchases to authenticated;
revoke execute on function public.refresh_leaderboard(text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_user_email_verification() from public, anon, authenticated;
revoke execute on function public.reject_ledger_mutation() from public, anon, authenticated;
revoke execute on function public.place_or_update_bid(uuid, integer, uuid) from public, anon;
revoke execute on function public.withdraw_standing_bid(uuid, uuid) from public, anon;
revoke execute on function public.create_product_listing(text, text, text, text, text) from public, anon;
revoke execute on function public.admin_credit_reconciliation() from public, anon;
grant execute on function public.place_or_update_bid(uuid, integer, uuid) to authenticated;
grant execute on function public.withdraw_standing_bid(uuid, uuid) to authenticated;
grant execute on function public.create_product_listing(text, text, text, text, text) to authenticated;
grant execute on function public.admin_credit_reconciliation() to authenticated;
revoke execute on function public.release_ineligible_standing_bids(uuid, text) from public, anon, authenticated;
grant execute on function public.release_ineligible_standing_bids(uuid, text) to service_role;

-- No client-side INSERT/UPDATE/DELETE grants for credit, bid, payment, referral, or account tables.
