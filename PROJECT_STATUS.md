# Project status

## Completed

- Built a polished, responsive SaaslistAtlas directory and founder workspace.
- Added category, search, sort, top-ten filters, product details, and ranking rules.
- Pushed the app to `best-digital-offer/saasatlas` on `main` (GitHub reports the repository is public).
- Created Vercel project `saasatlas`, connected its GitHub integration, and deployed the production build. Team deployment protection remains enabled.
- Created Supabase project `saasatlas` in `ap-south-1` under the selected organization.
- Applied the core schema and an access-control migration. The public leaderboard is a security-invoker view over a private filtered source view. `bid_requests` has RLS with owner-only reads; direct client writes are revoked.
- Configured the public Supabase URL and publishable key in Vercel production, preview, and development environments and in the local development environment.
- Verified the database schema, migration history, RLS/policy grants, leaderboard query, Supabase security advisories, and Vercel builds.
- Added unit tests for integer bid validation, overtaking increments, net reservations, and deterministic tie-breaking; 6 passed.
- Added browser tests for filters/details, founder navigation, and mobile overflow; 2 passed in local Chromium.

## Still to build

- Sign-in and account flows in the UI.
- Founder submission, bid, wallet, history, and notification screens connected to the database functions.
- Admin moderation and referral attribution/qualification/reward flows.
- Payment checkout, signature-verified webhook fulfillment, and refund/chargeback handling. No payment provider is configured, so checkout stays disabled.
- Database integration and concurrency tests with authenticated users; the public leaderboard currently has zero listings.

## Operating decisions

- Sample products and amounts remain clearly labeled as illustrative. The live database currently has no products.
- Standing-bid reservations remain held at every rank until the owner changes or withdraws that listing's bid.
- Referral rewards qualify only after verification and a successful paid subscription; the reward uses the referrer's plan at qualification.
- Refunds and chargebacks require compensating ledger events. If existing credits are reserved, later bidding/rewards must be restricted instead of allowing a negative wallet.
- Do not put service-role or payment secrets in `VITE_*` variables. Only the public URL and publishable key are configured on the frontend.

## Verification

- Local production build, unit tests, browser tests, and desktop/mobile visual review passed before remote setup.
- Supabase migrations applied successfully; the database smoke query reports 12 public tables, 11 public tables with RLS, and an empty leaderboard.
- The selected table `public.bid_requests` now has RLS enabled, owner-only read policy for authenticated users, no anonymous select, and no direct client write grants.
- Supabase security advisors no longer report disabled RLS or a public security-definer leaderboard view. Remaining warnings include intentionally restricted service tables without policies and authenticated access to the bid/listing RPC functions.
- Vercel’s production build completed successfully after connecting GitHub. Deployments retain the team's Vercel Authentication protection.
