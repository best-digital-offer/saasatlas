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
        'standing_bid', b.amount, 'bid_state', b.state,
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

commit;
