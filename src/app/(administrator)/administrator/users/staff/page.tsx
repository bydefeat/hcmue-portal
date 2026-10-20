import type { Metadata } from "next";
import { getRoles, requireSchoolWidePermission } from "@/modules/access/access.query";
import { getFacultyNames } from "@/modules/curriculum/curriculum.query";
import { StaffTable } from "@/modules/users/components/staff-table";
import { NO_ACCOUNT } from "@/modules/users/users.constant";
import { getAccountStates, getStaffMembers } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Cán bộ" };

// Cán bộ (không phải giảng viên): tài khoản cổng quản trị, chỉ người phân quyền phạm vi toàn trường quản lý.
export default async function Page() {
  const viewer = await requireSchoolWidePermission("access.manage");
  const [staff, accounts, roles, faculties] = await Promise.all([getStaffMembers(), getAccountStates("staff"), getRoles(), getFacultyNames()]);
  const withoutRole = staff.filter((member) => member.userId && member.roles.length === 0).length;

  return (
    <StaffTable
      // Thêm cán bộ xong trang tải lại dữ liệu; đổi key để bảng nhận danh sách mới.
      key={staff.length}
      header={{
        title: "Cán bộ",
        description: `${staff.length} cán bộ có hồ sơ.${withoutRole > 0 ? ` ${withoutRole} tài khoản chưa có vai trò quản trị nên chưa vào được cổng quản trị.` : ""} Vai trò cấp ở trang Phân quyền.`,
      }}
      staff={staff.map((member) => ({ ...member, account: accounts[member.id] ?? NO_ACCOUNT }))}
      roles={roles.map(({ id, name, scope }) => ({ id, name, scope }))}
      faculties={faculties}
      currentUserId={viewer.id}
    />
  );
}
