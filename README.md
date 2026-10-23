# SaaslistAtlas

SaaslistAtlas is a SaaS and AI product directory with a credit-backed standing-bid leaderboard. Its public directory is connected to Supabase, and the repository is connected to a Vercel deployment. The Vercel project currently uses the team’s default deployment protection.

## Run locally

```bash
npm install
npm run dev
```

The directory uses clearly labeled illustrative sample data when no Supabase project is configured. The production database is currently empty, so its leaderboard starts with no listings. If a configured database cannot be reached, the application shows an unavailable state instead of passing sample bids off as real.

## Configure Supabase

1. The deployed project uses Supabase project `saasatlas` in `ap-south-1`.
2. The core schema and access-control migrations are in `supabase/migrations/`.
3. For local development, copy `.env.example` to `.env.development.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the project's API settings.
4. Restart the Vite server after changing environment variables.

Do not place a service-role key or payment secret in a `VITE_*` variable. Checkout remains disabled until a payment provider, raw-body signature verification, event idempotency, and fulfillment handler are implemented and verified.

## Commands

- `npm run dev` — local development server
- `npm run build` — TypeScript and production build
- `npm test` — business-rule unit tests
- `npm run test:e2e` — browser tests for directory filters, product details, founder navigation, and mobile overflow

See [ARCHITECTURE.md](./ARCHITECTURE.md), [PRD.md](./PRD.md), and [PROJECT_STATUS.md](./PROJECT_STATUS.md) for rules and setup blockers.
