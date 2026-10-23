# Project status

## Done

- Built the responsive SaaslistAtlas directory and founder workspace.
- Added category, search, sort, top-ten filters, product details, and ranking rules.
- Pushed the app to `best-digital-offer/saasatlas` on `main`. Vercel project `saasatlas` is connected and team deployment protection remains enabled.
- Created Supabase project `saasatlas` in `ap-south-1`. The founder-owned product and bidding schema remains intact.
- Added an isolated sourced catalog, source attribution and verification fields, RLS, run/item history, service-role-only bounded ingestion, duplicate checks, and admin-only moderation RPC.
- Imported 300 products from the ComparEdge CC BY 4.0 public feed after checking official URLs: AI 80, Marketing 50, Developer tools 45, Productivity 35, Design and content 30, Business and finance 25, Customer support and e-commerce 20, Security and infrastructure 15.
- Database outcome: 278 pending, 22 needs review because another listing shares their official domain, zero exact duplicates, zero failed inserts, zero approved/published.
- Configured the product and pricing URLs plus verification timestamps where verified. Provider attribution and source URLs are retained. Ratings, reviews, and numeric prices were not imported.

## In progress

- Sign-in and account flows in the UI.
- Founder submission, bid, wallet, history, and notification screens connected to database functions.
- Admin review interface and setup of a real administrator account. No account existed in Supabase at import time, so all sourced entries remain unpublished.
- Referral attribution/qualification/reward flows.
- Payment checkout, signature-verified webhook fulfillment, and refund/chargeback handling. No provider is configured, so checkout stays disabled.
- Catalog browse UI integration. The approved-only `published_catalog_products` view is ready; this task did not change the UI or leaderboard.

## Next

- Create or designate a real administrator account, then review pending and same-domain entries before publication.
- Connect the separate approved catalog view to a catalog browsing experience when requested.
- Add integration and concurrency tests with authenticated users and a disposable Supabase branch.

## Open questions

- Product type, publisher/company, individual features, and numeric prices were not reliably available in the accepted batch schema/source for all records. Unknown values remain unset.
- The initial public feed may change over time; future imports must re-run source verification and record a new batch hash.

## Decisions

- Sourced catalog rows use `catalog_products` and never receive founder ownership. They do not enter founder bidding, credit, rank, or leaderboard flows.
- Imports start as `pending`. Same-domain collisions remain distinct rows marked `needs_review`; exact source ID, URL, slug, or normalized-name matches are preserved and logged as duplicates.
- Source data is reused under ComparEdge's CC BY 4.0 terms with per-row attribution. Ratings and numerical prices are excluded.
- Service-role and payment secrets never use `VITE_*` variables.
- Standing-bid reservations remain held at every rank until the owner changes or withdraws the bid.
- Refunds and chargebacks require compensating ledger events; later bidding/rewards must be restricted rather than allowing a negative wallet.

## Verification

- Before import, products, accounts, credit accounts, ledger rows, bids, bid events, and bid requests all counted zero. These remain zero after import.
- Database confirms 300 catalog rows, 278 `pending`, 22 `needs_review`, and none approved. It confirms zero duplicate canonical URLs, normalized names, slugs, or source IDs.
- All three catalog tables have RLS. The ingestion RPC is executable by `service_role` only; public and authenticated execution are denied. The public catalog view returns approved rows only.
- A rollback-only database exercise verified rerun idempotency, exact-duplicate handling, and same-domain review routing; no test rows remain.
- Replaying all six production batches left the catalog at 300 rows. Six exact-duplicate keys, URL, slug, and normalized-name checks reported no duplicates.
- Eleven unit tests pass and the production build succeeds. Earlier browser tests passed before this backend-only change; no UI files were changed.
- Supabase advisors show no new RLS-without-policy findings for the catalog. Remaining catalog review RPC warning is expected because authenticated calls are checked against `user_accounts.is_admin` inside the function. Other advisor findings concern pre-existing tables and RPCs.
- The build emits two non-blocking `lucide-react` module-directive warnings from the existing icon dependency.
