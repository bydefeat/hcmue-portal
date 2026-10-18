import type { Metadata } from "next";
import { SignInForm } from "@/modules/authentication/components/sign-in-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function Page({ searchParams }: { searchParams: Promise<{ username?: string }> }) {
  const { username } = await searchParams;
  return <SignInForm defaultUsername={username} />;
}
