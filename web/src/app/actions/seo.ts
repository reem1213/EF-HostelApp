"use server";

import Anthropic from "@anthropic-ai/sdk";

import { makeDailyCap } from "@/lib/ai/cap";
import { buildSeoPrompt, parseSeoCopy, type SeoCopy } from "@/lib/ai/seo-copy";
import { buildRunnerDeps } from "@/lib/automation/registry";
import { proposeRun } from "@/lib/automation/runner";
import { CHAT_MODEL } from "@/lib/chat";
import { requireProperty } from "@/lib/session";
import { fetchSite } from "@/lib/seo/fetch-site";
import { scoreSite } from "@/lib/seo/score";
import { revalidatePath } from "next/cache";
import * as cheerio from "cheerio";

const allow = makeDailyCap(3);

export type SeoCopyResult = { copy?: SeoCopy; error?: string };

/** Writes ready-to-paste title, description and intro from the site's own problems, and files it in Actions as a draft. */
export async function generateSeoCopyAction(): Promise<SeoCopyResult> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { error: "Copy writing is not switched on yet. The checklist above still shows what to fix." };
    const { store, property, user } = await requireProperty();
    if (!property.website) return { error: "Add your website in More first." };
    if (!allow(property.id)) return { error: "You have used today's copy requests. Try again tomorrow." };

    const site = await fetchSite(property.website);
    if (!site.ok) return { error: site.error };
    const scored = scoreSite(site.html, site.finalUrl, { name: property.name });
    const $ = cheerio.load(site.html);

    const prompt = buildSeoPrompt({
      name: property.name,
      currentTitle: $("head title").first().text().trim() || null,
      currentDescription: ($('meta[name="description"]').attr("content") ?? "").trim() || null,
      failed: scored.checks.filter((c) => !c.pass).map((c) => c.label),
    });
    const res = await new Anthropic().messages.create({ model: CHAT_MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] });
    const copy = parseSeoCopy(res.content.map((c) => (c.type === "text" ? c.text : "")).join(""));
    if (!copy) return { error: "The copy did not come back in the right shape. Try again." };

    await proposeRun(buildRunnerDeps(store), property.id, {
      kind: "content_draft",
      title: "Website copy for Google",
      params: { summary: `Title: ${copy.title}`, ...copy },
      createdBy: user.id,
    });
    revalidatePath("/", "layout");
    return { copy };
  } catch (e) {
    console.error("[action:seoCopy]", e);
    return { error: "Could not write copy right now. Try again later." };
  }
}
