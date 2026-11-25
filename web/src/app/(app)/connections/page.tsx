import { Suspense } from "react";
import { connection } from "next/server";
import { ShieldCheck } from "lucide-react";

import { ConnectCard, type PublicProvider } from "@/components/connect-form";
import { ImportForm } from "@/components/import-form";
import { Notice, PageHeader, Section } from "@/components/page-kit";
import { PageSkeleton } from "@/components/skeleton";
import { IMPORT_KINDS } from "@/lib/domain/import/parsers";
import { PROVIDER_LIST } from "@/lib/integrations/providers";
import { encryptionConfigured } from "@/lib/security/credentials";
import { requireProperty } from "@/lib/session";

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConnectionsView />
    </Suspense>
  );
}

const TEMPLATES: Record<string, string> = {
  bookings: "/templates/bookings.csv",
  bank: "/templates/bank-summary.csv",
  utilities: "/templates/utility-bills.csv",
  schedule: "/templates/employee-schedule.csv",
  expenses: "/templates/invoices.csv",
};

async function ConnectionsView() {
  await connection();
  const { store, property } = await requireProperty();
  const [connections, imports] = await Promise.all([store.listConnections(property.id), store.listImports(property.id, 10)]);
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const secureReady = encryptionConfigured();

  // Strip the validation schema: only plain data goes to the browser.
  const providers: PublicProvider[] = PROVIDER_LIST.map(({ id, name, tagline, fields, syncs, howTo }) => ({ id, name, tagline, fields, syncs, howTo }));
  const kinds = IMPORT_KINDS.map((k) => ({ ...k, template: TEMPLATES[k.kind] }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Connections" subtitle="Bring your data in. Connect a system to keep it updated automatically, or upload files." />

      <Section title="Connect your PMS" eyebrow="Automatic">
        <p className="text-[13px] text-muted">A live connection keeps bookings, occupancy and rates up to date without any uploads.</p>
        {providers.map((p) => {
          const c = byProvider.get(p.id as "cloudbeds");
          return (
            <ConnectCard
              key={p.id}
              provider={p}
              secureStorageReady={secureReady}
              connection={c ? { status: c.status, clearFields: c.clearFields, secretMasks: c.secretMasks, message: c.message } : null}
            />
          );
        })}
        <div className="flex gap-3 rounded-2xl border border-hairline bg-surface p-4 text-[13px]">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden />
          <div>
            <p className="font-semibold">How we protect your credentials</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-muted">
              <li>Encrypted with AES-256 on our server before they are stored.</li>
              <li>Tied to your property, so they cannot be reused elsewhere.</li>
              <li>Never shown again after you save, and never sent to your browser.</li>
              <li>Only you can see your data. Use read-only keys where the system allows.</li>
            </ul>
            <p className="mt-2 text-muted">Live sync from these systems is added next. Your saved credentials will be used then.</p>
          </div>
        </div>
      </Section>

      <Section title="Import files" eyebrow="Upload" id="import">
        <p className="text-[13px] text-muted">Anything not connected yet can be uploaded. Whenever a live connection is available, we recommend it over files.</p>
        <ImportForm kinds={kinds} />

        <Notice tone="later">
          <strong className="text-ink">Receipts and invoice photos or PDFs</strong> — coming next. For now, list them in the invoices template, or upload your bank summary and we will pick the charges up from there.
        </Notice>

        <h3 className="mt-2 text-[14px] font-semibold">Recent uploads</h3>
        {imports.length === 0 ? (
          <p className="text-[13px] text-muted">Nothing uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface">
            {imports.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{i.filename}</span>
                  <span className="text-[12px] text-muted">
                    {i.kind} · {i.createdAt.toISOString().slice(0, 10)}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[12px]">
                  <span className="block font-semibold text-green">{i.rowsOk} {i.rowsOk === 1 ? "row" : "rows"}</span>
                  {i.rowsFailed > 0 && <span className="text-amber">{i.rowsFailed} skipped</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
