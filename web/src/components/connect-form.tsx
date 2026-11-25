"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Lock, PlugZap, Trash2 } from "lucide-react";

import { connectProvider, disconnectProvider } from "@/app/actions/connections";
import { idle } from "@/app/actions/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/input";

export type PublicProvider = {
  id: string;
  name: string;
  tagline: string;
  fields: { key: string; label: string; secret: boolean; placeholder?: string; help?: string }[];
  syncs: string[];
  howTo: string[];
};

export type PublicConnection = {
  status: "saved_unverified" | "connected" | "error";
  clearFields: Record<string, string>;
  secretMasks: Record<string, string>;
  message: string | null;
} | null;

/** One PMS card. Secrets are sent to the server once, encrypted there, and only a masked preview comes back. */
export function ConnectCard({ provider, connection, secureStorageReady }: { provider: PublicProvider; connection: PublicConnection; secureStorageReady: boolean }) {
  const [state, action, pending] = useActionState(connectProvider, idle);
  const [removing, startRemove] = useTransition();
  const [open, setOpen] = useState(false);
  const saved = connection !== null;

  return (
    <article className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-soft">
          {saved ? <CheckCircle2 className="size-5 text-teal" aria-hidden /> : <PlugZap className="size-5 text-teal" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold">{provider.name}</h3>
            {saved && <Badge tone={connection.status === "error" ? "high" : "good"}>{connection.status === "connected" ? "Connected" : "Saved"}</Badge>}
          </div>
          <p className="text-[13px] text-muted">{provider.tagline}</p>
        </div>
      </div>

      {saved && (
        <div className="mt-3 rounded-xl bg-bg px-3.5 py-2.5 text-[13px]">
          <ul className="space-y-0.5">
            {provider.fields.map((f) => (
              <li key={f.key} className="flex justify-between gap-3">
                <span className="text-muted">{f.label}</span>
                <span className="font-mono">{f.secret ? (connection.secretMasks[f.key] ?? "••••") : (connection.clearFields[f.key] ?? "—")}</span>
              </li>
            ))}
          </ul>
          {connection.message && <p className="mt-2 text-[12.5px] text-muted">{connection.message}</p>}
        </div>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-3 text-[13.5px] font-semibold text-teal">
        {open ? "Hide" : saved ? "Update credentials" : "Connect"}
      </button>

      {open && (
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-teal">Where to find these</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px]">
            {provider.howTo.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] font-semibold uppercase tracking-wider text-teal">What we will pull</p>
          <p className="mt-1 text-[13px] text-muted">{provider.syncs.join(" · ")}</p>

          {!secureStorageReady && (
            <p className="mt-3 rounded-xl bg-amber/10 px-3.5 py-2.5 text-[12.5px] text-amber">
              Secure storage is not set up on this server yet, so credentials cannot be saved. Ask your admin to add <code>CREDENTIALS_ENCRYPTION_KEY</code>.
            </p>
          )}

          <form action={action} className="mt-4 flex flex-col gap-3" noValidate autoComplete="off">
            <input type="hidden" name="provider" value={provider.id} />
            {provider.fields.map((f) => (
              <Field key={f.key} label={f.label} name={`${provider.id}-${f.key}`} error={state.fieldErrors?.[f.key]} help={f.help}>
                <Input
                  id={`${provider.id}-${f.key}`}
                  name={f.key}
                  type={f.secret ? "password" : "text"}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  defaultValue={f.secret ? undefined : state.values?.[f.key]}
                  required
                />
              </Field>
            ))}
            <p className="flex items-start gap-2 text-[12px] text-muted">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Encrypted on our server before it is stored. We never show it again and never share it. Use a read-only key.
            </p>
            <FormMessage {...state} />
            <Button type="submit" disabled={pending || !secureStorageReady}>
              {pending ? "Saving securely…" : saved ? "Update connection" : `Save ${provider.name} connection`}
            </Button>
          </form>

          {saved && (
            <Button variant="ghost" size="sm" className="mt-2 text-red" disabled={removing} onClick={() => startRemove(async () => void (await disconnectProvider(provider.id)))}>
              <Trash2 className="size-4" aria-hidden />
              Remove connection
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
