# Architecture decisions

| Concern | Choice | Reason |
| --- | --- | --- |
| UI | React + TypeScript + Vite | Fast, responsive app shell with a small deployable client. |
| Hosting | Vercel project `saasatlas`, connected to `best-digital-offer/saasatlas` | Production builds from `main`; deployment access follows the team's Vercel Authentication protection. |
| Database | Supabase PostgreSQL project `saasatlas` | Row-level policies, transactions, and managed backups. |
| Identity | Supabase Auth | Email verification and managed sessions; the application login UI is not yet wired. |
| Bid mutation | PostgreSQL security-definer RPC | Authenticates with `auth.uid()`, locks the leaderboard, locks credit rows, validates rules, updates reservations, and refreshes ranks inside one database transaction. |
| Ledger | Append-only `credit_ledger` plus constrained cached wallet | Immutable history is the accounting source; cached available/reserved totals are reconciled against ledger deltas. |
| Live directory | 30-second visible-tab polling | Reliable refresh without assuming Realtime publication configuration. |
| Sourced catalog | Separate `catalog_products` table, RLS, admin review RPC, and service-role-only batch import | External directory entries have provenance; publication never grants founder ownership or bidding eligibility. |
| Payment | Disabled until a provider is selected/configured | No live provider or signed webhook is present; the UI must not imply checkout works. |

## Trust boundaries

- Browser code may request an amount but cannot set balance, plan, payment state, referral reward, or final rank.
- Product reads are exposed through a narrow public leaderboard view. Private owner, payment, ledger, and referral data remain in protected tables.
- Sourced products are separate from founder-owned `products`. `published_catalog_products` filters to approved catalog rows and feeds the public directory; `catalog_import_runs` and `catalog_import_items` retain batch history. No import or publication path writes to founder products, credits, bids, or ranks.
- `ingest_catalog_batch` is executable only by `service_role`, accepts at most 50 candidates, skips source IDs already processed in the same batch, preserves exact catalog/founder matches, and marks same-domain candidates for manual review. `review_catalog_product` requires an authenticated `user_accounts.is_admin` account and records the reviewer and decision.
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

The production Supabase project is `saasatlas` in `ap-south-1`. Its core schema and access-control migration are applied. The `public.public_leaderboard` view runs with `security_invoker`; a private filtered source view supplies the public rows without granting clients access to the underlying account and bid tables. `public.bid_requests` has owner-only read access and no client write grants. The public Supabase URL and publishable key are configured for Vercel production, preview, and development environments. Keep service-role and payment provider secrets only in server-side secret storage, never `VITE_*`.

The additive catalog migrations create the catalog, import history, guarded ingestion and moderation RPCs, and RLS policies. The initial ComparEdge import contains 300 verified candidates. At the owner's explicit direction, all 300 were published without individual review and carry `moderation_authority = 'owner_directed'`; the 22 same-domain candidates are included. Founder products, accounts, credits, bids, events, and bid requests remain unchanged. The importer uses the provider's CC BY 4.0 data with per-row attribution; it does not import ratings or numerical prices.
