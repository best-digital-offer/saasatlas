-- Restrict bid request history to its owner and use an invoker-safe public view.
alter table public.bid_requests enable row level security;

create policy bid_requests_owner_read
  on public.bid_requests for select to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on table public.bid_requests from anon, authenticated;
grant select on table public.bid_requests to authenticated;

-- The private source view exposes only the fields used by the public leaderboard.
-- It is not in Supabase's default exposed schemas; the public view uses invoker checks.
create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create or replace view private.public_leaderboard_source as
select p.id, p.slug, p.name, p.tagline, p.category, p.website_url, b.amount as standing_bid,
       case when b.amount is not null then row_number() over (order by b.amount desc nulls last, b.accepted_at asc nulls last, p.id asc)::integer end as current_rank,
       p.previous_rank, p.rank_changed_at, b.accepted_at
from public.products p
left join public.standing_bids b on b.product_id = p.id and b.state = 'active'
join public.user_accounts a on a.id = p.owner_id
where p.state = 'approved' and p.participates
  and a.email_verified_at is not null
  and public.subscription_is_eligible(a.subscription_status, a.subscription_valid_until, a.grace_period_ends_at);

revoke all on private.public_leaderboard_source from public, anon, authenticated;
grant select on private.public_leaderboard_source to anon, authenticated;

create or replace view public.public_leaderboard
with (security_invoker = true) as
select id, slug, name, tagline, category, website_url, standing_bid, current_rank,
       previous_rank, rank_changed_at, accepted_at
from private.public_leaderboard_source;

alter function public.reject_ledger_mutation() set search_path = public;
