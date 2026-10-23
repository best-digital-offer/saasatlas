-- Expose the optional founder-uploaded logo to the public leaderboard without changing its eligibility rules.
begin;

create or replace view private.public_leaderboard_source as
select p.id, p.slug, p.name, p.tagline, p.category, p.website_url,
       b.amount as standing_bid,
       case when b.amount is not null then row_number() over (order by b.amount desc nulls last, b.accepted_at, p.id)::integer else null::integer end as current_rank,
       p.previous_rank, p.rank_changed_at, b.accepted_at, p.logo_url
from public.products p
left join public.standing_bids b on b.product_id = p.id and b.state = 'active'::public.bid_state
join public.user_accounts a on a.id = p.owner_id
where p.state = 'approved'::public.product_state and p.participates and a.email_verified_at is not null
  and public.subscription_is_eligible(a.subscription_status, a.subscription_valid_until, a.grace_period_ends_at);

create or replace view public.public_leaderboard as
select id, slug, name, tagline, category, website_url, standing_bid, current_rank,
       previous_rank, rank_changed_at, accepted_at, logo_url
from private.public_leaderboard_source;

commit;
