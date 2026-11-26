import { makeCronHandler } from "@/lib/cron";
import { SupabaseStore } from "@/lib/data/supabase-store";
import { refreshRates } from "@/lib/rates/refresh";
import { SimulatedRates } from "@/lib/rates/sources";
import { supabaseService } from "@/lib/supabase/service";

export const maxDuration = 60;

type CronProperty = { id: string; beds: number; otas: string[]; otaSettings: Record<string, { commission?: number; memberDiscount?: number }> };

/** Nightly: refresh the next 14 nights of rates for every hostel. Called by Vercel Cron with CRON_SECRET. */
const handler = makeCronHandler<CronProperty>({
  get secret() {
    return process.env.CRON_SECRET;
  },
  async listProperties() {
    const db = supabaseService();
    const { data, error } = await db.from("properties").select("id,beds,otas,ota_settings");
    if (error) throw new Error(`Could not list properties: ${error.message}`);
    return (data ?? []).map((r) => ({ id: String(r.id), beds: Number(r.beds), otas: (r.otas as string[] | null) ?? [], otaSettings: (r.ota_settings as CronProperty["otaSettings"] | null) ?? {} }));
  },
  async refresh(property) {
    // Real rate sources (PMS, partner API) replace SimulatedRates here once they are connected.
    return refreshRates({ store: new SupabaseStore(supabaseService()), adapter: new SimulatedRates(property.id), property });
  },
});

export async function GET(req: Request) {
  try {
    return await handler(req);
  } catch (e) {
    console.error("[cron] rates failed", e);
    return Response.json({ error: "The job could not run." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
