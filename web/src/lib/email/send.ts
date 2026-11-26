export type OutboxRow = { maskedEmail: string; subject: string; status: "sent" | "failed" | "not_sent"; error?: string };

export type SendDeps = {
  /** Resend API key. Without one nothing is sent. */
  apiKey?: string;
  recordOutbox: (rows: OutboxRow[]) => Promise<void>;
  fetchImpl?: typeof fetch;
};

export type SendInput = {
  from: string;
  replyTo: string;
  subject: string;
  recipients: string[];
  /** Per-guest content, so each email carries that guest's own unsubscribe link. */
  render: (email: string) => { html: string; text: string; unsubscribeUrl: string };
  suppressed?: string[];
};

export const maskEmail = (email: string) => {
  const at = email.lastIndexOf("@");
  return at <= 0 ? "***" : `${email[0]}***${email.slice(at)}`;
};

/**
 * Sends one email per guest through Resend. With no API key it sends nothing and records each message in the outbox.
 * An address on the suppression list is skipped even if it was passed in.
 */
export async function sendCampaign(deps: SendDeps, a: SendInput): Promise<{ sent: number; skipped: number; mode: "sent" | "outbox" }> {
  const blocked = new Set((a.suppressed ?? []).map((s) => s.trim().toLowerCase()));
  const targets = a.recipients.filter((r) => !blocked.has(r.trim().toLowerCase()));
  let skipped = a.recipients.length - targets.length;
  const rows: OutboxRow[] = [];
  let sent = 0;

  if (!deps.apiKey) {
    await deps.recordOutbox(targets.map((t) => ({ maskedEmail: maskEmail(t), subject: a.subject, status: "not_sent" as const })));
    return { sent: 0, skipped, mode: "outbox" };
  }

  const doFetch = deps.fetchImpl ?? fetch;
  for (const to of targets) {
    const m = a.render(to);
    try {
      const res = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: a.from,
          to: [to],
          reply_to: a.replyTo || undefined,
          subject: a.subject,
          html: m.html,
          text: m.text,
          headers: { "List-Unsubscribe": `<${m.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        }),
      });
      if (res.ok) {
        sent++;
        rows.push({ maskedEmail: maskEmail(to), subject: a.subject, status: "sent" });
      } else {
        skipped++;
        rows.push({ maskedEmail: maskEmail(to), subject: a.subject, status: "failed", error: `The email service answered ${res.status}.` });
      }
    } catch {
      skipped++;
      rows.push({ maskedEmail: maskEmail(to), subject: a.subject, status: "failed", error: "Could not reach the email service." });
    }
  }
  await deps.recordOutbox(rows);
  return { sent, skipped, mode: "sent" };
}
