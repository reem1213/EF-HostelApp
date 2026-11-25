# HostelPulse web app

Next.js + TypeScript + Tailwind, installable as a PWA. Backend: Supabase.
The product answers "what should I do about it?", not just "what are my numbers?".
Every page ends in ranked fixes with concrete steps.

## Pages

| Page | What it does |
| --- | --- |
| Home | Ask HostelPulse (Claude chatbot on your data), the recommended next step, cost per bed, biggest leak |
| Costs | A: monthly costs form, bank summary upload, charge review. B: cost per bed by line (employees, laundry, utilities, rent, breakfast) |
| Profit | Bookings, occupancy, retention, channel mix; retention-discount and direct-booking / SEO plans |
| Reports | A: leaks found. B: bookings vs last period. C: costs cut. D: Google reviews and visibility |
| More | Plan, property, links to Connections, password, sign out |
| Connections | Connect Cloudbeds / Hostaway / Little Hotelier (credentials stored encrypted) and import files (bookings, bank summary, utility bills, employee schedule, invoice log) |

Forms and uploads feed `src/lib/domain/*` (pure functions), which feed the pages and reports.

## Run

```bash
npm install
npm run dev          # demo mode: sample hostel, no setup needed
npm test             # unit tests
npm run typecheck
npm run build
```

## Turn on real accounts and data

1. In Supabase, run `supabase/schema.sql` in the SQL editor.
2. In Supabase > Authentication > URL Configuration, set the Site URL to your deployed address and add `<site>/auth/callback` to Redirect URLs.
3. Set the variables in `.env.example` (locally in `.env.local`, in production in Vercel):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `CREDENTIALS_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`.

Without Supabase the app runs in demo mode (in-memory sample data, no login).
Without `CREDENTIALS_ENCRYPTION_KEY` PMS credentials cannot be saved.
Without `ANTHROPIC_API_KEY` the chatbot says it is not switched on.

## Architecture

- `src/lib/domain/` pure business logic: audit rules, cost per bed, profit metrics, fixes engine, CSV parsers. No I/O. Fully unit tested.
- `src/lib/data/` the `Store` interface with an in-memory (demo/tests) and a Supabase implementation.
- `src/lib/dashboard.ts` assembles stored data into what every page shows.
- `src/lib/import-service.ts` parse, de-duplicate by file hash, save, log.
- `src/lib/integrations/` PMS provider definitions + validation, Cloudbeds connector.
- `src/lib/security/credentials.ts` AES-256-GCM encryption of PMS credentials.
- `src/app/actions/` server actions (every one re-checks the session and validates input).
- `src/app/api/chat/` streaming chatbot route.
- `src/proxy.ts` session refresh and redirect (pages and actions also check the session themselves).

## Security notes

- Row-level security on every table, scoped to the property owner.
- PMS credentials: encrypted on the server, bound to property + provider, never returned to the browser (only a `••••1234` preview).
- The chatbot only receives an aggregate summary: no guest emails, no individual transactions, no credentials. Rate limited per user.
- Uploads: 5 MB / 20,000 row limit, CSV only, identical re-uploads rejected, bad rows reported by line number.

## Known gaps

- Live PMS sync is not switched on. Credentials are saved and validated; the connectors (`cloudbeds.ts`) still need their endpoint parameters checked against each provider's API reference.
- Bank / card API (e.g. Plaid) not built; MVP is the CSV upload. Receipt and invoice photos/PDFs (AI extraction) are next.
- Cancellations and refunds, competitor benchmarking, and the Google Business Profile connection are intentionally later. Peer figures in `defaultBenchmark` (`src/lib/data/store.ts`) are placeholder industry assumptions.
- The profit-health score and the dollar estimates for retention and occupancy are heuristics with documented factors (`next-steps.ts`); tune them on real data.
- The chatbot's rate limit is in-memory, fine for one server, replace with a shared store when scaling out.
- Supabase code paths are written against the schema but have not been run against a live project.
