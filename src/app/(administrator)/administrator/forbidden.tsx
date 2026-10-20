import type { Metadata } from "next";
import { Button, Card, Result } from "antd";
import { Illustration } from "@/shared/components/ui/illustration";
import { ADMINISTRATOR_NAVIGATION, firstAccessibleHref } from "@/shared/constants/navigation.constant";
import { getViewer } from "@/modules/access/access.query";
import { SignOutButton } from "@/modules/authentication/components/sign-out-button";

export const metadata: Metadata = { title: "Không có quyền truy cập" };

// Nút quay lại dẫn tới trang đầu tiên vai trò hiện tại mở được, không dẫn về /administrator khi vai trò không có quyền xem tổng quan
// (bấm lại vẫn 403). Tài khoản chưa có vai trò nào thì chỉ hướng dẫn liên hệ quản trị và cho đăng xuất.
export default async function Forbidden() {
  const viewer = await getViewer();
  const home = firstAccessibleHref(ADMINISTRATOR_NAVIGATION, viewer.permissions, { schoolWide: viewer.faculty === null });
  const hasRole = viewer.assignmentId !== null;
  return (
    <Card>
      <Result
        icon={<Illustration name="forbidden" className="mx-auto w-48 sm:w-60" />}
        title={<h1 className="text-xl font-semibold">{hasRole ? "Bạn chưa được cấp quyền xem trang này" : "Tài khoản chưa được cấp vai trò quản trị"}</h1>}
        subTitle={
          hasRole
            ? `Vai trò ${viewer.roleName} không gồm quyền cần cho chức năng này. Liên hệ quản trị hệ thống của Phòng Đào tạo để được cấp quyền.`
            : "Tài khoản đã đăng nhập được nhưng chưa có vai trò nào trên cổng quản trị. Liên hệ quản trị hệ thống của Phòng Đào tạo, báo mã cán bộ để được cấp vai trò."
        }
        extra={
          home ? (
            <Button type="primary" href={home}>
              Về trang chính
            </Button>
          ) : (
            <SignOutButton primary />
          )
        }
      />
    </Card>
  );
}
