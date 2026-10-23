# Architecture decisions

| Concern | Choice | Reason |
| --- | --- | --- |
| UI | React + TypeScript + Vite | Fast, responsive app shell with a small deployable client. |
| Hosting | Vercel, connected to the private GitHub repository | Preview and production builds from version-controlled source. Not yet connected. |
| Database | Supabase PostgreSQL | Row-level policies, transactions, auth integration, and managed backups. Project creation is currently blocked by the free-project cap. |
| Identity | Supabase Auth | Email verification and managed sessions; application login is not yet wired because no project exists. |
| Bid mutation | PostgreSQL security-definer RPC | Authenticates with `auth.uid()`, locks the leaderboard, locks credit rows, validates rules, updates reservations, and refreshes ranks inside one database transaction. |
| Ledger | Append-only `credit_ledger` plus constrained cached wallet | Immutable history is the accounting source; cached available/reserved totals are reconciled against ledger deltas. |
| Live directory | 30-second visible-tab polling | Reliable refresh without assuming Realtime publication configuration. |
| Payment | Disabled until a provider is selected/configured | No live provider or signed webhook is present; the UI must not imply checkout works. |

## Trust boundaries

- Browser code may request an amount but cannot set balance, plan, payment state, referral reward, or final rank.
- Product reads are exposed through a narrow public leaderboard view. Private owner, payment, ledger, and referral data remain in protected tables.
- Table writes are not granted to anon/authenticated roles for credit accounts, bids, ledger, referrals, purchases, or account privileges.
- Bid and listing RPCs use the authenticated Supabase user and re-check ownership/entitlement server-side.
- Payment and subscription transitions must be invoked only by a verified provider webhook/worker using the service role key. The service key must never enter Vite/browser code.
- Product website metadata fetching is not implemented. Future URL fetchers must enforce DNS/IP, redirect, timeout, and content-size limits.

## Transaction and standing-bid policy

The migration serializes bid updates with a transaction-scoped advisory lock. It then locks the target product and founder wallet, computes the net reserve delta, appends a ledger movement, upserts one active standing bid, recalculates rank projections, and creates rank-change and notification rows before commit. A retry with the same bid idempotency key returns the committed result. Competing listings retain their own active standing bids and reservations even when they fall below the top ten; rank alone never releases a reservation.

When a subscription expires beyond its grace period, product records remain. A trusted billing worker can call `release_ineligible_standing_bids` to withdraw the founder's active bids, append compensating ledger movements, release reservations, and recalculate ranks atomically.

## Configuration

`credit_rules` holds minimum initial bid (5), minimum increment (5), 24-hour withdrawal cooldown, 7-day subscription grace period, 30-day referral attribution, plan prices/listing limits, referral rewards (Starter 5 / Growth 50 / Business 100), and package quantities/prices in integer minor units. The plan catalog is Starter $5/month and 1 listing, Growth $25/month and 5 listings, Business $50/month and unlimited listings. These initial values came from the supplied product brief and should be reviewed before launch.

## Deployment and setup

Copy `.env.example` to `.env.local`, then set only the Supabase project URL and publishable/anon key. Apply the migration to a new project before enabling those keys. Keep service-role and payment provider secrets only in server-side secret storage, never `VITE_*`. Connect Vercel to the GitHub repository after the repo is created. No production deployment has been created or verified.
