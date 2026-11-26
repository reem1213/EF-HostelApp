import { randomUUID } from "node:crypto";

import type { CostInputs } from "../domain/costs";
import type { BookingRow, ExpenseRow, ShiftRow } from "../domain/import/parsers";
import type { Booking, DateRange, ExpenseCategory } from "../domain/types";
import type { ProviderId } from "../integrations/providers";
import type {
  ConnectionRecord,
  ImportRecord,
  Property,
  ReviewSnapshot,
  Store,
  StoredExpense,
  StoredShift,
} from "./store";

type Conn = ConnectionRecord & { credentialsEnc: string };

/** In-memory store for demo mode and tests. Data lives for the life of the server process. */
export class MemoryStore implements Store {
  private properties = new Map<string, Property>(); // by userId
  private costInputs = new Map<string, CostInputs>(); // `${propertyId}:${month}`
  private bookings = new Map<string, Map<string, Booking>>(); // property -> externalId
  private expenses = new Map<string, StoredExpense[]>();
  private shifts = new Map<string, StoredShift[]>();
  private imports = new Map<string, ImportRecord[]>();
  private connections = new Map<string, Conn>(); // `${propertyId}:${provider}`
  private addressed = new Map<string, Set<string>>();
  private reviews = new Map<string, ReviewSnapshot[]>();

  async getProperty(userId: string) {
    return this.properties.get(userId) ?? null;
  }

  async createProperty(userId: string, p: Omit<Property, "id">) {
    const prop = { id: randomUUID(), ...p };
    this.properties.set(userId, prop);
    return prop;
  }

  async getCostInputs(propertyId: string, month: string) {
    return this.costInputs.get(`${propertyId}:${month}`) ?? null;
  }

  async saveCostInputs(propertyId: string, inputs: CostInputs) {
    this.costInputs.set(`${propertyId}:${inputs.month}`, inputs);
  }

  async listBookings(propertyId: string) {
    return [...(this.bookings.get(propertyId)?.values() ?? [])];
  }

  async addBookings(propertyId: string, _importId: string, rows: BookingRow[]) {
    const map = this.bookings.get(propertyId) ?? new Map<string, Booking>();
    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      if (map.has(r.externalId)) updated++;
      else inserted++;
      map.set(r.externalId, {
        id: r.externalId,
        channel: r.channel,
        revenueCents: r.revenueCents,
        nights: r.nights,
        checkIn: r.checkIn,
        guestKey: r.guestKey ?? undefined,
      });
    }
    this.bookings.set(propertyId, map);
    return { inserted, updated };
  }

  async listExpenses(propertyId: string, range?: DateRange) {
    const all = this.expenses.get(propertyId) ?? [];
    return range ? all.filter((e) => e.date >= range.start && e.date < range.end) : [...all];
  }

  async addExpenses(propertyId: string, importId: string, rows: ExpenseRow[]) {
    const list = this.expenses.get(propertyId) ?? [];
    for (const r of rows) list.push({ id: randomUUID(), importId, ...r });
    this.expenses.set(propertyId, list);
    return rows.length;
  }

  async updateExpenseCategory(propertyId: string, expenseId: string, category: ExpenseCategory) {
    const e = (this.expenses.get(propertyId) ?? []).find((x) => x.id === expenseId);
    if (e) e.category = category;
  }

  async listShifts(propertyId: string, range: DateRange) {
    return (this.shifts.get(propertyId) ?? []).filter((s) => s.date >= range.start && s.date < range.end);
  }

  async addShifts(propertyId: string, _importId: string, rows: ShiftRow[]) {
    const list = this.shifts.get(propertyId) ?? [];
    for (const r of rows) list.push({ id: randomUUID(), ...r });
    this.shifts.set(propertyId, list);
    return rows.length;
  }

  async findImportByHash(propertyId: string, kind: string, hash: string) {
    return (this.imports.get(propertyId) ?? []).find((i) => i.kind === kind && i.fileHash === hash) ?? null;
  }

  async recordImport(propertyId: string, rec: Omit<ImportRecord, "id" | "createdAt">) {
    const full: ImportRecord = { id: randomUUID(), createdAt: new Date(), ...rec };
    this.imports.set(propertyId, [full, ...(this.imports.get(propertyId) ?? [])]);
    return full;
  }

  async listImports(propertyId: string, limit = 20) {
    return (this.imports.get(propertyId) ?? []).slice(0, limit);
  }

  async listConnections(propertyId: string) {
    return [...this.connections.entries()]
      .filter(([k]) => k.startsWith(`${propertyId}:`))
      .map(([, c]) => {
        const rest: ConnectionRecord = { provider: c.provider, status: c.status, clearFields: c.clearFields, secretMasks: c.secretMasks, message: c.message, updatedAt: c.updatedAt, lastSyncAt: c.lastSyncAt };
        return rest; // the encrypted blob is deliberately left out
      });
  }

  async saveConnection(
    propertyId: string,
    c: { provider: ProviderId; credentialsEnc: string; clearFields: Record<string, string>; secretMasks: Record<string, string>; status: ConnectionRecord["status"]; message: string | null },
  ) {
    this.connections.set(`${propertyId}:${c.provider}`, { ...c, updatedAt: new Date(), lastSyncAt: null });
  }

  async getConnectionSecret(propertyId: string, provider: ProviderId) {
    return this.connections.get(`${propertyId}:${provider}`)?.credentialsEnc ?? null;
  }

  async deleteConnection(propertyId: string, provider: ProviderId) {
    this.connections.delete(`${propertyId}:${provider}`);
  }

  async addressedIds(propertyId: string) {
    return new Set(this.addressed.get(propertyId) ?? []);
  }

  async markAddressed(propertyId: string, findingId: string) {
    const set = this.addressed.get(propertyId) ?? new Set<string>();
    set.add(findingId);
    this.addressed.set(propertyId, set);
  }

  async listReviewSnapshots(propertyId: string) {
    return [...(this.reviews.get(propertyId) ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  }

  async saveReviewSnapshot(propertyId: string, s: ReviewSnapshot) {
    const list = (this.reviews.get(propertyId) ?? []).filter((x) => x.month !== s.month);
    this.reviews.set(propertyId, [...list, s]);
  }
}
