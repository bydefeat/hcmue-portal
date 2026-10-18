import { ApplicationLayout } from "@/shared/components/layouts/application";

// ponytail: user và học kỳ là dữ liệu mẫu; giai đoạn auth thay bằng requireRole("student") + học kỳ hiện hành.
const DEMO_USER = { name: "Nguyễn Thị Minh Anh", studentCode: "4901104012" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ApplicationLayout user={DEMO_USER} termLabel="Học kỳ 1 · 2026-2027">
      {children}
    </ApplicationLayout>
  );
}
