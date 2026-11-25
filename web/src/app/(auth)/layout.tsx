export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center px-4 py-10">
      <p className="mb-6 text-center font-serif text-[34px] font-semibold">HostelPulse</p>
      {children}
    </main>
  );
}
