import { NextResponse, type NextRequest } from "next/server";
import { authenticationProxy } from "@/proxies/authentication.proxy";

export function proxy(request: NextRequest) {
  return authenticationProxy(request) ?? NextResponse.next();
}

export const config = {
  matcher: ["/application/:path*", "/lecturer/:path*", "/administrator/:path*"],
};
