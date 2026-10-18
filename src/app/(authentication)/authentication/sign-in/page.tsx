import type { Metadata } from "next";
import { SignInForm } from "@/modules/authentication/components/sign-in-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function Page({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return <SignInForm defaultEmail={email} />;
}
