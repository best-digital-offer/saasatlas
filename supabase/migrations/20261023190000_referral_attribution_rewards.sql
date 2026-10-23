-- Referral attribution and paid-subscription rewards.
-- Rewards are granted only after the referred founder's subscription becomes active,
-- and every reward is protected by a unique ledger idempotency key.
begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_referral_code text := lower(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
begin
  insert into public.user_accounts(id, display_name, email_verified_at)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)), 80),
    new.email_confirmed_at
  );
  insert into public.credit_accounts(owner_id) values (new.id);

  if v_referral_code <> '' then
    insert into public.referrals(referrer_id, referred_user_id, attribution_code, state, attribution_at)
    select a.id, new.id, a.referral_code, 'pending', now()
    from public.user_accounts a
    where lower(a.referral_code) = v_referral_code
      and a.id <> new.id
    limit 1
    on conflict (referred_user_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.reward_referrer_after_paid_subscription()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_referral public.referrals%rowtype;
  v_referrer_plan public.plan_tier;
  v_reward integer;
  v_ledger_id uuid;
  v_rules public.credit_rules%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  -- Only a paid, active subscription qualifies; trialing and pending accounts do not.
  if new.subscription_status <> 'active'
     or new.email_verified_at is null
     or (new.subscription_valid_until is not null and new.subscription_valid_until <= v_now) then
    return new;
  end if;

  -- Process only a referral that has not already been rewarded.
  select * into v_referral
  from public.referrals
  where referred_user_id = new.id and state = 'pending'
  for update;

  if not found then
    return new;
  end if;

  select * into v_rules from public.credit_rules where singleton;
  select plan into v_referrer_plan
  from public.user_accounts
  where id = v_referral.referrer_id
  for update;

  if not found then
    update public.referrals
      set state = 'rejected', reviewed_at = v_now, review_reason = 'Referrer account no longer exists'
      where id = v_referral.id;
    return new;
  end if;

  v_reward := coalesce((v_rules.referral_rewards ->> v_referrer_plan::text)::integer, 0);

  if v_reward <= 0 then
    update public.referrals
      set state = 'qualified', qualified_at = v_now, reviewed_at = v_now,
          review_reason = 'Paid subscription qualified; no reward configured for referrer plan'
      where id = v_referral.id;
    return new;
  end if;

  -- Insert the idempotency record first. Only credit the wallet when this transaction
  -- actually created the ledger row; otherwise a retried event could mint credits.
  insert into public.credit_ledger(
    owner_id, referral_id, source_type, source_id, idempotency_key,
    credit_amount, available_delta, reserved_delta, reason, audit_metadata
  ) values (
    v_referral.referrer_id, v_referral.id, 'referral', v_referral.id::text,
    'referral-reward:' || v_referral.id::text, v_reward, v_reward, 0,
    'Referral reward after paid subscription',
    jsonb_build_object('referred_user_id', new.id, 'referrer_plan', v_referrer_plan::text)
  )
  on conflict (owner_id, idempotency_key) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is not null then
    update public.credit_accounts
      set available = available + v_reward,
          earned_total = earned_total + v_reward,
          updated_at = v_now
      where owner_id = v_referral.referrer_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'Referrer credit account is missing';
    end if;
  end if;

  update public.referrals
    set state = 'rewarded',
        qualified_at = v_now,
        reward_credits = v_reward,
        qualifying_subscription_id = 'subscription:' || new.id::text || ':' || coalesce(new.subscription_valid_until::text, 'no-expiry'),
        reviewed_at = v_now,
        review_reason = 'Paid subscription confirmed'
    where id = v_referral.id;

  return new;
end;
$$;

drop trigger if exists user_account_paid_referral_reward on public.user_accounts;
create trigger user_account_paid_referral_reward
after update of subscription_status, subscription_valid_until, email_verified_at
on public.user_accounts
for each row
when (new.subscription_status = 'active' and new.email_verified_at is not null)
execute function public.reward_referrer_after_paid_subscription();

revoke all on function public.reward_referrer_after_paid_subscription() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;
