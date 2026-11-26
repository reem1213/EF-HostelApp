import type { Store } from "../data/store";
import { emailCampaignExecutor, type EmailSettings } from "../email/executor";
import { storeRateWriter } from "../rates/writer";
import { localRateExecutor, recordOnlyExecutor, type RateWriter } from "./executors";
import type { RunnerDeps } from "./runner";
import type { AutomationKind, Executor } from "./types";

/**
 * Which executor handles each kind of change. Prices go through `rateWriter`: the hostel's own rate
 * store by default (always reported as simulated), a PMS writer once one is connected.
 */
export function buildRunnerDeps(store: Store, opts: { rateWriter?: RateWriter; now?: () => Date; email?: EmailSettings } = {}): RunnerDeps {
  const now = opts.now ?? (() => new Date());
  const executors: Partial<Record<AutomationKind, Executor>> = {
    price_update: localRateExecutor(opts.rateWriter ?? storeRateWriter(store, now)),
    ticket_draft: recordOnlyExecutor("ticket_draft"),
    content_draft: recordOnlyExecutor("content_draft"),
  };
  if (opts.email) executors.email_campaign = emailCampaignExecutor(store, opts.email);
  return { store, executors, now };
}
