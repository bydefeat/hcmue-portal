import type { Metadata } from "next";
import { VerifyForm } from "@/modules/authentication/components/verify-form";

export const metadata: Metadata = { title: "Xác minh email" };

export default async function Page({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return <VerifyForm email={email} />;
}
