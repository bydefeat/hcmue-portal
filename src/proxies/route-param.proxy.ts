import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/shared/libs/id.lib";

// Route có tham số là uuid. Sai định dạng thì trả 404 ngay ở đây: kiểm ở page bằng notFound() vẫn ra trang 404
// nhưng mã HTTP là 200 vì loading.tsx đã bắt đầu stream. Thêm route vào đây khi nối dữ liệu thật cho module đó.
const UUID_ROUTES = [/^\/administrator\/programs\/([^/]+)/];

export function routeParamProxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  for (const pattern of UUID_ROUTES) {
    const match = pattern.exec(pathname);
    if (match && !isUuid(match[1])) {
      return NextResponse.rewrite(new URL("/khong-tim-thay", request.url), { status: 404 });
    }
  }
  return null;
}
