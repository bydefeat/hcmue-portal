import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/shared/libs/id.lib";

// Route có tham số là uuid. Sai định dạng thì chuyển ngay ở đây sang đường dẫn không có trong cổng: route bắt mọi đường dẫn sai
// của cổng (nhóm (portal-not-found), không nằm dưới loading.tsx) trả 404 thật trong khung cổng. Kiểm ở page bằng notFound()
// vẫn ra trang 404 nhưng mã HTTP là 200 vì loading.tsx đã bắt đầu stream. Thêm route vào đây khi nối dữ liệu thật cho module đó.
const UUID_ROUTES = [/^\/administrator\/programs\/([^/]+)/, /^\/lecturer\/classes\/([^/]+)/];

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
