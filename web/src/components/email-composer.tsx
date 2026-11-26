"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";

import { proposeCampaignAction } from "@/app/actions/emails";
import { idle } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/input";
import { renderEmail, TEMPLATE_INFO, type TemplateId } from "@/lib/email/templates";
import { cn } from "@/lib/utils";

type Props = { hostelName: string; postalAddress: string; replyTo: string; audience: number; blockedReason: string | null };

/** Pick a template, see exactly what guests will get, and send it for approval. */
export function EmailComposer({ hostelName, postalAddress, replyTo, audience, blockedReason }: Props) {
  const [state, action, pending] = useActionState(proposeCampaignAction, idle);
  const [template, setTemplate] = useState<TemplateId>((state.values?.template as TemplateId) || "welcome_back");
  const [code, setCode] = useState(state.values?.code ?? "");
  const [pct, setPct] = useState(state.values?.discountPct ?? "");

  const preview = useMemo(() => {
    const n = Number(pct);
    return renderEmail(template, {
      hostelName,
      postalAddress: postalAddress || "Your postal address will appear here",
      replyTo,
      unsubscribeUrl: "https://example.com/unsubscribe/preview",
      code: /^[A-Za-z0-9_-]{1,30}$/.test(code) ? code : undefined,
      discountPct: Number.isInteger(n) && n >= 1 && n <= 90 ? n : undefined,
    });
  }, [template, code, pct, hostelName, postalAddress, replyTo]);

  const e = state.fieldErrors;
  return (
    <form action={action} noValidate className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4">
      <fieldset>
        <legend className="text-[14px] font-semibold">Template</legend>
        <div className="mt-2 flex flex-col gap-2">
          {(Object.keys(TEMPLATE_INFO) as TemplateId[]).map((id) => (
            <label key={id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", template === id ? "border-teal bg-teal-soft/50" : "border-hairline")}>
              <input type="radio" name="template" value={id} checked={template === id} onChange={() => setTemplate(id)} className="mt-1 size-4 accent-[#1f5e5a]" />
              <span>
                <span className="block text-[14px] font-semibold">{TEMPLATE_INFO[id].name}</span>
                <span className="block text-[13px] text-muted">{TEMPLATE_INFO[id].blurb}</span>
              </span>
            </label>
          ))}
        </div>
        {e?.template && <p className="mt-1 text-[12.5px] text-red">{e.template}</p>}
      </fieldset>

      {template !== "review_request" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direct code (optional)" name="code" error={e?.code}>
            <Input id="code" name="code" value={code} onChange={(ev) => setCode(ev.target.value)} placeholder="BACK10" maxLength={30} />
          </Field>
          <Field label="Discount % (optional)" name="discountPct" error={e?.discountPct}>
            <Input id="discountPct" name="discountPct" inputMode="numeric" value={pct} onChange={(ev) => setPct(ev.target.value)} placeholder="10" />
          </Field>
        </div>
      )}
      {template === "review_request" && (
        <>
          <input type="hidden" name="code" value="" />
          <input type="hidden" name="discountPct" value="" />
        </>
      )}

      <div>
        <p className="text-[14px] font-semibold">Preview</p>
        <p className="mt-1 text-[13px] text-muted">Subject: {preview.subject}</p>
        <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="mt-2 h-80 w-full rounded-xl border border-hairline bg-white" />
      </div>

      <p className="text-[13.5px]">
        {audience > 0 ? (
          <>
            This will go to <strong>{audience}</strong> past guest{audience === 1 ? "" : "s"}.
          </>
        ) : (
          "There are no guests with usable email addresses yet."
        )}
      </p>
      {blockedReason && (
        <p role="alert" className="rounded-xl bg-red/10 px-3.5 py-2.5 text-[13px] text-red">
          {blockedReason}{" "}
          <Link href="/more" className="font-semibold underline">
            Go to More
          </Link>
        </p>
      )}
      <FormMessage {...state} />
      {state.ok && (
        <Link href="/actions" className="text-[13.5px] font-semibold text-teal">
          Open Actions to approve
        </Link>
      )}
      <Button type="submit" disabled={pending || audience === 0 || blockedReason !== null}>
        <Send className="size-4" aria-hidden />
        {pending ? "Preparing…" : "Prepare for approval"}
      </Button>
    </form>
  );
}
