import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/modules/authentication/authentication.constant";
import { getSession } from "@/modules/authentication/authentication.query";
import { SignInForm } from "@/modules/authentication/components/sign-in-form";
import { landingAfterSignIn, parseRoles } from "@/shared/constants/role.constant";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function Page({ searchParams }: { searchParams: Promise<{ username?: string; next?: string }> }) {
  const [{ username, next }, session] = await Promise.all([searchParams, getSession()]);
  const nextPath = safeNextPath(next);
  if (session) redirect(landingAfterSignIn(parseRoles(session.user.role), nextPath));
  return <SignInForm defaultUsername={username} next={nextPath} />;
}
