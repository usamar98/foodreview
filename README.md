# Savour

A working private pilot for restaurant discovery with transparent review evidence.

## Included

- Search by restaurant, cuisine, dish, city, or neighborhood; filter by cuisine and price.
- Persisted bookmarks, taste preferences, and dining diary, attributed to the signed-in ChatGPT user.
- Real restaurant submissions start without ratings and are unlisted until a visit is checked.
- Private receipt uploads to R2. Reviews start pending and are manually checked in the review desk.
- Exact receipt deduplication, one submission per diner/restaurant/day, and next-calendar-day feedback.
- Ratings use checked, non-incentivized, unconnected visits from the previous 180 days. Sample size and a 95% Wilson interval remain visible.
- Immutable review decisions through the app, with reviewer, reason, and timestamp recorded.
- Three explicitly fictional sample restaurants, with licensed illustrative Unsplash photographs.
- WebMCP search and save actions share the visible app state and persisted bookmarks.

## Run

Node 22.13+ is required. Use npm run install:ci, npm run db:generate, and npm run build. Apply each pending Drizzle migration locally with Wrangler using dist/server/wrangler.json and .wrangler/state, then run npm run dev. The development server prints its URL.

The portable starter has loopback-only mock ChatGPT sign-in. Hosted identity comes from Sites, and mock auth is excluded from production builds. DB and BUCKET are logical bindings in .openai/hosting.json. No external restaurant APIs, Google review imports, or payments are configured.

## Access boundary

This initial deployment is owner-private. Its sole authenticated owner can operate the review desk and inspect receipts, including their own submissions. Sites access controls supply the authorization boundary. BEFORE sharing or publishing publicly, introduce and enforce a moderator allowlist on state, moderation, and receipt endpoints. Receipt checking verifies a claimed purchase; it is not an independent editorial audit.

## Validation

TypeScript and the production build passed. scripts/smoke-api.mjs exercises local sign-in, persisted bookmarks/preferences, restaurant submissions, file validation, delayed feedback, deduplication, private receipt retrieval, moderation, immutable decisions, and pending/rejected/incentivized score exclusion. It creates synthetic local test fixtures; never run it against production. Remove fixtures from the local database after a run. Browser checks covered search, WebMCP valid/invalid inputs, bookmark persistence, restaurant evidence, and a 390px mobile viewport.

## Before public launch

Add distinct reviewer permissions, independent reviewer operations, incentives abuse investigation, rate limiting, disputes/appeals, receipt retention and deletion controls, contributor privacy settings, and real venue coverage. Payment collection requires a separately configured provider. The product explicitly labels its current private pilot limits.
