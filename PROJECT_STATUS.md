# Project status

## Done

- Created a React + TypeScript app with a custom SaaslistAtlas design direction and responsive public leaderboard and founder workspace.
- Added working category/search/sort/top-ten filters, product details, rank rules explainer, and explicit demo-data labeling.
- Added Supabase leaderboard client with polling; live rows replace sample content only after a successful database response.
- Added a core PostgreSQL migration for profiles, eligible products, wallets, immutable ledger, standing bids, rank events, notifications, referrals, purchase/webhook records, RLS, listing limits, and transactional bid/withdraw functions.
- Added unit tests for integer bid validation, overtake increments, net reservation changes, and deterministic tie-break ordering; 6 passed.
- Added browser tests for public filters/detail dialogs, founder navigation, and mobile overflow; 2 passed in local Chromium.
- Added product brief, architecture notes, and local setup instructions.

## In progress

- No Supabase project could be created: the selected organization is at its two active free-project limit. No existing database was modified.
- No GitHub repository could be created yet: the connected GitHub integration can read repositories but has no create-repository action, and the in-app browser is currently signed out.
- Authenticated founder flows, product submission forms, admin moderation, referral qualification, signed payment webhook fulfillment, and payment checkout remain to be implemented and verified.

## Next

- Sign in to GitHub in the open in-app browser so a private SaaslistAtlas repository can be created and the local project pushed.
- Free up a Supabase free-project slot or enable a paid plan, then create `saaslistatlas` in the selected organization and apply the migration.
- Wire Supabase Auth, verified product submission, founder balances/bids/history, and service-side subscription/payment/referral processing.
- Link the repository to Vercel, configure public keys and server-only secrets, then deploy a preview.
- Run database integration/concurrency tests against a disposable project and verify RLS and migrations.

## Open questions

- The Supabase project limit must be resolved before a database-backed account can be tested.
- A live payment provider and merchant configuration are not present; checkout is deliberately disabled.
- Private repository creation needs GitHub browser authentication.

## Decisions

- Start fresh after the user selected that option; no unrelated repositories or databases were repurposed.
- Keep the new repository private by default.
- Keep all public sample products and amounts clearly labeled as illustrative.
- Keep package checkout, sign-in, and bidding unavailable until the real Supabase project and trusted payment setup exist.
- Active standing-bid reservations stay reserved at every rank until the owner changes or withdraws that listing's bid, consistent with the brief's top-ten reservation rule.
- Referral rewards qualify only after verification and a successful paid subscription; reward amount uses the referrer's plan at qualification. Proposed attribution window is 30 days.
- A refund/chargeback must use a compensating ledger event; if earned/purchased credits are already reserved, future bids/rewards must be restricted rather than making a wallet negative. The enforcement flow is not yet wired.

## Verification

- `npm run build`: passed on 2026-10-23.
- `npm test`: 6 passed on 2026-10-23.
- `npm run test:e2e`: 2 passed on 2026-10-23 using Playwright Chromium because the in-app browser blocked localhost.
- Desktop and mobile screenshots were compared against the image-generation concept; core nav, filters, details, ranking rules, and founder workspace were inspected.
- Database migration: not applied or PostgreSQL-validated because no new Supabase project could be provisioned.
- GitHub, Vercel, Supabase deployment/integration: not completed.
