import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { AUTH_COOKIE_PREFIX, AUTH_PATHNAME_HEADER } from "@/modules/authentication/authentication.constant";

const PROTECTED_PREFIXES = ["/application", "/lecturer", "/administrator"];

export function authenticationProxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!isProtected) return null;

  if (!getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })) {
    const signIn = new URL("/authentication/sign-in", request.url);
    signIn.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  const headers = new Headers(request.headers);
  headers.set(AUTH_PATHNAME_HEADER, `${pathname}${search}`);
  return NextResponse.next({ request: { headers } });
}
