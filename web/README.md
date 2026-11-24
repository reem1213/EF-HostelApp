# HostelPulse web app

Next.js + TypeScript + Tailwind, installable as a PWA. Lives beside the static
landing site in the repo root.

## Run

```bash
npm install
npm run dev          # http://localhost:3000 (demo data, no setup needed)
npm test             # audit rules + integration tests
npm run typecheck
npm run build
```

## Connect real data

Set these in `.env.local` (and in Vercel's project settings):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `CLOUDBEDS_PROXY_URL` | Server-side route that forwards to Cloudbeds |
| `CLOUDBEDS_PROPERTY_ID` | Cloudbeds property id |
| `CLOUDBEDS_PROXY_TOKEN` | Token for that proxy (server only, never `NEXT_PUBLIC_`) |

Run `supabase/schema.sql` in the Supabase SQL editor first.

## Architecture

- `src/lib/domain/` — pure business logic (audit rules, money). No I/O.
- `src/lib/integrations/` — PMS (Cloudbeds) and bank-feed connectors, demo data.
- `src/lib/data/` — repository that combines connectors + engine + saved actions.
- `src/lib/services.ts` — server-only wiring; picks real or demo sources.
- `src/app/actions.ts` — server action: mark a finding done (validated).
- `public/sw.js` + `src/app/manifest.ts` — PWA install and app-shell cache.

## Known gaps

- Sign-in UI is not built yet. Saving "mark as done" needs a signed-in Supabase user (RLS).
- Bank feeds are demo-only. The provider (Plaid, Teller, etc.) is not chosen.
- Cloudbeds endpoint parameters must be checked against the live API reference.
- Profit-health formula is a heuristic; tune it on real data.
