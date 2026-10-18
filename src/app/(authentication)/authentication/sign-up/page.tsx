import type { Metadata } from "next";
import { SignUpForm } from "@/modules/authentication/components/sign-up-form";

export const metadata: Metadata = { title: "Đăng ký" };

export default function Page() {
  return <SignUpForm />;
}
