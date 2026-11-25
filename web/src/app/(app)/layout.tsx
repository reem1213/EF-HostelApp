import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto w-full max-w-[430px] flex-1 px-4 pb-28 pt-6">{children}</main>
      <BottomNav />
    </>
  );
}
