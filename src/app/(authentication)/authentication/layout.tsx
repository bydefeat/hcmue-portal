import { AuthenticationLayout } from "@/shared/components/layouts/authentication";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthenticationLayout>{children}</AuthenticationLayout>;
}
