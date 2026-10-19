import { NextResponse, type NextRequest } from "next/server";
import { authenticationProxy } from "@/proxies/authentication.proxy";
import { routeParamProxy } from "@/proxies/route-param.proxy";

export function proxy(request: NextRequest) {
  return routeParamProxy(request) ?? authenticationProxy(request) ?? NextResponse.next();
}

export const config = {
  matcher: ["/application/:path*", "/lecturer/:path*", "/administrator/:path*"],
};
