import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/modules/authentication/components/forgot-password-form";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default async function Page({ searchParams }: { searchParams: Promise<{ email?: string; activate?: string }> }) {
  const { email, activate } = await searchParams;
  return <ForgotPasswordForm defaultEmail={typeof email === "string" ? email : undefined} isActivation={activate === "1"} />;
}
