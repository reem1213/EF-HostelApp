# HostelPulse V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn HostelPulse from "what to fix" into "fixed for you": team access, richer onboarding, a per-night rate table with simulated rates, approval-first automations with guardrails, quietest-nights analytics, a direct-booking hub (SEO, OTA tickets, repeat-guest emails), chart-led reports, and a distinctive Inter-based UI.

**Architecture:** Pure domain logic in `web/src/lib/domain/` (unit tested), a `Store` interface (memory + Supabase) for persistence, an automation runner (propose → approve → execute → log → undo) that all fixes share, and rate/email/AI sources behind adapters so simulated data can be swapped for real APIs without touching UI.

**Tech Stack:** Next.js 16 (Cache Components), TypeScript, Tailwind 4, Supabase, Vitest, zod, Anthropic SDK, Resend (email), cheerio (HTML parsing).

**Spec:** `docs/superpowers/specs/2026-11-26-hostelpulse-v2-design.md` (read it first; this plan decides what it leaves open).

## Global Constraints

- Font is **Inter** (Anaplan's brand guideline names Inter and Arial). Keep the cream/teal/gold palette; signature element is the **Night Strip**.
- Anything simulated is labelled **"Simulated"** on screen. Never present simulated data or a local-only change as pushed to a PMS or OTA.
- No scraping of OTAs. Rate sources are adapters: `simulated`, `manual` (CSV), later `pms`/`provider`.
- Automations are approval-first. Guardrail defaults: floor = cost per bed × (1 + 20%); ceiling = user-set, default 2× current base rate; max change 15% per night per day (my call). Floor applies to "Dorm bed" rows only.
- Plans: `free` = 1 seat, `team` = 3 seats (members + pending invites ≤ seats). Billing is a flag for now.
- Default OTA commission 15% (editable per hostel). Booking.com Genius default member discount 10%; commission applies to the discounted price. Direct payment fee default 3%.
- V1 rule stays: one reservation = one bed-stay. Dates are UTC midnights.
- Emails: real addresses only, OTA relay domains excluded, mandatory unsubscribe link and hostel postal address, suppression list; no key → outbox log, nothing sent.
- Website fetches: `https` only, public hosts only (SSRF-safe), ≤3 redirects, ≤1 MB, ≤8 s.
- AI: only supplied data; events/news only with a retrieved source link, else omitted; per-hostel daily call cap.
- Every request-time page starts with `await connection()` inside `<Suspense>`. `supabase/schema.sql` stays idempotent and ends with grants. Server actions go through `safely()`.
- Tests: `cd web && npx vitest run <path>`. Commit after each task; merge to `main` at the end of each phase.

## Review Focus

- Inviting a 4th person, inviting yourself, or a duplicate/case-different invite → blocked with a reason (Task 1).
- Capacity check with zero beds, an empty list, or stays that span the window → no NaN, correct peak (Task 3).
- Slider at 0%, 100%, or with zero revenue → finite numbers (Task 5).
- A price change exactly at the floor/ceiling is allowed; below/above, negative, NaN, or for a past night is blocked (Task 7).
- Rate table with a missing channel or night → blank cell, not NaN or a crash (Task 8).
- Website URL that resolves or redirects to a private address, `localhost`, or a non-https scheme → refused (Task 11).
- Guest with no email, a name-only key, or a relay address (e.g. `@guest.booking.com`) → never in the email audience (Task 13).

---

## PHASE 1: Foundation and quick wins

### Task 1: Team access (membership-based security)

**Files:** Create `web/src/lib/domain/team.ts`, `web/src/lib/domain/team.test.ts`, `web/src/app/actions/team.ts`, `web/src/components/team-panel.tsx`. Modify `web/supabase/schema.sql`, `web/src/lib/data/{store,memory-store,supabase-store}.ts`, `web/src/lib/session.ts`, `web/src/app/(app)/more/page.tsx`.

**Interfaces:**
- Produces: `type Plan = "free" | "team"`; `maxSeats(plan: Plan): number`; `canInvite(a: { plan: Plan; memberEmails: string[]; pendingEmails: string[]; email: string }): { ok: true } | { ok: false; reason: "seat_limit" | "already_member" | "already_invited" | "invalid_email" }`. `Property` gains `plan: Plan`. `Store` gains `listMembers(propertyId): Promise<Member[]>` (`Member = { userId: string; email: string; role: "owner" | "manager" }`), `listInvites(propertyId): Promise<string[]>`, `invite(propertyId, email, invitedBy): Promise<void>`, `revokeInvite(propertyId, email): Promise<void>`, `removeMember(propertyId, userId): Promise<void>`, `acceptInvitesFor(userId, email): Promise<Property | null>`. `getProperty(userId)` now resolves by membership.

- [ ] **Step 1: Failing tests** in `team.test.ts`: free + 1 member → `seat_limit`; team + 2 members + 0 pending → `ok`; team + 2 members + 1 pending → `seat_limit`; same email different case as a member → `already_member`; as a pending invite → `already_invited`; `"nope"` → `invalid_email`; `maxSeats("free") === 1`, `maxSeats("team") === 3`.
- [ ] **Step 2:** Run `npx vitest run src/lib/domain/team.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `team.ts` (count = members + pending; compare emails lowercased).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Schema.** In `schema.sql`: add `properties.plan text not null default 'free' check (plan in ('free','team'))`; create `property_members(property_id, user_id, email, role)` and `property_invites(property_id, email, invited_by, created_at)`; backfill members from `properties.owner_id`; trigger `after insert on properties` inserts the owner as member (security definer); add `is_member(pid uuid)` security-definer function; replace `owns_property` uses and the `properties` policy with membership checks (owner-only for invite/remove and plan); idempotent drops; extend the grants block. Verify with the scratch PGlite script (old → new → re-run → two-user isolation, plus a member of A can read A and not B).
- [ ] **Step 6:** Implement the six store methods in memory and Supabase stores; `acceptInvitesFor` converts a matching invite into a member if seats allow, then returns the property. In `requireProperty`, call `acceptInvitesFor` when the user has no property before redirecting to onboarding.
- [ ] **Step 7:** Server actions `inviteMember(prev, fd)`, `removeMember(userId)`, `revokeInvite(email)` (owner only, validated with `canInvite`, via `safely`). `TeamPanel` on More: members, pending invites, seats used `n/max`, upgrade note when full.
- [ ] **Step 8:** Run all tests + `npx tsc --noEmit`; commit `feat: team access with membership-based RLS`.

### Task 2: Profile fields at onboarding and in settings

**Files:** Create `web/src/lib/domain/{profile,ota}.ts`, `profile.test.ts`, `web/src/components/profile-fields.tsx`. Modify `schema.sql`, `store.ts` and both stores, `onboarding-form.tsx`, `app/actions/property.ts`, `more/page.tsx`.

**Interfaces:**
- Produces: `OTA_OPTIONS: { id: string; name: string }[]` (booking_com, hostelworld, expedia, airbnb, agoda, trip_com, hotels_com, other); `parseWebsite(input: string): { ok: true; url: string } | { ok: false; error: string }`; `type Socials = Partial<Record<"instagram" | "facebook" | "tiktok" | "youtube" | "google_business", string>>`; `parseSocials(input: Record<string, string>): { socials: Socials; errors: Record<string, string> }`; `type OtaProfile = { id: string; name: string; defaultCommission: number; memberDiscount: number | null; memberLabel: string | null }`; `KNOWN_OTAS: Record<string, OtaProfile>`; `resolveOta(id: string, overrides?: OtaSettings): OtaProfile` where `OtaSettings = Record<string, { commission?: number; memberDiscount?: number }>`. `Property` gains `otas: string[]; website: string | null; socials: Socials; postalAddress: string; replyToEmail: string; otaSettings: OtaSettings`.

- [ ] **Step 1: Failing tests:** `parseWebsite("example.com")` → ok `https://example.com/`; `"http://example.com"` → error (https only); `"javascript:alert(1)"`, `"https://localhost"`, `"https://10.0.0.1"`, `"https://nodot"` → errors; `""` → ok with `url: ""` (optional). `parseSocials({instagram:"instagram.com/x"})` normalises to `https://instagram.com/x`; a non-matching host for a platform → error keyed `instagram`. `resolveOta("booking_com")` → commission 0.15, memberDiscount 0.10, label "Genius"; override `{commission: 0.12}` wins; unknown id → commission 0.15, no discount.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (URL API, hostname rules). **Step 4:** Run → PASS.
- [ ] **Step 5:** Schema: add `otas text[]`, `website text`, `socials jsonb`, `postal_address text`, `reply_to_email text`, `ota_settings jsonb` to `properties` (idempotent `add column if not exists`). Update both stores' property mapping.
- [ ] **Step 6:** `ProfileFields` (OTA checkboxes, website, five social inputs, postal address, reply-to email) used in onboarding and a "Property" edit form on More (`updateProfile` action, echoing values on error). Echo pattern as in `saveCosts`.
- [ ] **Step 7:** Tests + tsc; commit `feat: OTAs, website and social links in onboarding and settings`.

### Task 3: Capacity check

**Files:** Create `web/src/lib/domain/capacity.ts`, `capacity.test.ts`, `web/src/components/capacity-warning.tsx`. Modify `import-service.ts`, `dashboard.ts`, `(app)/page.tsx`, `app/actions/property.ts` (add `setBedCount`).

**Interfaces:** Produces `capacityCheck(bookings: Booking[], beds: number): { exceeded: boolean; peak: number; peakDate: Date | null; nightsOver: number }`. `ImportOutcome` and `Dashboard` gain `capacity: ReturnType<typeof capacityCheck>`.

- [ ] **Step 1: Failing tests:** 3 bookings overlapping one night with `beds = 2` → `{exceeded:true, peak:3, nightsOver:1}` and `peakDate` that night; same bookings with `beds = 3` → not exceeded; stays on consecutive nights never counted twice; `[]` → `{exceeded:false, peak:0, peakDate:null, nightsOver:0}`; `beds = 0` with one booking → exceeded, finite; a booking spanning 30 nights counted on each.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement with a sweep over start/end events. **Step 4:** Run → PASS.
- [ ] **Step 5:** After a bookings import, include capacity in the result and show `CapacityWarning` (names the date, the peak and the bed count; two actions: "Set beds to {peak}" via `setBedCount`, or "Review the file" linking to Connections). Also show it on Home while exceeded. It never blocks an import.
- [ ] **Step 6:** Test an import-service case: overlapping bookings over the bed count returns `capacity.exceeded`. Tests + tsc; commit `feat: warn when bookings exceed declared beds`.

### Task 4: Chart kit, Reports rewrite, Costs reorder

**Files:** Create `web/src/lib/domain/series.ts`, `series.test.ts`, `web/src/components/charts/{bars,line,donut,spark}.tsx`. Modify `(app)/reports/page.tsx`, `(app)/costs/page.tsx`, `dashboard.ts`.

**Interfaces:** Produces `weekdayOccupancy(bookings: Booking[], beds: number, window: DateRange): { weekday: number; occupancy: number }[]` (7 entries, Sunday = 0); `monthlySeries(bookings: Booking[], months: number, now: Date): { month: string; revenueCents: number; bookings: number }[]` (oldest first, zero-filled); `Dashboard` gains `costHistory: { month: string; lines: Record<CostLine, number> }[]` (from stored `cost_inputs`). Chart components take plain arrays and render accessible SVG (`role="img"` + label), no libraries. Use the `dataviz` skill for colour and layout.

- [ ] **Step 1: Failing tests:** `weekdayOccupancy` with 2 beds, one bed booked every Monday in a 28-day window → Monday 0.5, others 0; `monthlySeries` returns exactly `months` entries, zero-filled for empty months, bookings counted in their check-in month.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Build the four chart components. **Step 6:** Rewrite Reports: A leaks (donut by category + open/recovered bars), B bookings (monthly bars), C costs (stacked cost lines over months + decrease bars), D reviews (rating/count lines). One-line captions only; keep the next-step line per section.
- [ ] **Step 7:** Costs page: render "B. Cost per bed" directly under the next steps, then Section A.
- [ ] **Step 8:** Browser-check Reports and Costs on a production build (390 px, no overflow, no console errors); tests + tsc; commit `feat: chart-led reports; cost per bed under next steps`.

### Task 5: OTA economics and the direct-booking slider

**Files:** Create `web/src/lib/domain/ota-economics.ts`, `ota-economics.test.ts`, `web/src/components/direct-slider.tsx`. Modify `(app)/profit/page.tsx`.

**Interfaces:** Consumes `resolveOta` (Task 2). Produces `netForMix(a: { revenueCents: number; directShare: number; otaCommission: number; directFee: number }): number` (= rev·share·(1−fee) + rev·(1−share)·(1−commission), rounded; share clamped 0..1); `directWhatIf(a: { revenueCents: number; currentDirectShare: number; newDirectShare: number; otaCommission: number; directFee: number }): { currentNetCents: number; newNetCents: number; deltaCents: number }`; `blendedCommission(revenueByOta: Record<string, number>, otas: OtaSettings): number`.

- [ ] **Step 1: Failing tests:** revenue 100000, commission 0.15, fee 0.03: share 0 → 85000; share 1 → 97000; share 0.4 → 40000×0.97 + 60000×0.85 = 89800; `directWhatIf` 0.25 → 0.50 yields delta = 25000×(0.97−0.85) = 3000; revenue 0 → all zeros; shares outside 0..1 clamp; `blendedCommission({booking_com:100, hostelworld:100}, {hostelworld:{commission:0.10}})` → 0.125.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** `DirectSlider` (client): slider 0–100% starting at the current direct share; shows monthly money kept now vs at the slider, the difference, and a two-bar chart; copy states the commission and fee used and links to edit them. Place under "Where your bookings come from".
- [ ] **Step 6:** Browser-check; commit `feat: OTA vs direct what-if slider`.

### Task 6: UI refresh (Inter, Night Strip, navigation)

**Files:** Create `web/src/lib/domain/night-strip.ts`, `night-strip.test.ts`, `web/src/components/{night-strip,breadcrumbs}.tsx`. Modify `layout.tsx`, `globals.css`, `bottom-nav.tsx`, page headers across `(app)`.

**Interfaces:** Produces `nightStrip(bookings: Booking[], beds: number, start: Date, days: number): { date: Date; occupancy: number }[]`; `<NightStrip cells=… />`; `<Breadcrumbs trail={[{label,href}]} />`.

- [ ] **Step 1: Failing tests:** 10 beds, 5 bookings on a night → occupancy 0.5; `days` entries from `start`; zero beds → 0 not NaN.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Invoke the `frontend-design` skill, then: switch fonts to Inter (keep a serif display only if the skill's direction justifies it), refine tokens and spacing, build `NightStrip` (colour scale by occupancy, tap shows the night), add it to Home and Profit, add `Breadcrumbs` to every sub-page, and tidy the bottom nav (labels, active state, larger tap targets). Leave a slot for the Actions inbox link (Task 7).
- [ ] **Step 6:** Browser-check all existing pages on a production build at 390 px; commit `feat: Inter, Night Strip and clearer navigation`. **Merge to `main`** (Phase 1 done).

---

## PHASE 2: Rates and the automation core

### Task 7: Automation framework

**Files:** Create `web/src/lib/domain/guardrails.ts`, `guardrails.test.ts`, `web/src/lib/automation/{runner,executors}.ts`, `runner.test.ts`, `web/src/app/actions/automation.ts`, `web/src/app/(app)/actions/page.tsx`, `web/src/components/{run-card,apply-button}.tsx`. Modify `schema.sql`, `store.ts` + both stores, `domain/types.ts` (Finding), `fix-card.tsx`, `bottom-nav.tsx`/Home (Actions link with pending badge).

**Interfaces:**
- `type Guardrails = { minMarginPct: number; ceilingCents: number | null; maxChangePctPerDay: number }`; `defaultGuardrails`; `priceFloorCents(costPerBedCents: number, minMarginPct: number): number` (ceil); `checkPriceChange(a: { currentCents: number; proposedCents: number; floorCents: number; ceilingCents: number | null; maxChangePct: number; stayDate: Date; today: Date; roomType: string }): { ok: true } | { ok: false; reasons: ("below_floor" | "above_ceiling" | "change_too_large" | "night_passed" | "invalid_price")[] }` (floor skipped unless `roomType === "Dorm bed"`; null ceiling = 2× current).
- `type AutomationKind = "price_update" | "email_campaign" | "ticket_draft" | "content_draft"`; `type RunStatus = "proposed" | "approved" | "applied" | "failed" | "undone" | "rejected"`; `type ActionRun = { id; propertyId; kind; title; params: Record<string, unknown>; before: unknown; after: unknown; status: RunStatus; reversible: boolean; simulated: boolean; createdBy: string; approvedBy: string | null; createdAt: Date; appliedAt: Date | null; error: string | null }`; `interface Executor { kind: AutomationKind; apply(run: ActionRun, ctx: ExecCtx): Promise<{ before: unknown; after: unknown; simulated: boolean; reversible: boolean }>; undo?(run: ActionRun, ctx: ExecCtx): Promise<void> }`; `proposeRun(deps, input): Promise<ActionRun>`; `approveRun(deps, runId, userId): Promise<ActionRun>` (idempotent: an already-applied run is returned unchanged); `undoRun(deps, runId, userId): Promise<ActionRun>` (only reversible, applied, and not for a past night). `Finding` gains `automation?: { kind: AutomationKind; params: Record<string, unknown>; label: string }`. `Store` gains `createRun`, `getRun`, `updateRun`, `listRuns(propertyId, limit)`, and `getGuardrails/saveGuardrails`.

- [ ] **Step 1: Failing tests (`guardrails.test.ts`):** floor `priceFloorCents(500, 0.2) === 600`; proposed exactly 600 → ok; 599 → `below_floor`; ceiling 1000: 1000 ok, 1001 → `above_ceiling`; null ceiling with current 800 → 1600 ok, 1601 blocked; current 1000 → 1200 with max 15% → `change_too_large`; 1150 ok; `NaN`, `-5`, `0` → `invalid_price`; `stayDate` before `today` → `night_passed`; `roomType: "Private room"` with price below floor → ok; multiple failures return all reasons.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `guardrails.ts`. **Step 4:** Run → PASS.
- [ ] **Step 5: Failing tests (`runner.test.ts`, memory store + fake executor):** `proposeRun` creates `proposed`; `approveRun` applies once and records `before/after`, `approvedBy`; calling it twice runs the executor once; a throwing executor → `failed` with `error`, never applied; `undoRun` restores via `undo` and marks `undone`; undo refused for a non-reversible run and for a past-night price run.
- [ ] **Step 6:** Run → FAIL. **Step 7:** Implement `runner.ts` and `executors.ts` (`LocalRateExecutor` writes to the local rate store, returns `simulated: true`, `reversible: true`). **Step 8:** Run → PASS.
- [ ] **Step 9:** Schema: `automation_runs` table + `guardrails jsonb` on `properties`, membership RLS, grants. Store methods in both stores.
- [ ] **Step 10:** UI: `ApplyButton` on `FixCard` when `finding.automation` exists (preview of before/after, guardrail messages, Approve); Actions inbox page (pending, applied with Undo, history, who approved, "Simulated" tag); Home/nav badge with pending count; Guardrails editor on More.
- [ ] **Step 11:** Tests + tsc + browser check; commit `feat: approval-first automation framework with guardrails`.

### Task 8: Rate model, simulated source, CSV, nightly job

**Files:** Create `web/src/lib/domain/rates.ts`, `rates.test.ts`, `web/src/lib/rates/{sources,refresh}.ts`, `web/src/lib/supabase/service.ts`, `web/src/app/api/cron/rates/route.ts`. Modify `schema.sql`, `store.ts` + both stores, `integrations/` docs in README.

**Interfaces:** Consumes `resolveOta`. Produces `type RateSource = "pms" | "manual" | "provider" | "simulated"`; `type Competitor = { id: string; name: string }`; `type RateSnapshot = { stayDate: Date; channel: string; competitorId: string | null; roomType: string; priceCents: number; discountedPriceCents: number | null; discountLabel: string | null; source: RateSource; capturedAt: Date }`; `netAfterCommission(a: { priceCents: number; discountPct: number | null; commission: number }): { listCents: number; discountedCents: number; keepCents: number }`; `interface RateSourceAdapter { name: string; source: RateSource; fetchRates(a: { nights: Date[]; channels: string[]; competitors: Competitor[]; baseRateCents: number; today: Date }): Promise<RateSnapshot[]> }`; `class SimulatedRates implements RateSourceAdapter` (deterministic from a seed string); `parseRatesCsv(text: string): ParseResult<RateRow>`; `buildRateTable(snaps: RateSnapshot[], nights: Date[], columns: string[]): RateRow[]`; `rateFlags(a: { row; floorCents: number; compMedianCents: number | null }): ("below_floor" | "direct_above_ota" | "above_comp" | "below_comp")[]` (comp thresholds ±15% of median). `Store` gains `saveRates`, `listRates(propertyId, range)`, `listCompetitors/addCompetitor/removeCompetitor`.

- [ ] **Step 1: Failing tests:** `netAfterCommission({priceCents:4000, discountPct:0.10, commission:0.15})` → list 4000, discounted 3600, keep 3060; with `discountPct: null` → discounted 4000, keep 3400; `SimulatedRates` returns identical output for the same seed and differs for another; Genius channel snapshots carry a `discountedPriceCents` below list and label "Genius"; non-discount channels carry none; `parseRatesCsv` rejects negative or non-numeric prices with line numbers; `buildRateTable` with a night missing for one channel yields `null` for that cell; `rateFlags`: direct 4500 vs OTA 4000 → `direct_above_ota`; price 599 with floor 600 → `below_floor`; 1.2× median → `above_comp`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Schema: `rate_snapshots`, `competitors` (membership RLS, grants); `supabase/service.ts` (`SUPABASE_SERVICE_ROLE_KEY`, server only). `refreshRates(propertyId)` pulls from the active adapter (simulated if no real source) and saves; `/api/cron/rates` requires `Authorization: Bearer ${CRON_SECRET}`, rejects otherwise, iterates properties with every query scoped by property id; add a `vercel.json` cron (daily).
- [ ] **Step 6:** Test the cron route handler: no/wrong secret → 401, correct secret → 200 with count.
- [ ] **Step 7:** Tests + tsc; commit `feat: rate model, simulated source, CSV and nightly refresh`.

### Task 9: Rate table page (Tier 3) with in-place price changes

**Files:** Create `web/src/app/(app)/profit/direct/rates/page.tsx`, `web/src/components/rate-table.tsx`, `web/src/components/comp-set.tsx`. Modify `app/actions/rates.ts` (`proposeRateChange`, `loadSimulatedExample`, `saveCompetitors`, `importRatesCsv`).

- [ ] **Step 1:** Page: next 14 nights × columns (Direct, each of the hostel's OTAs, each competitor), cells show list price, discounted price where applicable, and "you keep" after commission; flags as chips; Night Strip of own price; banner "Simulated data" while any shown row has `source: "simulated"`; empty state with **Load simulated example** (seeds the comp set and rates; demo comp set is labelled "Example").
- [ ] **Step 2:** Editing a Direct or OTA cell calls `proposeRateChange`, which runs `checkPriceChange` with the cost-based floor from the dashboard and creates a `price_update` run through Task 7's approval flow; blocked changes show the reasons.
- [ ] **Step 3:** Comp-set editor (add/remove up to 8 competitors) and rates CSV upload reusing the import pattern.
- [ ] **Step 4:** Browser-check: load example, edit a price below the floor (blocked), edit within limits (proposed → approved → appears in Actions with "Simulated"); empty state; 390 px. Commit `feat: nightly rate comparison table with approval-based price changes`.

### Task 10: Quietest nights with AI reasons

**Files:** Create `web/src/lib/domain/quiet.ts`, `quiet.test.ts`, `web/src/lib/ai/{quiet-reasons,cap}.ts`, `quiet-reasons.test.ts`, `web/src/components/quiet-nights.tsx`. Modify `dashboard.ts`, `(app)/page.tsx`, `app/api/` or an action for reasons.

**Interfaces:** Produces `quietestNights(bookings: Booking[], beds: number, today: Date, horizon: number, limit: number): QuietNight[]` (`QuietNight = { date: Date; weekday: number; occupancy: number; weekdayAvg: number; gap: number }`, lowest occupancy first, only nights with `gap > 0`); `suggestPrice(a: { currentCents: number; gap: number; floorCents: number; ceilingCents: number | null; maxChangePct: number }): number` (cut proportional to the gap, capped by `maxChangePct`, never below floor); `buildReasonPrompt(night: QuietNight, facts: { rateVsCompMedianPct: number | null; leadTimeDays: number | null }, events: { title: string; url: string }[]): string`; `makeDailyCap(limit: number): (key: string, now?: Date) => boolean`.

- [ ] **Step 1: Failing tests:** history where Tuesdays average 40% and one upcoming Tuesday is at 10% ranks first with `gap` 0.30; `[]` → `[]`; fully booked nights excluded; `suggestPrice` with gap 0.3, current 3000, floor 2800, max 15% → 2800 (floor wins over 2550); gap 0 → current; `buildReasonPrompt` contains the supplied facts and, with no events, an instruction to state that no event data was available and never to name events; with events, includes each title and url; `makeDailyCap(2)` allows two calls per key per day then blocks, resets next day.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Reasons call: server function using the Anthropic SDK (`CHAT_MODEL`), guarded by the daily cap and `ANTHROPIC_API_KEY`; response parsed as a short list of "possible" reasons; events via Claude's web-search tool only if the installed SDK supports it (check the types first); otherwise omit. UI card on Home: the weakest 3 nights on a Night Strip, reasons labelled "possible", suggested price, and an **Apply** that proposes a `price_update` run (Task 7).
- [ ] **Step 6:** Tests + tsc + browser check (with and without an API key: the card still shows nights and a suggested price, reasons say they are unavailable); commit `feat: quietest nights with explained price suggestions`. **Merge to `main`** (Phase 2 done).

---

## PHASE 3: Direct-booking hub and emails

### Task 11: Direct hub and Tier 1 (site and Google SEO)

**Files:** Create `web/src/lib/seo/{fetch-site,score}.ts`, `fetch-site.test.ts`, `score.test.ts`, `web/src/lib/ai/seo-copy.ts`, `web/src/app/(app)/profit/direct/page.tsx`, `.../seo/page.tsx`. Modify `profit/page.tsx` (link into the hub).

**Interfaces:** Produces `isPublicAddress(ip: string): boolean`; `fetchSite(url: string, opts?: { resolve?: (host: string) => Promise<string[]>; fetchImpl?: typeof fetch }): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; error: string }>`; `scoreSite(html: string, url: string, hostel: { name: string; city?: string }): { score: number; checks: { id: string; label: string; pass: boolean; fix: string }[] }`.

- [ ] **Step 1: Failing tests:** `isPublicAddress` false for `127.0.0.1`, `10.1.2.3`, `172.16.0.1`, `192.168.1.1`, `169.254.169.254`, `::1`, `fc00::1`; true for `93.184.216.34`. `fetchSite` refuses `http://…`, `https://localhost`, a host resolving to a private address, a redirect to a private host or after 3 hops, a body over 1 MB, and a timeout (injected `fetchImpl`/`resolve`). `scoreSite` on a fixture page with title, meta description, one h1, LodgingBusiness JSON-LD, a booking link → passes those checks; on a bare page → each missing check returns a specific `fix`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (cheerio for parsing; resolve DNS before connecting and pin to the resolved address). **Step 4:** Run → PASS.
- [ ] **Step 5:** Hub page with three tier cards (SEO, Appear before OTAs, Price comparison → Task 9). SEO page: runs `fetchSite` on the saved website, shows the score and failed checks, and "Generate copy" (Claude, daily cap) producing ready-to-paste title, meta description and page intro; creates a `content_draft` run so it appears in Actions. States clearly that publishing is manual until a site-builder integration exists. Social links shown as a presence checklist.
- [ ] **Step 6:** Tests + tsc + browser check (no website saved, bad URL, good page via a local fixture server); commit `feat: direct-booking hub and site SEO analysis`.

### Task 12: Tier 2 (ask OTAs to stop bidding on your name)

**Files:** Create `web/src/lib/domain/tickets.ts`, `tickets.test.ts`, `web/src/app/(app)/profit/direct/visibility/page.tsx`, `web/src/components/ticket-card.tsx`. Modify `schema.sql`, `store.ts` + both stores.

**Interfaces:** Produces `type TicketStatus = "draft" | "submitted" | "answered"`; `draftBrandBiddingRequest(a: { otaName: string; hostelName: string; website: string | null; contactEmail: string }): { subject: string; body: string }`; `nextStatus(s: TicketStatus): TicketStatus | null`; `OTA_SUPPORT_HINTS: Record<string, string>` (where to submit, as guidance). `Store` gains `listTickets`, `upsertTicket`.

- [ ] **Step 1: Failing tests:** the draft names the hostel and OTA, asks them to stop bidding on the hostel's brand terms, includes the website and contact email, and contains no placeholder braces; `nextStatus("draft") === "submitted"`, `("submitted") === "answered"`, `("answered") === null`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Schema `ota_tickets` (membership RLS, grants). Page: list the hostel's OTAs, choose which to include, show each draft with copy buttons and where to submit, track status and date; creates a `ticket_draft` run per OTA. Copy states that submission is manual because OTAs offer no API.
- [ ] **Step 6:** Tests + tsc + browser check; commit `feat: OTA brand-bidding request tracker`.

### Task 13: Repeat-guest emails

**Files:** Create `web/src/lib/domain/email-audience.ts`, `email-audience.test.ts`, `web/src/lib/email/{templates,send,unsubscribe}.ts`, `templates.test.ts`, `unsubscribe.test.ts`, `web/src/app/unsubscribe/[token]/route.ts`, `web/src/app/(app)/profit/emails/page.tsx`, `web/src/components/email-composer.tsx`. Modify `schema.sql`, `store.ts` + both stores, `app/actions/emails.ts`.

**Interfaces:** Produces `eligibleAudience(bookings: Booking[], suppressed: string[], today: Date): string[]` (lowercased unique emails of guests with ≥2 stays or a stay before `today`'s window, valid email syntax, not a relay domain, not suppressed); `RELAY_DOMAINS` (`guest.booking.com`, `m.expediapartner.com`, `guest.airbnb.com`, `reply.hostelworld.com`); `type TemplateId = "welcome_back" | "seasonal" | "review_request"`; `renderEmail(id: TemplateId, v: { hostelName: string; postalAddress: string; replyTo: string; unsubscribeUrl: string; code?: string; discountPct?: number }): { subject: string; html: string; text: string }` (throws if `postalAddress` or `unsubscribeUrl` is empty); `signUnsubscribe(propertyId: string, email: string, secret: string): string` and `verifyUnsubscribe(token: string, secret: string): { propertyId: string; email: string } | null`; `sendCampaign(deps, a): Promise<{ sent: number; skipped: number; mode: "sent" | "outbox" }>` (Resend if `RESEND_API_KEY`, else writes to the outbox and sends nothing).

- [ ] **Step 1: Failing tests:** audience excludes: no email (name-only key), invalid syntax, each relay domain, suppressed (case-insensitive), single-stay guests who are not repeat; includes a guest with two stays; duplicates collapse. `renderEmail` output contains the unsubscribe URL, postal address and hostel name in both html and text, and throws without an address or unsubscribe URL; the three templates differ. `verifyUnsubscribe` accepts a fresh token, rejects a tampered token, a token signed with another secret, and garbage; `sendCampaign` with no key → `mode: "outbox"`, `sent: 0`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (HMAC-SHA256, constant-time compare). **Step 4:** Run → PASS.
- [ ] **Step 5:** Schema: `email_suppressions`, `email_outbox`, `email_campaigns` (membership RLS, grants). `/unsubscribe/[token]` verifies the token, adds a suppression, and shows a plain confirmation (no login needed; uses the service client scoped to the token's property).
- [ ] **Step 6:** Composer page: choose a template, preview, see the audience count (and how many were excluded as masked/missing), requires postal address and reply-to in settings (links there if missing), then creates an `email_campaign` run through the approval flow; sending happens on approval; outbox viewer when no key. Never lists individual guest emails in the UI beyond counts and a masked sample.
- [ ] **Step 7:** Tests + tsc + browser check (blocked without address; outbox path; unsubscribe link works); commit `feat: repeat-guest email automation with templates`.

### Task 14: Release

**Files:** Modify `web/README.md`, `web/.env.example`, `web/vercel.json`.

- [ ] **Step 1:** Document new env vars (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET`, `NEXT_PUBLIC_SITE_URL`), the schema re-run, the team plan flag, and what is simulated.
- [ ] **Step 2:** Run the PGlite schema script (old → new → re-run → isolation, including a team member of one property and not another).
- [ ] **Step 3:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint src`, `npx next build`; fix anything.
- [ ] **Step 4:** Browser pass over every new page in demo mode and against the fake-Supabase harness (login → onboarding with new fields → setup states), 390 px, no console errors beyond expected 503.
- [ ] **Step 5:** Commit, push, merge to `main`, and report what is simulated and what the owner must configure.
