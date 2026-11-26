# HostelPulse V2: from "what to fix" to "fixed for you"

Status: draft for approval. Builds on the shipped V1 (Next.js PWA in `web/`, Supabase, Claude chatbot).

## Intent and why

V1 tells a hostel manager where profit is leaking and what to do. Every PMS already has analytics; none tells you what to do. V2 closes the last gap: **where a fix can be done by software, the manager gets a button that does it** (with approval, limits and an undo), not a to-do item.

Our edge over revenue-management tools (Duetto, Pricepoint) and small-property PMSs (Little Hotelier) is that we know the hostel's **costs** as well as its rates. So pricing recommendations are cost-aware: a price floor from cost per bed plus a margin, and every OTA rate is shown as **what the hostel keeps** after commission and member discounts, not the headline price. Competitors' published pricing guidance (min/max rates, pace-based recommendations, rule overrides) is directional only; we treat it as inspiration, not a spec.

The pilot property is HI Chicago. Its public listings show why comparisons must be like for like: the same hostel appears at roughly $36 to $62 a night depending on the site and search, so any table must compare the same date, room type and occupancy.

## Goals

1. **Automate fixes.** Every recommendation that can be executed by software offers an "Apply" action: preview, approve, execute, log, undo.
2. **Pricing intelligence per night.** A nightly rate table across the hostel's OTAs and its competitors, with discounted and undiscounted prices and net-after-commission, where the manager can change a night's rate in place.
3. **Quietest nights.** Find the weakest nights from history and pace, explain plausible causes, suggest a better price.
4. **Win direct bookings.** An OTA-versus-direct what-if slider, and a direct-booking hub with three tiers (site/SEO content, getting ahead of OTAs in search, price comparison).
5. **Repeat-guest emails** with a choice of templates.
6. **Richer onboarding:** which OTAs the hostel uses, its website, its social links.
7. **A capacity sanity check** so impossible data is caught.
8. **Reports that show, not tell:** more graphs, less text.
9. **A more distinctive, easier-to-navigate UI** set in Inter (the typeface Anaplan's brand guidelines specify).

## Non-goals

- Live competitor or OTA prices from scraping. Not built, ever: it breaks OTA terms and is fragile.
- Real PMS write-back and live rate feeds in this version. Their APIs are not enabled yet; V2 uses **simulated rates** behind adapters, and says so on screen.
- Competitor benchmarking of costs (still out).
- Reading receipt/invoice images or PDFs.
- Fully hands-off "autopilot" pricing. Approval stays on by default.

## Anti-goals (failure even if it technically works)

- A manager believes a price was pushed to Booking.com when it was only simulated.
- An automation lowers a rate below cost, or changes prices more than the manager allowed.
- Guests are emailed without a valid reason or opt-out, or with masked OTA relay addresses.
- The AI states events, news or competitor prices it was not given, as fact.
- A "who is cheaper" table that compares unlike rooms or dates.

## Constraints (found in research and in the V1 code)

- No live competitor data source yet. Candidates, all requiring contracts: Booking.com Demand API (managed affiliate agreement), Hostelworld API (case by case), rate-shopping vendors (Lighthouse, RateGain, PriceLabs). Expedia not verified.
- Own-channel rates come from the PMS/channel manager once the Cloudbeds API is enabled. V1 already stores encrypted PMS credentials.
- Booking.com Genius: the host funds a 10 to 20% discount and commission applies to the discounted price. Commission rates in public sources come from vendor blogs, so they are editable per hostel, defaulting to 15%.
- OTA guest emails are often relay addresses and unusable for marketing.
- No OTA API exists for filing support tickets.
- V1 treats one reservation as one bed-stay, so "beds used on a night" is the count of overlapping bookings.
- Next.js 16 with Cache Components: every request-time page must opt into per-request rendering (a missed `connection()` once caused a redirect loop).
- Supabase tables need explicit grants and row-level security; the schema file must stay re-runnable.

## Approaches considered

**Rate data (decided by the user):**
1. Own channels only. Rejected: no competitor view.
2. Paid rate-shopping provider now. Rejected for now: needs contract and cost; untestable here.
3. **Hybrid behind adapters (chosen).** A `RateSource` interface with a simulated source (labelled "Simulated"), CSV/manual source, and slots for the PMS, a partner API or a vendor. The table, history and automations never change when a real source is added.

**Automation model (my call):**
1. Recommend only (V1). Rejected: the product goal.
2. Full autopilot. Rejected: wrong default for money decisions.
3. **Propose, approve, execute, log, undo, with guardrails (chosen).** Autopilot is a later per-automation opt-in once trust exists.

**Charts (my call):** a small in-house SVG chart set over a charting library. Less weight, one visual language, easier to make distinctive. The builder should use the `dataviz` skill.

## Decisions

### Phase 1: quick wins
- **Onboarding and property settings** add: OTAs used (Booking.com, Hostelworld, Expedia, Airbnb, Agoda, Trip.com, Hotels.com, other), website URL, social links (Instagram, Facebook, TikTok, YouTube, Google Business Profile). Editable later in More. URLs must be `https` and are validated; they are used later for SEO analysis. Stored on `properties` (`otas`, `website`, `socials`), with an idempotent schema migration.
- **Capacity check.** After any bookings import (and on the dashboard), compute the largest number of overlapping bookings on any night. If it exceeds declared beds, show a warning naming the date and the two numbers, with two actions: update the bed count to match, or review the file (likely duplicates or multi-bed reservations). Does not block the import.
- **Costs page:** move "Cost per bed" directly under the next steps.
- **Reports:** replace text-heavy blocks with charts and one-line captions: occupancy by weekday, revenue trend, leaks by category, cost lines over months, savings, review trend.
- **OTA what-if slider** (Profit page, under "Where your bookings come from"): drag the direct share from 0 to 100%; show monthly money kept versus today, using the hostel's commission rates and a payment-fee setting for direct. Pure logic, no external data.
- **UI refresh:** Inter; a signature **Night Strip** (a row of colored cells, one per night, showing occupancy or price) used on Home, Profit and the rate table; clearer navigation (five tabs plus an Actions inbox with a badge on Home, breadcrumbs and back on sub-pages). Built with the `frontend-design` skill.

### Phase 2: rates and the automation core
- **Action/automation framework.** A fix can carry an automation: kind (price update, email campaign, ticket draft, content draft), preview (what changes, before and after), approval, execution through an adapter, a run log, and undo where possible. Every run is recorded.
- **Guardrails** (per hostel, editable, defaults on): price floor = cost per bed plus a minimum margin; a ceiling; maximum change per night per day. A change outside them is blocked with the reason.
- **Rate model.** Snapshots of price per date, channel and room type, with optional discounted price and discount label, a source tag (`pms`, `manual`, `provider`, `simulated`) and capture time. Competitors are a user-defined comp set. A nightly job (Vercel cron, secret-protected) refreshes and keeps history.
- **Rate table (Tier 3 page).** Rows are nights, columns are the hostel's channels and the comp set. OTAs known for member discounts show two prices (undiscounted and discounted); every cell can show what the hostel keeps. Flags: direct priced above an OTA, far above or below the comp median, below the price floor. A visible "Simulated data" banner until a real source is connected. Editing a night's price creates a price-update action that goes through the guardrails and approval. In simulated mode it updates only the local rate store and says it was not pushed to the PMS.
- **Quietest nights.** From booking history, compute occupancy by date and weekday and next-30-night pace against the same weekday average. List the weakest nights. For each, Claude writes possible reasons (customer behavior, events, news, competitor rates) from supplied data only; each reason is labelled "possible", and anything about events or news must come from a retrieved source with a link, or be omitted. The suggested new price comes from code (clamped by the guardrails), not from the model. A one-tap action applies it.

### Phase 3: direct-booking hub and emails
- **Direct hub** (`/profit/direct`) with three sub-pages:
  1. **Site and Google SEO.** The server fetches the hostel's website (with SSRF protection: public hosts only, redirect, size and time limits) and scores it with deterministic checks (title, meta description, headings, structured data, booking link, image text, local keywords) plus Claude's rewrite suggestions. "Automate" means generating ready-to-paste copy now; publishing to a site builder comes with CMS integrations later.
  2. **Appear before OTAs.** My interpretation, to confirm: the manager chooses which OTAs to ask to stop bidding on the hostel's own name in search ads. The page drafts one request per chosen OTA, shows where to submit it, and tracks status (draft, submitted, answered). No auto-submission, since no API exists.
  3. **Price comparison.** The Phase 2 rate table.
- **Repeat-guest emails** (`/profit/emails`): choose a template (welcome back with a direct code, seasonal invitation, review request), preview, pick the audience (guests with a real email who stayed before), schedule. Only guests with usable addresses are included; OTA relay domains are excluded; a suppression list and an unsubscribe link are mandatory, and the sender's postal address is included. Sending uses an email provider (Resend, my call); with no key configured, emails go to a visible outbox log and are not sent.

## Calls made after review (mine; change any)

- **Data V1 already has:** bookings carry channel, nights, revenue and a guest key (email, else name); the property has a bed count; cost per bed exists. V1 has **no room type**. V2 adds an optional `room_type` label on bookings and rate rows, defaulting to "Dorm bed". There is no per-hostel room-type list; it is a free-form label.
- **Price units:** the rate table is **per bed per night**. The floor (cost per bed plus a minimum margin, default 20%) applies to bed rows only. Private-room rows are shown but get no automatic floor until per-room costs exist. The ceiling is a user-set absolute rate, defaulting to twice the current base rate.
- **Undo:** each run stores before and after values and a reversible flag. Undo restores the previous value through the same executor (local rate store now, PMS push later). Not available once the night has passed. Re-running an approved action is idempotent.
- **Simulated rates:** generated deterministically from a seed and the hostel's own base rate, including a fake member discount on Genius-style OTAs so both prices render. For real users the table starts with an explicit empty state and a "Load simulated example" button, so simulated data is never mistaken for real. The HI Chicago comp set (Wrigley Hostel, Freehand, Grand House 424) is only a labelled demo example.
- **Access:** one manager per property (V1's rule). The approver is the property owner. The nightly job uses a server-only Supabase service key inside one secret-protected cron route, with every query scoped to a property.
- **AI cost and events:** omitting events and news reasons is an acceptable V2 outcome. AI calls get a per-hostel daily cap.
- **Done means:** type-check, lint and tests pass; the production build is exercised in a browser; merged to `main` so Vercel deploys. Resend and cron environment setup are documented. Test data is synthetic.

## Open questions for the owner

1. Email sender and compliance (default proposed below).
2. Confirm the "Appear before OTAs" interpretation (brand-name ad bidding).

## What is left to the builder

Exact table columns and indexes; the chart set's visual design; the precise price-floor margin default; wording of templates and tickets; how the SEO scorer weighs checks; cron timing; whether to use Claude's web search for events (verify availability and cost first).

## Verification expectations

Pure logic (capacity check, slider maths, net-after-commission, guardrails, quietest-night ranking, SSRF filter, email audience filter) is unit tested with hand-computed cases. Pages are exercised in a browser against a production build. Anything simulated is labelled as such in the UI.
