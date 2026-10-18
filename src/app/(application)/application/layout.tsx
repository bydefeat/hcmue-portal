import { ApplicationLayout } from "@/shared/components/layouts/application";

const DEMO_USER = { name: "Nguyễn Thị Minh Anh", code: "4901104012" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ApplicationLayout user={DEMO_USER} termLabel="Học kỳ 1 · 2026-2027">
      {children}
    </ApplicationLayout>
  );
}
