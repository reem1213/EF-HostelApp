import type { Store } from "../data/store";
import type { ActionRun, AutomationKind, Executor, NewRun } from "./types";

export type RunnerDeps = {
  store: Pick<Store, "createRun" | "getRun" | "claimRun" | "updateRun" | "listRuns">;
  executors: Partial<Record<AutomationKind, Executor>>;
  now: () => Date;
};

export type AutomationErrorCode = "not_found" | "not_applied" | "not_reversible" | "night_passed";

export class AutomationError extends Error {
  constructor(public readonly code: AutomationErrorCode, message: string) {
    super(message);
    this.name = "AutomationError";
  }
}

export const proposeRun = (deps: RunnerDeps, propertyId: string, input: NewRun): Promise<ActionRun> => deps.store.createRun(propertyId, input);

async function mustGet(deps: RunnerDeps, propertyId: string, runId: string): Promise<ActionRun> {
  const run = await deps.store.getRun(propertyId, runId);
  if (!run) throw new AutomationError("not_found", "That action does not exist.");
  return run;
}

/**
 * Approves and executes a proposed run. Idempotent: anything that is not still "proposed" is
 * returned unchanged, and the claim is atomic, so two simultaneous approvals run the executor once.
 */
export async function approveRun(deps: RunnerDeps, propertyId: string, runId: string, userId: string): Promise<ActionRun> {
  const existing = await mustGet(deps, propertyId, runId);
  if (existing.status !== "proposed") return existing;

  const claimed = await deps.store.claimRun(propertyId, runId, userId);
  if (!claimed) return mustGet(deps, propertyId, runId); // someone else got there first

  const executor = deps.executors[claimed.kind];
  if (!executor) return deps.store.updateRun(propertyId, runId, { status: "failed", error: `No executor is set up for ${claimed.kind}.` });

  try {
    const result = await executor.apply(claimed, { propertyId, now: deps.now() });
    return await deps.store.updateRun(propertyId, runId, { status: "applied", ...result, appliedAt: deps.now(), error: null });
  } catch (e) {
    return deps.store.updateRun(propertyId, runId, { status: "failed", error: e instanceof Error ? e.message : "The action failed." });
  }
}

export async function rejectRun(deps: RunnerDeps, propertyId: string, runId: string, _userId: string): Promise<ActionRun> {
  const run = await mustGet(deps, propertyId, runId);
  return run.status === "proposed" ? deps.store.updateRun(propertyId, runId, { status: "rejected" }) : run;
}

export async function undoRun(deps: RunnerDeps, propertyId: string, runId: string, _userId: string): Promise<ActionRun> {
  const run = await mustGet(deps, propertyId, runId);
  if (run.status !== "applied") throw new AutomationError("not_applied", "Only a change that was applied can be undone.");
  const executor = deps.executors[run.kind];
  if (!run.reversible || !executor?.undo) throw new AutomationError("not_reversible", "This change cannot be undone.");
  const ctx = { propertyId, now: deps.now() };
  if (executor.canUndo && !executor.canUndo(run, ctx)) throw new AutomationError("night_passed", "It is too late to undo this change.");
  await executor.undo(run, ctx);
  return deps.store.updateRun(propertyId, runId, { status: "undone" });
}
