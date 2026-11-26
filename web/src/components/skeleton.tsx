export function PageSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="mx-auto h-9 w-44 rounded bg-hairline" />
      <div className="h-44 rounded-[18px] bg-dark/80" />
      <div className="h-28 rounded-2xl bg-hairline" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-2xl bg-hairline" />
        <div className="h-24 rounded-2xl bg-hairline" />
      </div>
    </div>
  );
}
