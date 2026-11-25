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
};

export const idle: ActionState = {};
