# SaaslistAtlas — product brief

## Product

SaaslistAtlas is a discovery directory for global SaaS and AI products. Founders can submit eligible listings and compete for ranking with credit-backed standing bids. A bid reserves credits while active; it does not permanently consume the bid amount.

## Primary users and job

- **Product explorer:** find useful software by category, search, and compare current directory positions.
- **Founder:** manage product listings, credit balance, standing bids, referrals, and rank history.
- **Moderator/admin:** review submissions and suspicious referrals, reconcile balances, and maintain configurable rules.

## MVP slice

1. Public searchable and filterable directory, ranked from authoritative database state.
2. Verified founder account and eligible subscription.
3. Product submission with server-enforced plan limits and moderation review.
4. Immutable integer-credit ledger and atomic standing-bid reserve, update, and withdrawal.
5. Founder workspace showing accurate available/reserved credits, listing rank, and history.
6. Payment and referral plumbing only after real provider verification and idempotent fulfillment are implemented.

## Acceptance criteria

- A product without a bid never receives a rank above a valid bidder.
- Rank order is bid amount descending, accepted-at time ascending for equal amounts, then stable product ID.
- A higher bid reserves only its net increase; a lower bid releases only the excess after the database commit.
- Credits remain reserved for active standing bids even outside the visible top ten.
- The rank guide shows suggested top-ten starting bids from 1,770 credits at rank 1 down by 180 credits per position to 150 at rank 10. These are planning guidance only; confirmed rank always follows accepted eligible bids and the configured minimum increment.
- A withdraw operation releases that listing's reservation atomically and is subject to a configurable cooldown.
- All bid decisions are revalidated by PostgreSQL under a serialized transaction; client state is never authoritative.
- Account plan, email verification, listing eligibility, and moderation status are checked server-side.
- Public screens never expose founder identifiers, account balances, payments, or referral details.
- Sample UI content is explicitly marked as illustrative and is never presented as real activity.
- Credit checkout stays unavailable until a real provider, signed webhook verification, transaction records, and fulfillment are configured and verified.

## Success measures

- Directory search-to-product-detail click-through rate.
- Percentage of founder signups that complete verification and submit a listing.
- Percentage of submitted listings approved by moderation.
- Bid completion rate and stale-bid retry rate.
- Reconciliation mismatch count (target: zero).
- Payment webhook duplicate-fulfillment count (target: zero).

## Risks and launch assumptions

- Payment provider and merchant-country eligibility have not been confirmed; credit packages are not purchasable.
- Supabase project provisioning is blocked by the connected organization's free-project limit.
- GitHub repository creation is waiting on browser sign-in because the connected GitHub API lacks a repository-create operation.
- Subscription lifecycle updates require a real provider integration; schema functions include a trusted expiry-release hook but it is not wired to webhooks.
- Public ranking bids are illustrative only until a database and verified founder accounts exist.
