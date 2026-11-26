import type { CostInputs } from "../domain/costs";
import type { BookingRow, ExpenseRow, ImportKind, RowError, ShiftRow } from "../domain/import/parsers";
import type { Benchmark, Booking, DateRange, Expense, ExpenseCategory } from "../domain/types";
import type { ConnectionStatus, ProviderId } from "../integrations/providers";
import type { Plan } from "../domain/team";
import type { Guardrails } from "../domain/guardrails";
import type { ActionRun, NewRun, RunPatch } from "../automation/types";
import type { Competitor, RateSnapshot } from "../domain/rates";
import type { OtaSettings } from "../domain/ota";
import type { Socials } from "../domain/profile";

export type Property = {
  id: string;
  name: string;
  beds: number;
  currency: string;
  country: string;
  plan: Plan;
  /** OTA ids the hostel sells on (see OTA_OPTIONS). */
  otas: string[];
  website: string | null;
  socials: Socials;
  /** Required on every marketing email. */
  postalAddress: string;
  replyToEmail: string;
  otaSettings: OtaSettings;
};

/** What a new property needs; the profile extras are optional. */
export type NewProperty = Pick<Property, "name" | "beds" | "currency" | "country"> &
  Partial<Pick<Property, "otas" | "website" | "socials" | "postalAddress" | "replyToEmail" | "otaSettings">>;

export type PropertyPatch = Partial<Pick<Property, "name" | "beds" | "country" | "otas" | "website" | "socials" | "postalAddress" | "replyToEmail" | "otaSettings">>;

export type Member = { userId: string; email: string; role: "owner" | "manager" };

/** Targets used to judge a property. Placeholder industry assumptions until real benchmarking exists. */
export const defaultBenchmark: Benchmark = {
  peerCostPerBedNightCents: 490,
  targetCostPerBedNightCents: 450,
  peerLaundryPerBedNightCents: 145,
  targetOtaCommissionRate: 0.15,
  targetDirectShare: 0.4,
  targetOtaShare: 0.5,
};

export type StoredExpense = Expense & { importId: string | null };
export type StoredShift = ShiftRow & { id: string };

export type ImportRecord = {
  id: string;
  kind: ImportKind;
  filename: string;
  fileHash: string;
  rowsOk: number;
  rowsFailed: number;
  errors: RowError[];
  createdAt: Date;
};

/** A saved PMS connection. Encrypted credentials never leave the server. */
export type ConnectionRecord = {
  provider: ProviderId;
  status: ConnectionStatus;
  /** Non-secret fields as entered, such as the property id. */
  clearFields: Record<string, string>;
  /** Masked secrets for display, e.g. ••••3456. */
  secretMasks: Record<string, string>;
  message: string | null;
  updatedAt: Date;
  lastSyncAt: Date | null;
};

export type ReviewSnapshot = {
  month: string; // YYYY-MM
  rating: number;
  reviewCount: number;
  impressions: number | null;
};

export interface Store {
  // property
  /** The property this user belongs to (as owner or manager), if any. */
  getProperty(userId: string): Promise<Property | null>;
  createProperty(userId: string, p: NewProperty, ownerEmail?: string): Promise<Property>;
  updateProperty(propertyId: string, patch: PropertyPatch): Promise<void>;

  // team
  listMembers(propertyId: string): Promise<Member[]>;
  listInvites(propertyId: string): Promise<string[]>;
  invite(propertyId: string, email: string, invitedBy: string): Promise<void>;
  revokeInvite(propertyId: string, email: string): Promise<void>;
  removeMember(propertyId: string, userId: string): Promise<void>;
  /** Turns a pending invite for this email into membership (if seats allow) and returns the property joined. */
  acceptInvitesFor(userId: string, email: string): Promise<Property | null>;

  // monthly cost inputs (forms)
  getCostInputs(propertyId: string, month: string): Promise<CostInputs | null>;
  saveCostInputs(propertyId: string, inputs: CostInputs): Promise<void>;
  /** Every month the manager has entered costs for. */
  listCostInputs(propertyId: string): Promise<CostInputs[]>;

  // imported / synced data
  listBookings(propertyId: string): Promise<Booking[]>;
  addBookings(propertyId: string, importId: string, rows: BookingRow[]): Promise<{ inserted: number; updated: number }>;
  listExpenses(propertyId: string, range?: DateRange): Promise<StoredExpense[]>;
  addExpenses(propertyId: string, importId: string, rows: ExpenseRow[]): Promise<number>;
  updateExpenseCategory(propertyId: string, expenseId: string, category: ExpenseCategory): Promise<void>;
  listShifts(propertyId: string, range: DateRange): Promise<StoredShift[]>;
  addShifts(propertyId: string, importId: string, rows: ShiftRow[]): Promise<number>;

  // import log
  findImportByHash(propertyId: string, kind: ImportKind, hash: string): Promise<ImportRecord | null>;
  recordImport(propertyId: string, rec: Omit<ImportRecord, "id" | "createdAt">): Promise<ImportRecord>;
  listImports(propertyId: string, limit?: number): Promise<ImportRecord[]>;

  // PMS connections
  listConnections(propertyId: string): Promise<ConnectionRecord[]>;
  saveConnection(
    propertyId: string,
    c: { provider: ProviderId; credentialsEnc: string; clearFields: Record<string, string>; secretMasks: Record<string, string>; status: ConnectionStatus; message: string | null },
  ): Promise<void>;
  getConnectionSecret(propertyId: string, provider: ProviderId): Promise<string | null>;
  deleteConnection(propertyId: string, provider: ProviderId): Promise<void>;

  // automation runs (the audit log of every automated change)
  createRun(propertyId: string, input: NewRun): Promise<ActionRun>;
  getRun(propertyId: string, id: string): Promise<ActionRun | null>;
  /** Atomically moves a "proposed" run to "approved". Returns null when it was no longer proposed. */
  claimRun(propertyId: string, id: string, userId: string): Promise<ActionRun | null>;
  updateRun(propertyId: string, id: string, patch: RunPatch): Promise<ActionRun>;
  listRuns(propertyId: string, limit?: number): Promise<ActionRun[]>;
  getGuardrails(propertyId: string): Promise<Guardrails>;
  saveGuardrails(propertyId: string, g: Guardrails): Promise<void>;

  // nightly rates and the competitor set
  saveRates(propertyId: string, snaps: RateSnapshot[]): Promise<void>;
  /** Rates for nights in [start, end). */
  listRates(propertyId: string, range: DateRange): Promise<RateSnapshot[]>;
  /** Removes the rates the owner set by hand for one night/channel/room, revealing the underlying source. */
  deleteManualRate(propertyId: string, key: { stayDate: Date; channel: string; roomType: string }): Promise<void>;
  listCompetitors(propertyId: string): Promise<Competitor[]>;
  /** Up to 8 per property, names unique ignoring case. Throws a readable error otherwise. */
  addCompetitor(propertyId: string, name: string): Promise<Competitor>;
  /** Also removes that competitor's rates. */
  removeCompetitor(propertyId: string, id: string): Promise<void>;

  // progress on fixes
  addressedIds(propertyId: string): Promise<Set<string>>;
  markAddressed(propertyId: string, findingId: string): Promise<void>;

  // reviews and visibility
  listReviewSnapshots(propertyId: string): Promise<ReviewSnapshot[]>;
  saveReviewSnapshot(propertyId: string, s: ReviewSnapshot): Promise<void>;
}
