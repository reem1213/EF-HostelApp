import type { Store } from "../data/store";
import { localRateExecutor, recordOnlyExecutor, type RateWriter } from "./executors";
import type { RunnerDeps } from "./runner";
import type { AutomationKind, Executor } from "./types";

/**
 * Which executor handles each kind of change. Prices go through `rateWriter` (the local rate store
 * now; a PMS writer later). Without a writer, price changes cannot be applied.
 */
export function buildRunnerDeps(store: Store, opts: { rateWriter?: RateWriter; now?: () => Date } = {}): RunnerDeps {
  const executors: Partial<Record<AutomationKind, Executor>> = {
    ticket_draft: recordOnlyExecutor("ticket_draft"),
    content_draft: recordOnlyExecutor("content_draft"),
  };
  if (opts.rateWriter) executors.price_update = localRateExecutor(opts.rateWriter);
  return { store, executors, now: opts.now ?? (() => new Date()) };
}
