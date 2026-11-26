"use client";

import { useState, useTransition } from "react";
import { Copy, Wand2 } from "lucide-react";

import { generateSeoCopyAction, type SeoCopyResult } from "@/app/actions/seo";
import { Button } from "@/components/ui/button";

const Block = ({ label, text }: { label: string; text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl bg-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-muted">{label}</p>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {})}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-semibold text-teal outline-offset-2 focus-visible:outline-2 focus-visible:outline-teal"
        >
          <Copy className="size-3.5" aria-hidden />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-[14px]">{text}</p>
    </div>
  );
};

/** Asks for ready-to-paste copy. Publishing it on the site is manual until a site-builder connection exists. */
export function SeoCopyGenerator() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<SeoCopyResult | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Button disabled={pending} onClick={() => start(async () => setRes(await generateSeoCopyAction()))}>
        <Wand2 className="size-4" aria-hidden />
        {pending ? "Writing…" : "Generate copy"}
      </Button>
      {res?.error && (
        <p role="alert" className="text-[13px] text-red">
          {res.error}
        </p>
      )}
      {res?.copy && (
        <div className="flex flex-col gap-2">
          <Block label="Page title" text={res.copy.title} />
          <Block label="Search description" text={res.copy.description} />
          <Block label="Home page introduction" text={res.copy.intro} />
          <p className="text-[12.5px] text-muted">This is a draft. Paste it into your website yourself; we cannot publish to your site yet. It is also saved in Actions.</p>
        </div>
      )}
    </div>
  );
}
