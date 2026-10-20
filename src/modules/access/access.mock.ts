import { mockDate } from "@/shared/libs/mock.lib";
import { ALL_PERMISSIONS } from "@/modules/access/access.constant";
import type { Permission, Role, RoleAssignment } from "@/modules/access/access.type";

const without = (...excluded: Permission[]) => ALL_PERMISSIONS.filter((permission) => !excluded.includes(permission));

export const ROLES: Role[] = [
  {
    id: "system-admin",
    name: "Quản trị hệ thống",
    description: "Toàn quyền, gồm phân quyền và cấu hình quy chế.",
    scope: "university",
    permissions: ALL_PERMISSIONS,
    isSystem: true,
  },
  {
    id: "academic-head",
    name: "Trưởng phòng Đào tạo",
    description: "Duyệt và công bố điểm, ký quyết định, xem mọi báo cáo.",
    scope: "university",
    permissions: without("access.manage"),
    isSystem: true,
  },
  {
    id: "academic-officer",
    name: "Chuyên viên Phòng Đào tạo",
    description: "Vận hành đăng ký học phần, lớp học phần, hồ sơ sinh viên và đơn từ.",
    scope: "university",
    permissions: without(
      "access.manage",
      "settings.manage",
      "grades.publish",
      "graduation.manage",
      "audit.view",
      "tuition.manage",
      "requests.step.faculty",
      "requests.step.exam-office",
      "requests.supervise",
    ),
    isSystem: true,
  },
  {
    id: "faculty-secretary",
    name: "Giáo vụ khoa",
    description: "Chỉ thấy sinh viên, lớp và bảng điểm của khoa mình; duyệt điểm cấp khoa.",
    scope: "faculty",
    permissions: [
      "dashboard.view",
      "requests.process",
      "requests.step.faculty",
      "class-sections.manage",
      "teaching.assign",
      "grades.approve",
      "students.view",
      "advisors.assign",
      "reports.view",
    ],
    isSystem: false,
  },
  {
    id: "exam-office",
    name: "Phòng Khảo thí",
    description: "Xếp lịch thi, phòng thi, cán bộ coi thi, xử lý phúc khảo.",
    scope: "university",
    permissions: ["dashboard.view", "exams.manage", "requests.process", "requests.step.exam-office", "students.view", "facilities.manage"],
    isSystem: false,
  },
  {
    id: "finance-office",
    name: "Phòng Kế hoạch - Tài chính",
    description: "Ghi nhận học phí, nhập sao kê ngân hàng, hủy khoản ghi nhầm.",
    scope: "university",
    permissions: ["dashboard.view", "tuition.manage", "students.view"],
    isSystem: false,
  },
  {
    id: "board-viewer",
    name: "Ban Giám hiệu",
    description: "Chỉ xem tổng quan, thống kê và khảo sát.",
    scope: "university",
    permissions: ["dashboard.view", "reports.view", "surveys.view", "students.view"],
    isSystem: false,
  },
];

export const ROLE_ASSIGNMENTS: RoleAssignment[] = [
  { id: "pq-01", userId: "cb-001", userName: "Lê Hoàng Phúc", userCode: "CB0001", unit: "Trung tâm Thông tin", roleId: "system-admin", faculty: null, grantedAt: "2024-08-01", grantedBy: "Hệ thống" },
  { id: "pq-02", userId: "cb-002", userName: "Trần Minh Khoa", userCode: "PDT0001", unit: "Phòng Đào tạo", roleId: "academic-head", faculty: null, grantedAt: "2024-08-01", grantedBy: "Lê Hoàng Phúc" },
  { id: "pq-03", userId: "cb-012", userName: "Nguyễn Thị Thu Hà", userCode: "PDT0012", unit: "Phòng Đào tạo", roleId: "academic-officer", faculty: null, grantedAt: "2025-02-10", grantedBy: "Trần Minh Khoa" },
  { id: "pq-04", userId: "cb-013", userName: "Phạm Quốc Bảo", userCode: "PDT0013", unit: "Phòng Đào tạo", roleId: "academic-officer", faculty: null, grantedAt: "2025-09-03", grantedBy: "Trần Minh Khoa" },
  { id: "pq-05", userId: "cb-101", userName: "Võ Thanh Trang", userCode: "GVK0101", unit: "Khoa Công nghệ Thông tin", roleId: "faculty-secretary", faculty: "Khoa Công nghệ Thông tin", grantedAt: "2025-08-20", grantedBy: "Trần Minh Khoa" },
  { id: "pq-06", userId: "cb-102", userName: "Đặng Ngọc Hân", userCode: "GVK0102", unit: "Khoa Toán - Tin học", roleId: "faculty-secretary", faculty: "Khoa Toán - Tin học", grantedAt: "2025-08-20", grantedBy: "Trần Minh Khoa" },
  { id: "pq-07", userId: "cb-103", userName: "Bùi Gia Linh", userCode: "GVK0103", unit: "Khoa Ngữ văn", roleId: "faculty-secretary", faculty: "Khoa Ngữ văn", grantedAt: "2026-01-05", grantedBy: "Phạm Quốc Bảo" },
  { id: "pq-08", userId: "cb-201", userName: "Huỳnh Văn Sơn", userCode: "PKT0001", unit: "Phòng Khảo thí", roleId: "exam-office", faculty: null, grantedAt: "2024-09-15", grantedBy: "Lê Hoàng Phúc" },
  { id: "pq-09", userId: "cb-301", userName: "PGS.TS. Ngô Đức Thịnh", userCode: "BGH0002", unit: "Ban Giám hiệu", roleId: "board-viewer", faculty: null, grantedAt: "2024-08-01", grantedBy: "Lê Hoàng Phúc" },
  { id: "pq-10", userId: "cb-104", userName: "Lý Thùy Dương", userCode: "GVK0104", unit: "Khoa Tiếng Anh", roleId: "faculty-secretary", faculty: "Khoa Tiếng Anh", grantedAt: mockDate(-3, "10:20"), grantedBy: "Trần Minh Khoa" },
];

