import { CloudbedsConnector } from "./integrations/cloudbeds";
import { DemoBankFeed, DemoPms, demoProperty } from "./integrations/demo-data";
import { currentWindow, demoDeps, type AuditDeps } from "./data/audit-repository";
import { SupabaseFindingStore } from "./data/supabase-finding-store";
import { supabaseConfigured, supabaseServer } from "./supabase/server";

/**
 * Server-only composition root. Chooses real or demo sources from environment
 * variables. Nothing here may be imported by a client component.
 *
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  -> saved findings in Supabase
 *   CLOUDBEDS_PROXY_URL / CLOUDBEDS_PROPERTY_ID                      -> live bookings (else demo)
 */
export async function getAuditDeps(): Promise<AuditDeps> {
  const pmsUrl = process.env.CLOUDBEDS_PROXY_URL;
  const pmsProperty = process.env.CLOUDBEDS_PROPERTY_ID;

  if (!supabaseConfigured()) {
    return demoDeps();
  }

  const store = new SupabaseFindingStore(await supabaseServer());
  const pms =
    pmsUrl && pmsProperty
      ? new CloudbedsConnector({
          propertyId: pmsProperty,
          baseUrl: pmsUrl,
          headers: { Authorization: `Bearer ${process.env.CLOUDBEDS_PROXY_TOKEN ?? ""}` },
        })
      : new DemoPms();

  return {
    property: demoProperty,
    pms,
    // Bank feeds are still demo-only; see the README for the provider decision.
    bank: new DemoBankFeed(() => currentWindow(new Date()).start),
    store,
  };
}
