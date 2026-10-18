import { PublicLayout } from "@/shared/components/layouts/public";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicLayout>{children}</PublicLayout>;
}
