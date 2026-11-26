"use client";

/** Friendly fallback for any error that still escapes. Production hides the real message; the server log has it. */
export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[430px] px-4 pt-24 text-center">
      <h1 className="text-[20px] font-semibold">Something went wrong</h1>
      <p className="mt-2 text-[14px] text-muted">We could not load this page. Your data is safe. Try again, and if it keeps happening, check the database setup.</p>
      {error.digest && <p className="mt-2 text-[12px] text-muted">Reference: {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-white">
        Try again
      </button>
    </div>
  );
}
