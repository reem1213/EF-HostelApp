export type AutomationKind = "price_update" | "email_campaign" | "ticket_draft" | "content_draft";

export type RunStatus = "proposed" | "approved" | "applied" | "failed" | "undone" | "rejected";

/** One automated change, from proposal through approval to (maybe) undo. Every run is kept as the audit log. */
export type ActionRun = {
  id: string;
  propertyId: string;
  kind: AutomationKind;
  title: string;
  params: Record<string, unknown>;
  before: unknown;
  after: unknown;
  status: RunStatus;
  reversible: boolean;
  /** True when the change only happened inside HostelPulse (nothing was pushed to a PMS or OTA). */
  simulated: boolean;
  createdBy: string;
  approvedBy: string | null;
  createdAt: Date;
  appliedAt: Date | null;
  error: string | null;
};

export type NewRun = { kind: AutomationKind; title: string; params: Record<string, unknown>; createdBy: string };

export type RunPatch = Partial<Pick<ActionRun, "status" | "before" | "after" | "reversible" | "simulated" | "approvedBy" | "appliedAt" | "error">>;

export type ExecCtx = { propertyId: string; now: Date };

/** Does the actual work for one kind of automation. Swap implementations to go from simulated to live. */
export interface Executor {
  kind: AutomationKind;
  apply(run: ActionRun, ctx: ExecCtx): Promise<{ before: unknown; after: unknown; simulated: boolean; reversible: boolean }>;
  undo?(run: ActionRun, ctx: ExecCtx): Promise<void>;
  /** False once undoing no longer makes sense (for example the night has passed). */
  canUndo?(run: ActionRun, ctx: ExecCtx): boolean;
}
