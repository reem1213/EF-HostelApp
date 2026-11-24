export function ComingSoon({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="pt-24 text-center">
      <h1 className="font-serif text-[34px] font-semibold">{title}</h1>
      <p className="mt-2 text-muted">{summary}</p>
      <p className="mt-3 font-semibold text-teal">Coming next</p>
    </div>
  );
}
