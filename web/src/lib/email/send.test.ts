import { describe, expect, it } from "vitest";

import { sendCampaign, type OutboxRow } from "./send";

const base = {
  from: "Roam Quarter Hostel via HostelPulse <hello@mail.example>",
  replyTo: "hello@roam.example",
  subject: "Welcome back",
  recipients: ["a@example.com", "b@example.com"],
  render: (email: string) => ({ html: `<p>hi ${email}</p>`, text: `hi ${email}`, unsubscribeUrl: `https://app.example/unsubscribe/${email}` }),
};

describe("sendCampaign", () => {
  it("with no API key writes to the outbox and sends nothing", async () => {
    const rows: OutboxRow[] = [];
    let calls = 0;
    const r = await sendCampaign({ recordOutbox: async (x) => void rows.push(...x), fetchImpl: async () => (calls++, new Response("{}")) }, base);
    expect(r).toEqual({ sent: 0, skipped: 0, mode: "outbox" });
    expect(calls).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows.every((x) => x.status === "not_sent")).toBe(true);
  });

  it("with a key sends one email per guest through Resend, with reply-to and unsubscribe headers", async () => {
    const rows: OutboxRow[] = [];
    const bodies: Record<string, unknown>[] = [];
    const r = await sendCampaign(
      { apiKey: "re_test", recordOutbox: async (x) => void rows.push(...x), fetchImpl: async (_u, init) => (bodies.push(JSON.parse(String(init?.body))), new Response('{"id":"1"}', { status: 200 })) },
      base,
    );
    expect(r).toEqual({ sent: 2, skipped: 0, mode: "sent" });
    expect(bodies[0]).toMatchObject({ from: base.from, to: ["a@example.com"], reply_to: "hello@roam.example", subject: "Welcome back" });
    expect((bodies[0].headers as Record<string, string>)["List-Unsubscribe"]).toContain("https://app.example/unsubscribe/a@example.com");
    expect((bodies[0].headers as Record<string, string>)["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(rows.map((x) => x.status)).toEqual(["sent", "sent"]);
  });

  it("counts a failed send as skipped and keeps going", async () => {
    const rows: OutboxRow[] = [];
    let n = 0;
    const r = await sendCampaign({ apiKey: "re_test", recordOutbox: async (x) => void rows.push(...x), fetchImpl: async () => (n++ === 0 ? new Response("bad", { status: 422 }) : new Response("{}", { status: 200 })) }, base);
    expect(r).toEqual({ sent: 1, skipped: 1, mode: "sent" });
    expect(rows.map((x) => x.status)).toEqual(["failed", "sent"]);
  });

  it("never sends to an address on the suppression list, even if it is in the recipients", async () => {
    let calls = 0;
    const r = await sendCampaign({ apiKey: "re_test", recordOutbox: async () => {}, fetchImpl: async () => (calls++, new Response("{}")) }, { ...base, suppressed: ["A@example.com"] });
    expect(calls).toBe(1);
    expect(r).toEqual({ sent: 1, skipped: 1, mode: "sent" });
  });

  it("masks addresses in the outbox rows it records", async () => {
    const rows: OutboxRow[] = [];
    await sendCampaign({ recordOutbox: async (x) => void rows.push(...x) }, base);
    expect(rows[0].maskedEmail).toBe("a***@example.com");
  });
});

describe("sendCampaign under a rate limit", () => {
  it("waits and retries when the provider says slow down, then succeeds", async () => {
    const rows: OutboxRow[] = [];
    let n = 0;
    const waits: number[] = [];
    const r = await sendCampaign(
      { apiKey: "re_test", recordOutbox: async (x) => void rows.push(...x), fetchImpl: async () => (n++ < 2 ? new Response("slow", { status: 429 }) : new Response("{}", { status: 200 })), sleep: async (ms) => void waits.push(ms) },
      { ...base, recipients: ["a@example.com"] },
    );
    expect(r).toEqual({ sent: 1, skipped: 0, mode: "sent" });
    expect(n).toBe(3);
    expect(waits.length).toBeGreaterThan(0);
  });

  it("records what was sent so far even if the loop is cut short", async () => {
    const rows: OutboxRow[] = [];
    let n = 0;
    await expect(
      sendCampaign(
        { apiKey: "re_test", recordOutbox: async (x) => void rows.push(...x), fetchImpl: async () => { if (n++ === 1) throw new Error("boom"); return new Response("{}", { status: 200 }); }, sleep: async () => {} },
        { ...base, recipients: ["a@example.com", "b@example.com", "c@example.com"] },
      ),
    ).resolves.toMatchObject({ sent: 2, skipped: 1 });
    expect(rows).toHaveLength(3);
  });
});
