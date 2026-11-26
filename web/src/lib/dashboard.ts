import { runAudit } from "./domain/audit-engine";
import { costBreakdown, type CostBreakdown, type CostInputs } from "./domain/costs";
import { laborCostCents } from "./domain/import/parsers";
import { bookingsInWindow, profitMetrics, type ProfitMetrics } from "./domain/metrics";
import { profitActions, rankActions, reviewActions, setupActions, type DataState } from "./domain/next-steps";
import type { AuditResult, DateRange, Finding } from "./domain/types";
import { materializeInputs } from "./domain/costs";
import { defaultBenchmark, type ConnectionRecord, type ImportRecord, type Property, type ReviewSnapshot, type Store, type StoredExpense } from "./data/store";
import { chooseWindow, formatRange, monthOf, previousMonth, previousWindow } from "./period";

const DAY = 86_400_000;

export type Dashboard = {
  property: Property;
  window: DateRange;
  windowLabel: string;
  month: string;
  metrics: ProfitMetrics;
  prevMetrics: ProfitMetrics;
  breakdown: CostBreakdown;
  prevBreakdown: CostBreakdown;
  costInputs: CostInputs | null;
  prevCostInputs: CostInputs | null;
  audit: AuditResult;
  /** Every open next step, best first. Setup steps come first when data is missing. */
  actions: Finding[];
  setup: Finding[];
  dataState: DataState;
  expenses: StoredExpense[];
  prevExpenses: StoredExpense[];
  imports: ImportRecord[];
  connections: ConnectionRecord[];
  reviews: ReviewSnapshot[];
  hasAnyData: boolean;
};

/** Builds everything the pages show from stored data. Pure orchestration; the maths lives in the domain layer. */
export async function loadDashboard(store: Store, property: Property, now = new Date()): Promise<Dashboard> {
  const allBookings = await store.listBookings(property.id);
  const window = chooseWindow(allBookings, now);
  const prev = previousWindow(window);
  const month = monthOf(new Date(window.end.getTime() - DAY));
  const prevMonthKey = previousMonth(month);

  const [expensesAll, shifts, costInputs, prevCostInputs, imports, connections, reviews, addressed] = await Promise.all([
    store.listExpenses(property.id, { start: prev.start, end: window.end }),
    store.listShifts(property.id, window),
    store.getCostInputs(property.id, month),
    store.getCostInputs(property.id, prevMonthKey),
    store.listImports(property.id),
    store.listConnections(property.id),
    store.listReviewSnapshots(property.id),
    store.addressedIds(property.id),
  ]);

  const inWindow = (e: StoredExpense, w: DateRange) => e.date >= w.start && e.date < w.end;
  const expenses = expensesAll.filter((e) => inWindow(e, window));
  const prevExpenses = expensesAll.filter((e) => inWindow(e, prev));

  const metrics = profitMetrics(allBookings, window, property.beds);
  const prevMetrics = profitMetrics(allBookings, prev, property.beds);

  const breakdown = costBreakdown({ inputs: costInputs, expenses, scheduleLaborCents: laborCostCents(shifts), occupiedBedNights: metrics.occupiedBedNights });
  const prevBreakdown = costBreakdown({ inputs: prevCostInputs, expenses: prevExpenses, occupiedBedNights: prevMetrics.occupiedBedNights });

  const lastDay = new Date(window.end.getTime() - DAY);
  const audit = runAudit(
    {
      property: { ...property, benchmark: defaultBenchmark },
      period: window,
      previousPeriod: prev,
      occupiedBedNights: metrics.occupiedBedNights,
      bookings: bookingsInWindow(allBookings, window),
      expenses: materializeInputs(costInputs, expenses, lastDay),
      previousExpenses: materializeInputs(prevCostInputs, prevExpenses, new Date(prev.end.getTime() - DAY)),
      syncedAt: now,
      costPerBedNightCents: breakdown.totalCents > 0 && metrics.occupiedBedNights > 0 ? breakdown.perBedNightCents : undefined,
    },
    addressed,
  );

  const dataState: DataState = {
    hasBookings: allBookings.length > 0,
    hasBankData: expensesAll.length > 0 || imports.some((i) => i.kind === "bank" || i.kind === "expenses"),
    missingCostLines: breakdown.missing,
    hasGuestIdentity: allBookings.some((b) => b.guestKey),
    hasReviewSnapshot: reviews.length > 0,
    hasPmsConnection: connections.length > 0,
  };

  const latestReview = reviews.at(-1);
  const prevReview = reviews.at(-2);
  const setup = setupActions(dataState).filter((f) => !addressed.has(f.id));
  const actions = rankActions([
    ...setup,
    ...audit.findings.filter((f) => !addressed.has(f.id)),
    ...(dataState.hasBookings ? profitActions(metrics, property.beds) : []).filter((f) => !addressed.has(f.id)),
    ...reviewActions(latestReview ? { rating: latestReview.rating, reviewCount: latestReview.reviewCount, prevRating: prevReview?.rating, prevReviewCount: prevReview?.reviewCount } : null).filter((f) => !addressed.has(f.id)),
  ]);

  return {
    property,
    window,
    windowLabel: formatRange(window),
    month,
    metrics,
    prevMetrics,
    breakdown,
    prevBreakdown,
    costInputs,
    prevCostInputs,
    audit,
    actions,
    setup,
    dataState,
    expenses,
    prevExpenses,
    imports,
    connections,
    reviews,
    hasAnyData: dataState.hasBookings || dataState.hasBankData || breakdown.totalCents > 0,
  };
}

/** Setup steps shown on the pages they unblock. */
const SETUP_ON: Record<string, Finding["page"][]> = {
  "setup-bookings": ["profit", "reports"],
  "setup-costs": ["costs"],
  "setup-bank": ["costs"],
  "setup-guest-identity": ["profit"],
  "setup-reviews": ["reports"],
};

/** Every open next step that belongs on a page: its own fixes plus any setup it needs. */
export const actionsFor = (d: Dashboard, page: Finding["page"]) =>
  d.actions.filter((a) => (a.kind === "setup" ? (SETUP_ON[a.id] ?? []).includes(page) : a.page === page));
