import type { SupabaseClient } from "@supabase/supabase-js";

import type { FindingStore } from "./audit-repository";

/**
 * Persists addressed findings in Supabase table `finding_actions`
 * (see supabase/schema.sql). Row-level security scopes rows to the signed-in user.
 */
export class SupabaseFindingStore implements FindingStore {
  constructor(private readonly client: SupabaseClient) {}

  async addressedIds(propertyId: string): Promise<Set<string>> {
    const { data, error } = await this.client
      .from("finding_actions")
      .select("finding_id")
      .eq("property_id", propertyId);
    if (error) throw new Error(`Could not read finding actions: ${error.message}`);
    return new Set((data ?? []).map((r) => r.finding_id as string));
  }

  async markAddressed(propertyId: string, findingId: string): Promise<void> {
    const { error } = await this.client
      .from("finding_actions")
      .upsert({ property_id: propertyId, finding_id: findingId }, { onConflict: "property_id,finding_id" });
    if (error) throw new Error(`Could not save finding action: ${error.message}`);
  }
}
