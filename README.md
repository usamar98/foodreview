# Savour

A working private pilot for restaurant discovery with transparent review evidence.

## Included

- Search by restaurant, cuisine, dish, city, or neighborhood; filter by cuisine and price.
- Persisted bookmarks, taste preferences, and dining diary, attributed to the signed-in user (GitHub on Vercel, ChatGPT on Sites).
- Real restaurant submissions start without ratings and are unlisted until a visit is checked.
- Private receipt uploads to Supabase Storage on Vercel. Reviews start pending and are manually checked in the review desk.
- Exact receipt deduplication, one submission per diner/restaurant/day, and next-calendar-day feedback.
- Ratings use checked, non-incentivized, unconnected visits from the previous 180 days. Sample size and a 95% Wilson interval remain visible.
- Immutable review decisions through the app, with reviewer, reason, and timestamp recorded.
- Three explicitly fictional sample restaurants, with licensed illustrative Unsplash photographs.
- WebMCP search and save actions share the visible app state and persisted bookmarks.

## Run

Node 22.13+ is required. Use npm run install:ci, npm run db:generate, and npm run build. Apply each pending Drizzle migration locally with Wrangler using dist/server/wrangler.json and .wrangler/state, then run npm run dev. The development server prints its URL.

The portable starter has loopback-only mock ChatGPT sign-in. Hosted identity comes from Sites, and mock auth is excluded from production builds. DB and BUCKET are logical bindings in .openai/hosting.json. No external restaurant APIs, Google review imports, or payments are configured.

## Deploy to Vercel

This repository has two build targets. `npm run build` preserves the original Vinext/Cloudflare Sites deployment. Vercel uses the standard Next.js target, `npm run build:vercel`, declared in `vercel.json`; it generates `.next/routes-manifest.json`. Do not configure Vercel to use the original build command or `dist` output.

Import `usamar98/foodreview`, select branch `main`, keep the root directory at the repository root, and use Node.js 22.x. The repository sets the framework to **Next.js**, build command to **npm run build:vercel**, and output directory to the framework default (**.next**), clearing custom output overrides. Redeploy after pulling this configuration.

The UI builds without secrets, but live persistence and sign-in require the server-only variables in `.env.example`. Configure them for each Vercel environment you use, then redeploy:

Vercel receipt uploads are limited to 4 MB to leave room for form fields within its function payload limit. Sites retains its 5 MB receipt limit. Run `npm run check:vercel` for transport and session checks, or `node scripts/check-vercel.mjs --integration` after a Vercel build to exercise a temporary production server on loopback port 3007.

Run `npm run check:supabase` to exercise the actual schema in an isolated in-memory PostgreSQL engine. It checks table permissions, visibility, duplicate constraints, repeat moderation, score exclusions, saves and preferences without touching a live project. PGlite is a development dependency used only for this check.

1. Create a GitHub OAuth App. Set its homepage to your deployment origin and its authorization callback to `https://YOUR_DOMAIN/api/auth/github/callback`. Put its client ID and secret in `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`; set `AUTH_URL` to that origin. Generate `AUTH_SECRET` with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Use separate OAuth apps for local and production domains if necessary. Local Next development uses `npm run dev:vercel`.
2. Create a separate Supabase project named `foodreview`. In its **SQL Editor**, run [supabase/schema.sql](supabase/schema.sql) once. This creates the tables, server-only functions, indexes, and private `receipts` bucket (4 MB; JPG, PNG, PDF). Tables have RLS enabled and deny browser access; authorized Next.js routes use the server secret key. From **Connect**, copy the project URL to `SUPABASE_URL`. From **Settings → API Keys**, copy a secret key (`sb_secret_...`) to `SUPABASE_SECRET_KEY`. Set `SUPABASE_RECEIPTS_BUCKET=receipts`. Configure these in Vercel and redeploy. A legacy service-role JWT is also supported through `SUPABASE_SERVICE_ROLE_KEY`; a publishable/anon key is insufficient. No Cloudflare account or R2 billing setup is required for Vercel. The original Sites target retains its managed bindings. Existing Cloudflare rows and receipt files do not move automatically; use a separate reviewed data export/import if that backend has real contributions.
3. Set `SAVOUR_MODERATOR_IDS` to your numeric GitHub user ID prefixed with `github:` (find the `id` at `https://api.github.com/users/YOUR_USERNAME`). Separate multiple IDs with commas. Ordinary users can contribute visits and retrieve their own receipts; only allowlisted moderators can read the review queue, inspect other diners' receipts, and make decisions. An empty allowlist grants nobody moderation access.

Do not prefix secrets with `NEXT_PUBLIC_`. GitHub OAuth uses state validation, PKCE, an expiring signed HttpOnly session cookie, and verified GitHub email addresses. Incoming ChatGPT identity headers are ignored on Vercel. No external credentials are committed. Without backend configuration the UI shows the disclosed sample restaurants and a store connection error; it does not pretend to save data.

Reference: [Vercel build configuration](https://vercel.com/docs/project-configuration/vercel-json), [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Supabase server API keys](https://supabase.com/docs/guides/getting-started/api-keys), [private Supabase buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Sites access boundary

This initial deployment is owner-private. Its sole authenticated owner can operate the review desk and inspect receipts, including their own submissions. Sites access controls supply the authorization boundary. BEFORE sharing or publishing publicly, introduce and enforce a moderator allowlist on state, moderation, and receipt endpoints. Receipt checking verifies a claimed purchase; it is not an independent editorial audit.

## Validation

TypeScript and the production build passed. scripts/smoke-api.mjs exercises local sign-in, persisted bookmarks/preferences, restaurant submissions, file validation, delayed feedback, deduplication, private receipt retrieval, moderation, immutable decisions, and pending/rejected/incentivized score exclusion. It creates synthetic local test fixtures; never run it against production. Remove fixtures from the local database after a run. Browser checks covered search, WebMCP valid/invalid inputs, bookmark persistence, restaurant evidence, and a 390px mobile viewport.

## Before public launch

Add distinct reviewer permissions, independent reviewer operations, incentives abuse investigation, rate limiting, disputes/appeals, receipt retention and deletion controls, contributor privacy settings, and real venue coverage. Payment collection requires a separately configured provider. The product explicitly labels its current private pilot limits.
