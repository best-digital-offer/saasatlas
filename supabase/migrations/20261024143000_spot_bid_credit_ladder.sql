-- Publish a predictable five-credit spot ladder and enforce the same rules server-side.
create or replace function public.place_or_update_bid(
  p_product_id uuid, p_amount integer, p_idempotency_key uuid, p_target_rank integer
)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  v_owner uuid := auth.uid();
  v_product public.products%rowtype;
  v_account public.credit_accounts%rowtype;
  v_bid public.standing_bids%rowtype;
  v_rule public.credit_rules%rowtype;
  v_sub public.subscription_state;
  v_verified timestamptz;
  v_valid_until timestamptz;
  v_grace timestamptz;
  v_top_bid integer := 0;
  v_required_min integer;
  v_old_amount integer := 0;
  v_delta integer;
  v_now timestamptz := clock_timestamp();
  v_rank_changes jsonb;
  v_request public.bid_requests%rowtype;
  v_result jsonb;
begin
  if v_owner is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception using errcode = '22023', message = 'Bid amount must be a positive integer'; end if;
  if p_idempotency_key is null then raise exception using errcode = '22023', message = 'Idempotency key required'; end if;
  if p_target_rank is null or p_target_rank < 1 or p_target_rank > 100 then
    raise exception using errcode = '22023', message = 'Choose a target position between 1 and 100';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('saaslistatlas-leaderboard', 0));
  insert into public.bid_requests(owner_id, idempotency_key, product_id, requested_amount, target_rank)
  values (v_owner, p_idempotency_key, p_product_id, p_amount, p_target_rank) on conflict do nothing;
  select * into v_request from public.bid_requests
  where owner_id = v_owner and idempotency_key = p_idempotency_key for update;
  if v_request.result is not null then return v_request.result; end if;
  if v_request.product_id <> p_product_id or v_request.requested_amount <> p_amount or v_request.target_rank <> p_target_rank then
    raise exception using errcode = '22023', message = 'Idempotency key was already used for a different request';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found or v_product.owner_id <> v_owner then raise exception using errcode = '42501', message = 'Product not found or not owned by account'; end if;
  select subscription_status, email_verified_at, subscription_valid_until, grace_period_ends_at
  into v_sub, v_verified, v_valid_until, v_grace from public.user_accounts where id = v_owner for update;
  if v_verified is null then raise exception using errcode = '42501', message = 'Verify your account before bidding'; end if;
  if not public.subscription_is_eligible(v_sub, v_valid_until, v_grace) then raise exception using errcode = '42501', message = 'An eligible subscription is required to bid'; end if;
  if v_product.state <> 'approved' or not v_product.participates then raise exception using errcode = '42501', message = 'This listing is not eligible to bid'; end if;

  select * into v_rule from public.credit_rules where singleton;
  select * into v_bid from public.standing_bids where product_id = p_product_id for update;
  if found and v_bid.state = 'active' then v_old_amount := v_bid.amount; end if;
  if v_bid.state = 'withdrawn' and v_bid.last_withdrawn_at > v_now - v_rule.withdrawal_cooldown then
    raise exception using errcode = '22023', message = 'This listing is in its bid withdrawal cooldown';
  end if;
  if v_old_amount = 0 and p_amount < v_rule.min_initial_bid then raise exception using errcode = '22023', message = 'Bid is below the configured initial minimum'; end if;
  if p_amount = v_old_amount then raise exception using errcode = '22023', message = 'Your listing already has this standing bid'; end if;

  select coalesce(max(b.amount), 0) into v_top_bid
  from public.products p
  join public.standing_bids b on b.product_id = p.id and b.state = 'active'
  join public.user_accounts a on a.id = p.owner_id
  where p.id <> p_product_id and p.state = 'approved' and p.participates
    and a.email_verified_at is not null
    and public.subscription_is_eligible(a.subscription_status, a.subscription_valid_until, a.grace_period_ends_at);

  if p_target_rank = 1 then
    v_required_min := greatest(v_rule.min_initial_bid, v_top_bid + v_rule.min_increment);
  else
    v_required_min := greatest(v_rule.min_initial_bid, v_top_bid - ((p_target_rank - 1) * v_rule.min_increment));
  end if;
  if p_amount < v_required_min then
    raise exception using errcode = '22023',
      message = format('Bid at least %s credits for position #%s or higher', v_required_min, p_target_rank);
  end if;

  v_delta := p_amount - v_old_amount;
  select * into v_account from public.credit_accounts where owner_id = v_owner for update;
  if not found then raise exception using errcode = 'P0002', message = 'Credit account not found'; end if;
  if v_delta > v_account.available then raise exception using errcode = '22023', message = 'Insufficient available credits'; end if;
  update public.credit_accounts set available = available - v_delta, reserved = reserved + v_delta, updated_at = v_now where owner_id = v_owner;

  if v_delta <> 0 then
    insert into public.credit_ledger(owner_id, product_id, source_type, source_id, idempotency_key,
      credit_amount, available_delta, reserved_delta, reason, audit_metadata)
    values (v_owner, p_product_id, case when v_delta > 0 then 'bid_reserve' else 'bid_release' end,
      p_product_id::text, 'bid:' || p_idempotency_key::text, abs(v_delta), -v_delta, v_delta,
      case when v_delta > 0 then 'Standing bid reserved' else 'Standing bid reduced; excess reservation released' end,
      jsonb_build_object('previous_amount', v_old_amount, 'new_amount', p_amount, 'target_rank', p_target_rank));
  end if;

  insert into public.standing_bids(product_id, owner_id, amount, state, accepted_at, updated_at, withdrawn_at, last_withdrawn_at)
  values (p_product_id, v_owner, p_amount, 'active', v_now, v_now, null, v_bid.last_withdrawn_at)
  on conflict (product_id) do update set amount = excluded.amount, owner_id = excluded.owner_id, state = 'active',
    accepted_at = case when standing_bids.amount = excluded.amount and standing_bids.state = 'active'
      then standing_bids.accepted_at else excluded.accepted_at end,
    updated_at = excluded.updated_at, withdrawn_at = null;

  v_rank_changes := public.refresh_leaderboard('rank_changed');
  select jsonb_build_object(
    'product_id', p_product_id, 'accepted_bid', p_amount, 'target_rank', p_target_rank,
    'minimum_required_bid', v_required_min, 'available_credits', ca.available, 'reserved_credits', ca.reserved,
    'additional_reserved', greatest(v_delta, 0), 'released_credits', greatest(-v_delta, 0),
    'rank', lb.current_rank, 'minimum_initial_bid', v_rule.min_initial_bid,
    'minimum_increment', v_rule.min_increment, 'affected_rank_changes', v_rank_changes
  ) into v_result
  from public.credit_accounts ca join public.public_leaderboard lb on lb.id = p_product_id
  where ca.owner_id = v_owner;
  update public.bid_requests set result = v_result where owner_id = v_owner and idempotency_key = p_idempotency_key;
  insert into public.bid_events(product_id, previous_rank, new_rank, event_type)
  values (p_product_id, v_product.current_rank, (v_result->>'rank')::integer, 'bid_changed');
  return v_result;
end;
$function$;
revoke execute on function public.place_or_update_bid(uuid, integer, uuid, integer) from public, anon;
grant execute on function public.place_or_update_bid(uuid, integer, uuid, integer) to authenticated;
