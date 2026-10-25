-- Public activity stream for cumulative credit boosts.
-- Expose only public product/event data: no wallet balances, owner IDs, or referral information.
create or replace view public.public_leaderboard_activity as
select
  b.id,
  b.entry_type,
  b.amount,
  nullif(b.result->>'entry_name', '') as entry_name,
  nullif(b.result->>'rank', '')::integer as rank,
  b.created_at
from public.leaderboard_credit_bids b
where b.result is not null;

grant select on public.public_leaderboard_activity to anon, authenticated;
