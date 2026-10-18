import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/modules/authentication/components/forgot-password-form";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default async function Page({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return <ForgotPasswordForm defaultEmail={email} />;
}
