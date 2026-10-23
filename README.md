# SaaslistAtlas

SaaslistAtlas is a SaaS and AI product directory with a credit-backed standing-bid leaderboard. The current workspace contains the responsive UI, a Supabase integration seam, and a PostgreSQL migration. It is not yet connected to a live database, repository, or deployment.

## Run locally

```bash
npm install
npm run dev
```

The directory uses clearly labeled illustrative sample data when no Supabase project is configured. If a configured database cannot be reached, the application shows an unavailable state instead of passing sample bids off as real.

## Configure Supabase

1. Create a fresh Supabase project and apply `supabase/migrations/202610230001_core.sql`.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the project's API settings.
4. Restart the Vite server.

Do not place a service-role key or payment secret in a `VITE_*` variable. Checkout remains disabled until a payment provider, raw-body signature verification, event idempotency, and fulfillment handler are implemented and verified.

## Commands

- `npm run dev` — local development server
- `npm run build` — TypeScript and production build
- `npm test` — business-rule unit tests
- `npm run test:e2e` — browser tests for directory filters, product details, founder navigation, and mobile overflow

See [ARCHITECTURE.md](./ARCHITECTURE.md), [PRD.md](./PRD.md), and [PROJECT_STATUS.md](./PROJECT_STATUS.md) for rules and setup blockers.
