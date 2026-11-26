import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { CostInputs } from "../domain/costs";
import type { BookingRow, ExpenseRow, ImportKind, RowError, ShiftRow } from "../domain/import/parsers";
import type { Booking, DateRange, ExpenseCategory } from "../domain/types";
import type { ConnectionStatus, ProviderId } from "../integrations/providers";
import type { ConnectionRecord, ImportRecord, Member, NewProperty, Property, PropertyPatch, ReviewSnapshot, Store, StoredExpense, StoredShift } from "./store";
import type { Plan } from "../domain/team";

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
    must(await this.db.from("properties").update(SupabaseStore.toColumns(patch)).eq("id", propertyId), "Could not update property");
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
