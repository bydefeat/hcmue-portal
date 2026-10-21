export type AppRole = "student" | "lecturer" | "advisor" | "admin";

export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/administrator",
  lecturer: "/lecturer",
  advisor: "/lecturer",
  student: "/application/dashboard",
};

export const ROLE_PRIORITY: AppRole[] = ["admin", "lecturer", "advisor", "student"];

export function landingOf(roles: AppRole[]) {
  const role = ROLE_PRIORITY.find((entry) => roles.includes(entry)) ?? "student";
  return ROLE_HOME[role];
}

export type AccountRole = Exclude<AppRole, "advisor">;

const ACCOUNT_ROLES: AccountRole[] = ["student", "lecturer", "admin"];

export function parseRoles(value: string | null | undefined): AccountRole[] {
  return (value ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is AccountRole => ACCOUNT_ROLES.includes(role as AccountRole));
}

const PORTAL_ROLE: [prefix: string, role: AccountRole][] = [
  ["/application", "student"],
  ["/lecturer", "lecturer"],
  ["/administrator", "admin"],
];

const SAFE_PATH_BASE = "http://portal.invalid";

export function safeInternalPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/")) return null;
  if ([...value].some((char) => char === "\\" || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) return null;
  try {
    const url = new URL(value, SAFE_PATH_BASE);
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (url.origin !== SAFE_PATH_BASE || path.startsWith("//") || url.pathname.startsWith("/authentication") || url.pathname.startsWith("/api/")) return null;
    return path;
  } catch {
    return null;
  }
}

export function landingAfterSignIn(roles: AccountRole[], rawNext: string | null | undefined) {
  const next = safeInternalPath(rawNext);
  if (next) {
    const portal = PORTAL_ROLE.find(([prefix]) => next === prefix || next.startsWith(`${prefix}/`) || next.startsWith(`${prefix}?`));
    if (!portal || roles.includes(portal[1])) return next;
  }
  return landingOf(roles);
}
