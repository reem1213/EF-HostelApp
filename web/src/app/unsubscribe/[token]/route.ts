import { SupabaseStore } from "@/lib/data/supabase-store";
import { verifyUnsubscribe } from "@/lib/email/unsubscribe";
import { getDemoStoreIfDemo } from "@/lib/session";
import { serviceConfigured, supabaseService } from "@/lib/supabase/service";

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="margin:0;font-family:Inter,Arial,sans-serif;background:#f2f4f3;color:#17231f"><main style="max-width:440px;margin:12vh auto;padding:0 20px"><div style="background:#fff;border-radius:16px;padding:24px"><h1 style="font-size:22px;margin:0 0 10px">${title}</h1>${body}</div></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
  );

const secret = () => process.env.UNSUBSCRIBE_SECRET ?? "";

/** Opening the link only shows a confirm button, so mail scanners that fetch links do not unsubscribe anyone by accident. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!verifyUnsubscribe(token, secret())) return page("This link is not valid", "<p>It may be incomplete or out of date. Reply to the email and we will remove you by hand.</p>", 400);
  return page(
    "Unsubscribe?",
    `<p style="line-height:1.5">You will stop getting emails from this hostel.</p><form method="post"><button type="submit" style="margin-top:8px;padding:12px 18px;border:0;border-radius:12px;background:#1f5e5a;color:#fff;font-size:15px;font-weight:600;cursor:pointer">Yes, unsubscribe me</button></form>`,
  );
}

/** Also the target of the one-click List-Unsubscribe header. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyUnsubscribe(token, secret());
  if (!v) return page("This link is not valid", "<p>It may be incomplete or out of date. Reply to the email and we will remove you by hand.</p>", 400);
  try {
    const demo = await getDemoStoreIfDemo();
    if (demo) await demo.addSuppression(v.propertyId, v.email);
    else if (serviceConfigured()) await new SupabaseStore(supabaseService()).addSuppression(v.propertyId, v.email);
    else throw new Error("no store configured");
  } catch (e) {
    console.error("[unsubscribe] could not save", e);
    return page("Something went wrong", "<p>We could not save that. Please try again, or reply to the email and we will remove you by hand.</p>", 500);
  }
  return page("You are unsubscribed", "<p style=\"line-height:1.5\">You will not get any more emails from this hostel. You can close this page.</p>");
}
