import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { CostInputs } from "../domain/costs";
import type { BookingRow, ExpenseRow, ImportKind, RowError, ShiftRow } from "../domain/import/parsers";
import type { Booking, DateRange, ExpenseCategory } from "../domain/types";
import type { ConnectionStatus, ProviderId } from "../integrations/providers";
import type { ConnectionRecord, ImportRecord, Member, NewProperty, Property, PropertyPatch, ReviewSnapshot, Store, StoredExpense, StoredShift, Ticket, OutboxEntry, Campaign } from "./store";
import type { TicketStatus } from "../domain/tickets";
import type { OutboxRow } from "../email/send";
import type { Plan } from "../domain/team";
import { defaultGuardrails, type Guardrails } from "../domain/guardrails";
import type { ActionRun, NewRun, RunPatch } from "../automation/types";
import type { Competitor, RateSnapshot } from "../domain/rates";

/** Supabase implementation of the Store. Row-level security scopes every query to the signed-in user. */

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const CHUNK = 500;

function must<T>(res: { data: T | null; error: PostgrestError | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Row = Record<string, unknown>;

export class SupabaseStore implements Store {
  constructor(private readonly db: SupabaseClient) {}

  private static readonly PROPERTY_COLUMNS = "id,name,beds,currency,country,plan,otas,website,socials,postal_address,reply_to_email,ota_settings";

  private toProperty(r: Row): Property {
    return {
      id: String(r.id),
      name: String(r.name),
      beds: Number(r.beds),
      currency: String(r.currency),
      country: String(r.country),
      plan: (r.plan as Plan) ?? "free",
      otas: (r.otas as string[] | null) ?? [],
      website: (r.website as string | null) ?? null,
      socials: (r.socials as Property["socials"] | null) ?? {},
      postalAddress: String(r.postal_address ?? ""),
      replyToEmail: String(r.reply_to_email ?? ""),
      otaSettings: (r.ota_settings as Property["otaSettings"] | null) ?? {},
    };
  }

  private static toColumns(p: PropertyPatch & Partial<NewProperty>): Row {
    const out: Row = {};
    if (p.name !== undefined) out.name = p.name;
    if (p.beds !== undefined) out.beds = p.beds;
    if (p.currency !== undefined) out.currency = p.currency;
    if (p.country !== undefined) out.country = p.country;
    if (p.otas !== undefined) out.otas = p.otas;
    if (p.website !== undefined) out.website = p.website;
    if (p.socials !== undefined) out.socials = p.socials;
    if (p.postalAddress !== undefined) out.postal_address = p.postalAddress;
    if (p.replyToEmail !== undefined) out.reply_to_email = p.replyToEmail;
    if (p.otaSettings !== undefined) out.ota_settings = p.otaSettings;
    return out;
  }

  async getProperty(_userId: string) {
    // Row-level security limits this to properties the signed-in user belongs to.
    const data = must(
      await this.db.from("properties").select(SupabaseStore.PROPERTY_COLUMNS).order("created_at").limit(1).maybeSingle(),
      "Could not load property",
    ) as unknown as Row | null;
    return data ? this.toProperty(data) : null;
  }

  async createProperty(_userId: string, p: NewProperty) {
    const data = must(
      await this.db.from("properties").insert(SupabaseStore.toColumns(p)).select(SupabaseStore.PROPERTY_COLUMNS).single(),
      "Could not create property",
    ) as unknown as Row;
    return this.toProperty(data);
  }

  async updateProperty(propertyId: string, patch: PropertyPatch) {
    const rows = must(await this.db.from("properties").update(SupabaseStore.toColumns(patch)).eq("id", propertyId).select("id"), "Could not update property") as Row[];
    // Row-level security hides rows from a non-owner instead of raising an error, so zero rows means nothing was saved.
    if (rows.length === 0) throw new Error("You do not have permission to change this.");
  }

  async listMembers(propertyId: string) {
    const rows = must(await this.db.from("property_members").select("user_id,email,role").eq("property_id", propertyId), "Could not load team") as Row[];
    return rows.map<Member>((r) => ({ userId: String(r.user_id), email: String(r.email), role: r.role as Member["role"] }));
  }

  async listInvites(propertyId: string) {
    const rows = must(await this.db.from("property_invites").select("email").eq("property_id", propertyId), "Could not load invites") as Row[];
    return rows.map((r) => String(r.email));
  }

  async invite(propertyId: string, email: string) {
    must(await this.db.from("property_invites").insert({ property_id: propertyId, email: email.toLowerCase() }), "Could not invite");
  }

  async revokeInvite(propertyId: string, email: string) {
    must(await this.db.from("property_invites").delete().eq("property_id", propertyId).eq("email", email.toLowerCase()), "Could not revoke invite");
  }

  async removeMember(propertyId: string, userId: string) {
    must(await this.db.from("property_members").delete().eq("property_id", propertyId).eq("user_id", userId), "Could not remove member");
  }

  async acceptInvitesFor(userId: string, _email: string) {
    must(await this.db.rpc("accept_invites"), "Could not accept invites");
    return this.getProperty(userId);
  }

  async getCostInputs(propertyId: string, month: string) {
    const r = must(
      await this.db.from("cost_inputs").select("*").eq("property_id", propertyId).eq("month", month).maybeSingle(),
      "Could not load costs",
    ) as Row | null;
    return r
      ? ({
          month,
          rentCents: Number(r.rent_cents),
          utilitiesCents: Number(r.utilities_cents),
          staffCents: Number(r.staff_cents),
          breakfastCents: Number(r.breakfast_cents),
          laundryCents: Number(r.laundry_cents),
        } satisfies CostInputs)
      : null;
  }

  async saveCostInputs(propertyId: string, i: CostInputs) {
    must(
      await this.db.from("cost_inputs").upsert(
        {
          property_id: propertyId,
          month: i.month,
          rent_cents: i.rentCents,
          utilities_cents: i.utilitiesCents,
          staff_cents: i.staffCents,
          breakfast_cents: i.breakfastCents,
          laundry_cents: i.laundryCents,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "property_id,month" },
      ),
      "Could not save costs",
    );
  }

  async listCostInputs(propertyId: string) {
    const rows = must(await this.db.from("cost_inputs").select("*").eq("property_id", propertyId).order("month"), "Could not load costs") as Row[];
    return rows.map<CostInputs>((r) => ({
      month: String(r.month),
      rentCents: Number(r.rent_cents),
      utilitiesCents: Number(r.utilities_cents),
      staffCents: Number(r.staff_cents),
      breakfastCents: Number(r.breakfast_cents),
      laundryCents: Number(r.laundry_cents),
    }));
  }

  async listBookings(propertyId: string) {
    const out: Booking[] = [];
    // Page through results: PostgREST returns at most 1000 rows per request.
    for (let from = 0; ; from += 1000) {
      const rows = must(
        await this.db.from("bookings").select("external_id,channel,check_in,nights,revenue_cents,guest_key").eq("property_id", propertyId).order("check_in").range(from, from + 999),
        "Could not load bookings",
      ) as Row[];
      for (const r of rows) {
        out.push({
          id: String(r.external_id),
          channel: r.channel as Booking["channel"],
          checkIn: day(String(r.check_in)),
          nights: Number(r.nights),
          revenueCents: Number(r.revenue_cents),
          guestKey: (r.guest_key as string | null) ?? undefined,
        });
      }
      if (rows.length < 1000) break;
    }
    return out;
  }

  async addBookings(propertyId: string, importId: string, rows: BookingRow[]) {
    let updated = 0;
    for (const part of chunks(rows)) {
      const ids = part.map((r) => r.externalId);
      const existing = must(await this.db.from("bookings").select("external_id").eq("property_id", propertyId).in("external_id", ids), "Could not check bookings") as Row[];
      updated += existing.length;
      must(
        await this.db.from("bookings").upsert(
          part.map((r) => ({
            property_id: propertyId,
            external_id: r.externalId,
            import_id: importId,
            channel: r.channel,
            check_in: ymd(r.checkIn),
            nights: r.nights,
            revenue_cents: r.revenueCents,
            guest_key: r.guestKey,
          })),
          { onConflict: "property_id,external_id" },
        ),
        "Could not save bookings",
      );
    }
    return { inserted: rows.length - updated, updated };
  }

  async listExpenses(propertyId: string, range?: DateRange) {
    const out: StoredExpense[] = [];
    for (let from = 0; ; from += 1000) {
      let q = this.db.from("expenses").select("id,import_id,date,amount_cents,merchant,category").eq("property_id", propertyId);
      if (range) q = q.gte("date", ymd(range.start)).lt("date", ymd(range.end));
      const rows = must(await q.order("date").range(from, from + 999), "Could not load expenses") as Row[];
      for (const r of rows) {
        out.push({
          id: String(r.id),
          importId: (r.import_id as string | null) ?? null,
          date: day(String(r.date)),
          amountCents: Number(r.amount_cents),
          merchant: String(r.merchant),
          category: r.category as ExpenseCategory,
        });
      }
      if (rows.length < 1000) break;
    }
    return out;
  }

  async addExpenses(propertyId: string, importId: string, rows: ExpenseRow[]) {
    for (const part of chunks(rows)) {
      must(
        await this.db.from("expenses").insert(
          part.map((r) => ({ property_id: propertyId, import_id: importId, date: ymd(r.date), amount_cents: r.amountCents, merchant: r.merchant, category: r.category })),
        ),
        "Could not save expenses",
      );
    }
    return rows.length;
  }

  async updateExpenseCategory(propertyId: string, expenseId: string, category: ExpenseCategory) {
    must(await this.db.from("expenses").update({ category }).eq("property_id", propertyId).eq("id", expenseId), "Could not update expense");
  }

  async listShifts(propertyId: string, range: DateRange) {
    const rows = must(
      await this.db.from("shifts").select("id,employee,date,hours,hourly_rate_cents").eq("property_id", propertyId).gte("date", ymd(range.start)).lt("date", ymd(range.end)).limit(5000),
      "Could not load shifts",
    ) as Row[];
    return rows.map<StoredShift>((r) => ({
      id: String(r.id),
      employee: String(r.employee),
      date: day(String(r.date)),
      hours: Number(r.hours),
      hourlyRateCents: Number(r.hourly_rate_cents),
    }));
  }

  async addShifts(propertyId: string, importId: string, rows: ShiftRow[]) {
    for (const part of chunks(rows)) {
      must(
        await this.db.from("shifts").insert(
          part.map((r) => ({ property_id: propertyId, import_id: importId, employee: r.employee, date: ymd(r.date), hours: r.hours, hourly_rate_cents: r.hourlyRateCents })),
        ),
        "Could not save shifts",
      );
    }
    return rows.length;
  }

  private toImport(r: Row): ImportRecord {
    return {
      id: String(r.id),
      kind: r.kind as ImportKind,
      filename: String(r.filename),
      fileHash: String(r.file_hash),
      rowsOk: Number(r.rows_ok),
      rowsFailed: Number(r.rows_failed),
      errors: (r.errors as RowError[]) ?? [],
      createdAt: new Date(String(r.created_at)),
    };
  }

  async findImportByHash(propertyId: string, kind: ImportKind, hash: string) {
    const r = must(await this.db.from("imports").select("*").eq("property_id", propertyId).eq("kind", kind).eq("file_hash", hash).maybeSingle(), "Could not check imports") as Row | null;
    return r ? this.toImport(r) : null;
  }

  async recordImport(propertyId: string, rec: Omit<ImportRecord, "id" | "createdAt">) {
    const r = must(
      await this.db.from("imports").insert({ property_id: propertyId, kind: rec.kind, filename: rec.filename, file_hash: rec.fileHash, rows_ok: rec.rowsOk, rows_failed: rec.rowsFailed, errors: rec.errors }).select("*").single(),
      "Could not record import",
    ) as Row;
    return this.toImport(r);
  }

  async listImports(propertyId: string, limit = 20) {
    const rows = must(await this.db.from("imports").select("*").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(limit), "Could not load imports") as Row[];
    return rows.map((r) => this.toImport(r));
  }

  async listConnections(propertyId: string) {
    const rows = must(
      await this.db.from("connections").select("provider,status,clear_fields,secret_masks,message,updated_at,last_sync_at").eq("property_id", propertyId),
      "Could not load connections",
    ) as Row[];
    return rows.map<ConnectionRecord>((r) => ({
      provider: r.provider as ProviderId,
      status: r.status as ConnectionStatus,
      clearFields: (r.clear_fields as Record<string, string>) ?? {},
      secretMasks: (r.secret_masks as Record<string, string>) ?? {},
      message: (r.message as string | null) ?? null,
      updatedAt: new Date(String(r.updated_at)),
      lastSyncAt: r.last_sync_at ? new Date(String(r.last_sync_at)) : null,
    }));
  }

  async saveConnection(
    propertyId: string,
    c: { provider: ProviderId; credentialsEnc: string; clearFields: Record<string, string>; secretMasks: Record<string, string>; status: ConnectionStatus; message: string | null },
  ) {
    must(
      await this.db.from("connections").upsert(
        { property_id: propertyId, provider: c.provider, status: c.status, credentials_enc: c.credentialsEnc, clear_fields: c.clearFields, secret_masks: c.secretMasks, message: c.message, updated_at: new Date().toISOString() },
        { onConflict: "property_id,provider" },
      ),
      "Could not save connection",
    );
  }

  async getConnectionSecret(propertyId: string, provider: ProviderId) {
    const r = must(await this.db.from("connections").select("credentials_enc").eq("property_id", propertyId).eq("provider", provider).maybeSingle(), "Could not read connection") as Row | null;
    return r ? String(r.credentials_enc) : null;
  }

  async deleteConnection(propertyId: string, provider: ProviderId) {
    must(await this.db.from("connections").delete().eq("property_id", propertyId).eq("provider", provider), "Could not remove connection");
  }

  private toRun(r: Row): ActionRun {
    return {
      id: String(r.id),
      propertyId: String(r.property_id),
      kind: r.kind as ActionRun["kind"],
      title: String(r.title),
      params: (r.params as Record<string, unknown>) ?? {},
      before: r.before ?? null,
      after: r.after ?? null,
      status: r.status as ActionRun["status"],
      reversible: Boolean(r.reversible),
      simulated: Boolean(r.simulated),
      createdBy: String(r.created_by),
      approvedBy: (r.approved_by as string | null) ?? null,
      createdAt: new Date(String(r.created_at)),
      appliedAt: r.applied_at ? new Date(String(r.applied_at)) : null,
      error: (r.error as string | null) ?? null,
    };
  }

  async createRun(propertyId: string, input: NewRun) {
    const r = must(
      await this.db.from("automation_runs").insert({ property_id: propertyId, kind: input.kind, title: input.title, params: input.params, created_by: input.createdBy }).select("*").single(),
      "Could not save the action",
    ) as Row;
    return this.toRun(r);
  }

  async getRun(propertyId: string, id: string) {
    const r = must(await this.db.from("automation_runs").select("*").eq("property_id", propertyId).eq("id", id).maybeSingle(), "Could not load the action") as Row | null;
    return r ? this.toRun(r) : null;
  }

  async claimRun(propertyId: string, id: string, userId: string) {
    // The status filter makes this atomic: only one caller can move proposed -> approved.
    const r = must(
      await this.db.from("automation_runs").update({ status: "approved", approved_by: userId }).eq("property_id", propertyId).eq("id", id).eq("status", "proposed").select("*").maybeSingle(),
      "Could not approve the action",
    ) as Row | null;
    return r ? this.toRun(r) : null;
  }

  async updateRun(propertyId: string, id: string, patch: RunPatch) {
    const cols: Row = {};
    if (patch.status !== undefined) cols.status = patch.status;
    if (patch.before !== undefined) cols.before = patch.before;
    if (patch.after !== undefined) cols.after = patch.after;
    if (patch.reversible !== undefined) cols.reversible = patch.reversible;
    if (patch.simulated !== undefined) cols.simulated = patch.simulated;
    if (patch.approvedBy !== undefined) cols.approved_by = patch.approvedBy;
    if (patch.appliedAt !== undefined) cols.applied_at = patch.appliedAt ? patch.appliedAt.toISOString() : null;
    if (patch.error !== undefined) cols.error = patch.error;
    const r = must(await this.db.from("automation_runs").update(cols).eq("property_id", propertyId).eq("id", id).select("*").single(), "Could not update the action") as Row;
    return this.toRun(r);
  }

  async listRuns(propertyId: string, limit = 50) {
    const rows = must(await this.db.from("automation_runs").select("*").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(limit), "Could not load actions") as Row[];
    return rows.map((r) => this.toRun(r));
  }

  async listTickets(propertyId: string) {
    const rows = must(await this.db.from("ota_tickets").select("*").eq("property_id", propertyId).order("created_at"), "Could not load requests") as Row[];
    const d = (v: unknown) => (v ? new Date(String(v)) : null);
    return rows.map<Ticket>((r) => ({ otaId: String(r.ota_id), status: r.status as TicketStatus, subject: String(r.subject), body: String(r.body), createdAt: new Date(String(r.created_at)), submittedAt: d(r.submitted_at), answeredAt: d(r.answered_at) }));
  }

  async upsertTicket(propertyId: string, t: { otaId: string; status: TicketStatus; subject: string; body: string }) {
    const existing = must(await this.db.from("ota_tickets").select("submitted_at,answered_at").eq("property_id", propertyId).eq("ota_id", t.otaId).maybeSingle(), "Could not load request") as Row | null;
    const now = new Date().toISOString();
    must(
      await this.db.from("ota_tickets").upsert(
        {
          property_id: propertyId,
          ota_id: t.otaId,
          status: t.status,
          subject: t.subject,
          body: t.body,
          submitted_at: existing?.submitted_at ?? (t.status !== "draft" ? now : null),
          answered_at: existing?.answered_at ?? (t.status === "answered" ? now : null),
        },
        { onConflict: "property_id,ota_id" },
      ),
      "Could not save request",
    );
  }

  async listSuppressions(propertyId: string) {
    const rows = must(await this.db.from("email_suppressions").select("email").eq("property_id", propertyId), "Could not load the unsubscribe list") as Row[];
    return rows.map((r) => String(r.email));
  }

  async addSuppression(propertyId: string, email: string) {
    must(await this.db.from("email_suppressions").upsert({ property_id: propertyId, email: email.trim().toLowerCase() }, { onConflict: "property_id,email", ignoreDuplicates: true }), "Could not save the unsubscribe");
  }

  async addOutbox(propertyId: string, rows: OutboxRow[]) {
    if (rows.length === 0) return;
    must(await this.db.from("email_outbox").insert(rows.map((r) => ({ property_id: propertyId, masked_email: r.maskedEmail, subject: r.subject, status: r.status, error: r.error ?? null }))), "Could not record emails");
  }

  async listOutbox(propertyId: string, limit = 50) {
    const rows = must(await this.db.from("email_outbox").select("masked_email,subject,status,error,created_at").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(limit), "Could not load emails") as Row[];
    return rows.map<OutboxEntry>((r) => ({ maskedEmail: String(r.masked_email), subject: String(r.subject), status: r.status as OutboxEntry["status"], error: r.error ? String(r.error) : undefined, createdAt: new Date(String(r.created_at)) }));
  }

  async recordCampaign(propertyId: string, c: Omit<Campaign, "createdAt">) {
    must(await this.db.from("email_campaigns").insert({ property_id: propertyId, template: c.template, subject: c.subject, audience: c.audience, sent: c.sent, skipped: c.skipped, mode: c.mode, created_by: c.createdBy }), "Could not record the campaign");
  }

  async listCampaigns(propertyId: string, limit = 20) {
    const rows = must(await this.db.from("email_campaigns").select("*").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(limit), "Could not load campaigns") as Row[];
    return rows.map<Campaign>((r) => ({ template: String(r.template), subject: String(r.subject), audience: Number(r.audience), sent: Number(r.sent), skipped: Number(r.skipped), mode: r.mode as Campaign["mode"], createdBy: String(r.created_by), createdAt: new Date(String(r.created_at)) }));
  }

  async getGuardrails(propertyId: string) {
    const r = must(await this.db.from("properties").select("guardrails").eq("id", propertyId).maybeSingle(), "Could not load limits") as Row | null;
    return { ...defaultGuardrails, ...((r?.guardrails as Partial<Guardrails> | null) ?? {}) };
  }

  async saveGuardrails(propertyId: string, g: Guardrails) {
    must(await this.db.from("properties").update({ guardrails: g }).eq("id", propertyId), "Could not save limits");
  }

  async saveRates(propertyId: string, snaps: RateSnapshot[]) {
    for (const part of chunks(snaps)) {
      must(
        await this.db.from("rate_snapshots").insert(
          part.map((r) => ({
            property_id: propertyId,
            stay_date: ymd(r.stayDate),
            channel: r.channel,
            competitor_id: r.competitorId,
            room_type: r.roomType,
            price_cents: r.priceCents,
            discounted_price_cents: r.discountedPriceCents,
            discount_label: r.discountLabel,
            source: r.source,
            captured_at: r.capturedAt.toISOString(),
          })),
        ),
        "Could not save rates",
      );
    }
  }

  async listRates(propertyId: string, range: DateRange) {
    const out: RateSnapshot[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = must(
        await this.db.from("rate_snapshots").select("*").eq("property_id", propertyId).gte("stay_date", ymd(range.start)).lt("stay_date", ymd(range.end)).order("captured_at").range(from, from + 999),
        "Could not load rates",
      ) as Row[];
      for (const r of rows) {
        out.push({
          stayDate: day(String(r.stay_date)),
          channel: String(r.channel),
          competitorId: (r.competitor_id as string | null) ?? null,
          roomType: String(r.room_type),
          priceCents: Number(r.price_cents),
          discountedPriceCents: r.discounted_price_cents === null ? null : Number(r.discounted_price_cents),
          discountLabel: (r.discount_label as string | null) ?? null,
          source: r.source as RateSnapshot["source"],
          capturedAt: new Date(String(r.captured_at)),
        });
      }
      if (rows.length < 1000) break;
    }
    return out;
  }

  async deleteManualRate(propertyId: string, key: { stayDate: Date; channel: string; roomType: string }) {
    must(
      await this.db.from("rate_snapshots").delete().eq("property_id", propertyId).eq("stay_date", ymd(key.stayDate)).eq("channel", key.channel).eq("room_type", key.roomType).eq("source", "manual").is("competitor_id", null),
      "Could not clear the rate",
    );
  }

  async listCompetitors(propertyId: string) {
    const rows = must(await this.db.from("competitors").select("id,name").eq("property_id", propertyId).order("created_at"), "Could not load competitors") as Row[];
    return rows.map<Competitor>((r) => ({ id: String(r.id), name: String(r.name) }));
  }

  async addCompetitor(propertyId: string, name: string) {
    const clean = name.trim();
    if (!clean || clean.length > 80) throw new Error("Enter a name up to 80 characters.");
    const res = await this.db.from("competitors").insert({ property_id: propertyId, name: clean }).select("id,name").single();
    if (res.error) {
      if (res.error.code === "23505") throw new Error("That competitor is already in your list.");
      if (/limit/i.test(res.error.message)) throw new Error("You can compare against up to 8 competitors.");
      throw new Error(`Could not add competitor: ${res.error.message}`);
    }
    const r = res.data as Row;
    return { id: String(r.id), name: String(r.name) } satisfies Competitor;
  }

  async removeCompetitor(propertyId: string, id: string) {
    must(await this.db.from("competitors").delete().eq("property_id", propertyId).eq("id", id), "Could not remove competitor");
  }

  async addressedIds(propertyId: string) {
    const rows = must(await this.db.from("finding_actions").select("finding_id").eq("property_id", propertyId), "Could not load actions") as Row[];
    return new Set(rows.map((r) => String(r.finding_id)));
  }

  async markAddressed(propertyId: string, findingId: string) {
    must(await this.db.from("finding_actions").upsert({ property_id: propertyId, finding_id: findingId }, { onConflict: "property_id,finding_id" }), "Could not save action");
  }

  async listReviewSnapshots(propertyId: string) {
    const rows = must(await this.db.from("review_snapshots").select("*").eq("property_id", propertyId).order("month"), "Could not load reviews") as Row[];
    return rows.map<ReviewSnapshot>((r) => ({
      month: String(r.month),
      rating: Number(r.rating),
      reviewCount: Number(r.review_count),
      impressions: r.impressions === null || r.impressions === undefined ? null : Number(r.impressions),
    }));
  }

  async saveReviewSnapshot(propertyId: string, s: ReviewSnapshot) {
    must(
      await this.db.from("review_snapshots").upsert({ property_id: propertyId, month: s.month, rating: s.rating, review_count: s.reviewCount, impressions: s.impressions }, { onConflict: "property_id,month" }),
      "Could not save review snapshot",
    );
  }
}
