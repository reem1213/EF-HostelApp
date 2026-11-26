# HostelPulse web app

Next.js + TypeScript + Tailwind, installable as a PWA. Backend: Supabase.
The product answers "what should I do about it?", not just "what are my numbers?".
Every page ends in ranked fixes with concrete steps.

## Pages

| Page | What it does |
| --- | --- |
| Home | Ask HostelPulse (Claude chatbot on your data), your quietest coming nights with a suggested price, the recommended next step, cost per bed, biggest leak |
| Costs | A: monthly costs form, bank summary upload, charge review. B: cost per bed by line (employees, laundry, utilities, rent, breakfast) |
| Profit | Bookings, occupancy, retention, channel mix, an OTA-versus-direct slider, and links to the direct-booking hub and past-guest emails |
| Direct bookings (`/profit/direct`) | Three steps: Website and Google (reads your site, scores it, writes copy), Appear before booking sites (drafts requests asking them to stop bidding on your name), Price comparison (14 nights across your channels and competitors, with "you keep" after commission and in-place price changes) |
| Win back past guests (`/profit/emails`) | Template, preview, audience count, then approval; every email carries your postal address and an unsubscribe link |
| Actions (`/actions`) | Everything the app can do for you waits here for approval first, with a log and undo where possible |
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

### Added in version 2

Re-run `supabase/schema.sql` in the SQL editor (it is safe to run again). It adds team access, rates, competitors, the action log, booking-site requests and email tables.
Then add these variables in Vercel and redeploy:

| Variable | What it turns on |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | The nightly rate job and the public unsubscribe page. Server only: it bypasses row-level security, so never expose it. |
| `CRON_SECRET` | Protects `/api/cron/rates` (at least 16 characters). Vercel Cron sends it as a bearer token; `vercel.json` runs the job daily. |
| `NEXT_PUBLIC_SITE_URL` | Unsubscribe links in emails. |
| `UNSUBSCRIBE_SECRET` | Signs unsubscribe links (at least 16 characters). Without it emails cannot be prepared. |
| `RESEND_API_KEY` and `EMAIL_FROM` | Really send emails (the From address must be on a domain verified in Resend). Without both, approved campaigns go to a visible outbox and nothing is sent. |

Team access: a property has seats by plan, 1 on `free` and 3 on `team`. Billing is not built yet, so the plan is a flag: set `properties.plan` to `team` in the Supabase table editor to give a hostel three seats. The owner invites people by email from More; an invite is accepted when that address signs in.

**What is simulated.** Competitor and booking-site prices are generated examples until a real rate source exists (your PMS once its API is enabled, or a partner or rate-shopping provider). They are labelled "Simulated" everywhere. An approved price change is saved inside HostelPulse only; nothing is pushed to your PMS or to booking sites. Booking-site requests are written for you to send by hand because those sites have no API for it. Prices are never scraped from booking sites.

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
- `src/app/api/chat/` streaming chatbot route. `src/app/api/cron/rates/` the nightly rate refresh.
- `src/lib/automation/` propose, approve, run, log and undo changes, with price limits (`guardrails`); `src/lib/rates/` rate sources (simulated now), table view and nightly refresh.
- `src/lib/seo/` safe website fetching (public https hosts only) and the site score; `src/lib/email/` templates, signed unsubscribe links and sending; `src/lib/ai/` prompts with daily caps.
- `src/proxy.ts` session refresh and redirect (pages and actions also check the session themselves).

## Security notes

- Row-level security on every table, scoped to the property's members (owner and up to two teammates on the team plan). The plan column cannot be changed from the app.
- Price changes are bounded: never below cost per bed plus your margin, never above your ceiling, never more than your daily limit, and only after approval.
- Website checks refuse anything but public https addresses and connect to the address they already checked.
- Emails go only to real guest addresses (booking-site forwarding addresses and people who unsubscribed are excluded) and always carry a postal address and unsubscribe link.
- PMS credentials: encrypted on the server, bound to property + provider, never returned to the browser (only a `••••1234` preview).
- The chatbot only receives an aggregate summary: no guest emails, no individual transactions, no credentials. Rate limited per user.
- Uploads: 5 MB / 20,000 row limit, CSV only, identical re-uploads rejected, bad rows reported by line number.

## Known gaps

- Live PMS sync is not switched on. Credentials are saved and validated; the connectors (`cloudbeds.ts`) still need their endpoint parameters checked against each provider's API reference.
- Bank / card API (e.g. Plaid) not built; MVP is the CSV upload. Receipt and invoice photos/PDFs (AI extraction) are next.
- Cancellations and refunds, competitor benchmarking, and the Google Business Profile connection are intentionally later. Peer figures in `defaultBenchmark` (`src/lib/data/store.ts`) are placeholder industry assumptions.
- The profit-health score and the dollar estimates for retention and occupancy are heuristics with documented factors (`next-steps.ts`); tune them on real data.
- AI daily caps (price reasons, website copy) and the chatbot rate limit are in-memory, so per server instance. Replace with a shared store when scaling out.
- Price reasons do not use events or news: nothing in the app can source them yet, so they are left out rather than guessed.
- Website checks (`pinnedFetch`) and live email sending were verified only with injected fakes in tests; try them once on the deployed site.
- Legacy note on the chatbot's rate limit: in-memory, fine for one server, replace with a shared store when scaling out.
- Supabase code paths are written against the schema but have not been run against a live project.
