import { timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 16;

/** Constant-time check of an `Authorization: Bearer <secret>` header. A missing or short secret never authorises. */
export function authorizeCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_SECRET_LENGTH || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type CronDeps<P extends { id: string }> = {
  secret: string | undefined;
  listProperties: () => Promise<P[]>;
  refresh: (property: P) => Promise<number>;
};

/**
 * Handler for a scheduled job (Vercel Cron sends the secret as a bearer token). It refuses unless the
 * secret matches, refreshes every property, and keeps going when one fails.
 */
export function makeCronHandler<P extends { id: string }>(deps: CronDeps<P>) {
  return async (req: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store" };
    if (!deps.secret || deps.secret.length < MIN_SECRET_LENGTH) {
      return Response.json({ error: "CRON_SECRET is not configured (use at least 16 characters)." }, { status: 503, headers });
    }
    if (!authorizeCron(req.headers.get("authorization"), deps.secret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    }
    const properties = await deps.listProperties();
    let rates = 0;
    let failed = 0;
    for (const p of properties) {
      try {
        rates += await deps.refresh(p);
      } catch (e) {
        failed++;
        console.error(`[cron] refresh failed for ${p.id}`, e);
      }
    }
    return Response.json({ properties: properties.length, rates, failed }, { headers });
  };
}
