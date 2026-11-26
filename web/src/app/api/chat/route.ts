import Anthropic from "@anthropic-ai/sdk";

import { buildChatContext, CHAT_MODEL, chatRequestSchema, makeRateLimiter, systemPrompt } from "@/lib/chat";
import { loadDashboard } from "@/lib/dashboard";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

// 20 questions per 10 minutes per user.
const allow = makeRateLimiter(20, 10 * 60_000);

const json = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return json(401, "Please sign in.");

  if (!process.env.ANTHROPIC_API_KEY) {
    return json(503, "The assistant is not switched on yet. Add ANTHROPIC_API_KEY on the server to enable it.");
  }
  if (!allow(session.user.id)) return json(429, "That's a lot of questions. Please wait a few minutes.");

  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, "Invalid request.");

  const property = await session.store.getProperty(session.user.id);
  if (!property) return json(400, "Finish setting up your property first.");

  // The model reads the user's own data, rebuilt on the server for every request.
  const context = buildChatContext(await loadDashboard(session.store, property));

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 800,
    system: systemPrompt(context),
    messages: parsed.data.messages,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        stream.on("text", (t) => controller.enqueue(encoder.encode(t)));
        await stream.finalMessage();
      } catch {
        controller.enqueue(encoder.encode("\n\nSorry, something went wrong. Please try again."));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
