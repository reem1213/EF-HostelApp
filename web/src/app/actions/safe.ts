import { unstable_rethrow } from "next/navigation";

import type { ActionState } from "./types";

/**
 * Runs a server action body so an unexpected failure becomes a readable form
 * error instead of a crash. In production React hides server error messages
 * from the browser ("Minified React error #441"), so without this a database or
 * network problem looks like a broken page. The real error is logged on the
 * server (visible in Vercel > Logs).
 *
 * Next's own control-flow errors (redirect, notFound) must pass through.
 */
export async function safely(label: string, run: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await run();
  } catch (e) {
    unstable_rethrow(e);
    console.error(`[action:${label}]`, e);
    return { error: "Something went wrong on our side. Please try again. If it keeps happening, check that the database setup has been run." };
  }
}
