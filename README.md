# SaaslistAtlas

SaaslistAtlas is a SaaS and AI product directory with a credit-backed standing-bid leaderboard. Its public directory is connected to Supabase, and the repository is connected to a Vercel deployment. The Vercel project currently uses the team’s default deployment protection.

## Run locally

```bash
npm install
npm run dev
```

The directory uses clearly labeled illustrative sample data when no Supabase project is configured. Founder-owned products and the credit-backed leaderboard remain empty until founders submit eligible products. Sourced directory records live separately in `catalog_products`; the public directory reads approved entries from `published_catalog_products`, while the credit-backed leaderboard remains founder-only. If a configured database cannot be reached, the application shows an unavailable state instead of passing sample bids off as real.

## Configure Supabase

1. The deployed project uses Supabase project `saasatlas` in `ap-south-1`.
2. The core schema and access-control migrations are in `supabase/migrations/`.
3. For local development, copy `.env.example` to `.env.development.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the project's API settings.
4. Restart the Vite server after changing environment variables.

Do not place a service-role key or payment secret in a `VITE_*` variable. Checkout remains disabled until a payment provider, raw-body signature verification, event idempotency, and fulfillment handler are implemented and verified.

## Catalog imports

The import path never inserts sourced records into founder-owned `products`. It uses the separate `catalog_products` table, so catalog publication cannot create an account, change a founder's listing, or make a product eligible to bid. Imported records start as `pending`; same-domain candidates are retained as `needs_review`. Individual review uses the admin-gated `review_catalog_product` RPC. An owner-directed publication is separately marked in `moderation_authority` and does not claim an individual moderator reviewed the entry. Approved catalog entries appear in the public directory, not the bidding leaderboard.

The initial import used ComparEdge's public `llms-tools.json` feed. The provider publishes this data under CC BY 4.0; attribution is stored with each row as “Data from ComparEdge (CC BY 4.0)” and its source URL. Ratings, review content, popularity figures, and numerical prices are not imported. Official homepages and available pricing URLs are checked directly over HTTPS before a row is eligible for the import. Site checks that return an error or block the request are excluded rather than bypassed.

To prepare and verify a future batch:

```bash
npm run catalog:prepare
npm run catalog:verify
```

To write the verified manifest, configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in a trusted server-side environment, then run:

```bash
npm run catalog:import
```

The importer sends batches of at most 50 through `ingest_catalog_batch`, protected for the service role. It records run and per-product outcomes, skips previously processed rows when resuming, preserves exact matches, and sends domain-only matches to moderation instead of merging them. It never deletes or updates founder products. The service-role key must not be stored in a `VITE_*` variable or committed.

The manifest in `data/catalog-import-2026-10-23.json` records the source, attribution, checked product URLs and timestamps, selected candidates, and candidates excluded during verification. Pricing URLs were verified when available; numerical prices were intentionally left out.

## Commands

- `npm run dev` — local development server
- `npm run build` — TypeScript and production build
- `npm test` — business-rule unit tests
- `npm run test:e2e` — browser tests for directory filters, product details, founder navigation, and mobile overflow
- `npm run catalog:prepare` — build a category-balanced source candidate manifest
- `npm run catalog:verify` — verify product and pricing URLs and select only verified entries
- `npm run catalog:import` — import a verified manifest in idempotent batches

See [ARCHITECTURE.md](./ARCHITECTURE.md), [PRD.md](./PRD.md), and [PROJECT_STATUS.md](./PROJECT_STATUS.md) for rules and setup blockers.
