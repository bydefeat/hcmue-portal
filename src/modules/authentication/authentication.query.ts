import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/modules/authentication/authentication.lib";
import { AUTH_PATHNAME_HEADER } from "@/modules/authentication/authentication.constant";
import { parseRoles, type AccountRole } from "@/shared/constants/role.constant";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

// Gọi ở đầu mỗi query đọc dữ liệu thật: layout và page render song song nên không dựa được vào kiểm tra ở layout.
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    const pathname = (await headers()).get(AUTH_PATHNAME_HEADER);
    redirect(pathname ? `/authentication/sign-in?next=${encodeURIComponent(pathname)}` : "/authentication/sign-in");
  }
  return { ...session, roles: parseRoles(session.user.role) };
}

// Gọi ở layout của từng portal. Chưa đăng nhập thì về trang đăng nhập (kèm ?next= để quay lại), sai vai trò thì hiện trang 403.
export async function requireRole(role: AccountRole) {
  const session = await requireSession();
  if (!session.roles.includes(role)) forbidden();
  return session;
}
