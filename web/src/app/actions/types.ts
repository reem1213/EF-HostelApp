/** State returned by server actions to forms (used with useActionState). */
export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  /** Per-field errors keyed by form field name. */
  fieldErrors?: Record<string, string>;
  /** Extra lines to show, such as import row errors. */
  details?: string[];
  /** Submitted values echoed back on a validation error, so React's form reset does not wipe what the user typed. Never includes secrets. */
  values?: Record<string, string>;
  /** The id of an automation run just proposed. */
  runId?: string;
  /** Set after a bookings import when more beds are needed than declared. */
  capacity?: { peak: number; peakDate: string; nightsOver: number; beds: number };
};

export const idle: ActionState = {};
