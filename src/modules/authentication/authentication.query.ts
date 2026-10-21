import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/modules/authentication/authentication.lib";
import { AUTH_PATHNAME_HEADER } from "@/modules/authentication/authentication.constant";
import { session as sessions, user as users } from "@/modules/authentication/authentication.schema";
import { db } from "@/shared/libs/db.lib";
import { parseRoles, type AccountRole } from "@/shared/constants/role.constant";

export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [row] = await db
    .select({ banned: users.banned })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.token, session.session.token));
  return row && !row.banned ? session : null;
});

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    const pathname = (await headers()).get(AUTH_PATHNAME_HEADER);
    redirect(pathname ? `/authentication/sign-in?next=${encodeURIComponent(pathname)}` : "/authentication/sign-in");
  }
  return { ...session, roles: parseRoles(session.user.role) };
}

export async function requireRole(role: AccountRole) {
  const session = await requireSession();
  if (!session.roles.includes(role)) forbidden();
  return session;
}
