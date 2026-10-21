import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/shared/libs/id.lib";

const UUID_ROUTES = [/^\/administrator\/programs\/([^/]+)/, /^\/lecturer\/classes\/([^/]+)/, /^\/application\/classes\/([^/]+)/];

export function routeParamProxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  for (const pattern of UUID_ROUTES) {
    const match = pattern.exec(pathname);
    if (match && !isUuid(match[1])) {
      const portal = pathname.split("/")[1];
      return NextResponse.rewrite(new URL(`/${portal}/khong-tim-thay`, request.url), { status: 404 });
    }
  }
  return null;
}
