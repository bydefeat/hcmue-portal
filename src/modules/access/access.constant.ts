import type { Permission, Viewer } from "./access.type";

export const DEMO_ROLE_COOKIE = "hcmue-demo-admin-role";

export const PERMISSION_GROUPS: { label: string; permissions: { key: Permission; label: string }[] }[] = [
  {
    label: "Chung",
    permissions: [
      { key: "dashboard.view", label: "Xem trang tổng quan" },
      { key: "announcements.manage", label: "Đăng và gỡ thông báo" },
      { key: "requests.process", label: "Xử lý đơn từ" },
    ],
  },
  {
    label: "Đào tạo",
    permissions: [
      { key: "curriculum.manage", label: "Quản lý chương trình đào tạo, học phần" },
      { key: "class-sections.manage", label: "Mở lớp học phần" },
      { key: "teaching.assign", label: "Phân công giảng dạy" },
      { key: "facilities.manage", label: "Quản lý phòng học" },
    ],
  },
  {
    label: "Học vụ",
    permissions: [
      { key: "registration.manage", label: "Cấu hình đợt đăng ký" },
      { key: "grades.approve", label: "Duyệt bảng điểm cấp khoa" },
      { key: "grades.publish", label: "Công bố điểm" },
      { key: "decisions.manage", label: "Lập quyết định sinh viên" },
      { key: "graduation.manage", label: "Xét tốt nghiệp" },
      { key: "exams.manage", label: "Xếp lịch thi, điều kiện dự thi" },
    ],
  },
  {
    label: "Người dùng",
    permissions: [
      { key: "students.view", label: "Xem hồ sơ sinh viên" },
      { key: "students.manage", label: "Thêm, sửa hồ sơ sinh viên" },
      { key: "lecturers.manage", label: "Quản lý giảng viên" },
      { key: "advisors.assign", label: "Phân công cố vấn" },
    ],
  },
  {
    label: "Báo cáo",
    permissions: [
      { key: "reports.view", label: "Xem thống kê, cảnh báo học vụ" },
      { key: "surveys.view", label: "Xem kết quả khảo sát giảng dạy" },
    ],
  },
  {
    label: "Hệ thống",
    permissions: [
      { key: "settings.manage", label: "Sửa quy chế, lịch năm học" },
      { key: "access.manage", label: "Phân quyền" },
      { key: "audit.view", label: "Xem nhật ký thao tác" },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.key));

export const PERMISSION_LABEL = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => [permission.key, permission.label])),
) as Record<Permission, string>;

export function can(viewer: Pick<Viewer, "permissions">, permission: Permission) {
  return viewer.permissions.includes(permission);
}

export function inScope(viewer: Pick<Viewer, "faculty">, faculty: string) {
  return viewer.faculty === null || viewer.faculty === faculty;
}

export const SCOPE_LABEL = { university: "Toàn trường", faculty: "Theo khoa" } as const;
