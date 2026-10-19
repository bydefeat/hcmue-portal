import { mockDate } from "@/shared/libs/mock.lib";
import type { AuditAction, AuditChange, AuditEntityType, AuditEntry } from "@/modules/audit/audit.type";

type Seed = [daysAgo: number, time: string, actor: string, role: string, action: AuditAction, entity: AuditEntityType, entityId: string, label: string, summary: string, changes?: AuditChange[]];

const HEAD = ["Trần Minh Khoa", "Trưởng phòng Đào tạo"] as const;
const OFFICER = ["Nguyễn Thị Thu Hà", "Chuyên viên Phòng Đào tạo"] as const;
const OFFICER2 = ["Phạm Quốc Bảo", "Chuyên viên Phòng Đào tạo"] as const;
const SECRETARY = ["Võ Thanh Trang", "Giáo vụ khoa, Khoa Công nghệ Thông tin"] as const;
const LECTURER = ["TS. Hoàng Gia Nhi", "Giảng viên"] as const;
const SYSADMIN = ["Lê Hoàng Phúc", "Quản trị hệ thống"] as const;
const EXAM = ["Huỳnh Văn Sơn", "Phòng Khảo thí"] as const;

const SEEDS: Seed[] = [
  [0, "08:12", ...OFFICER, "sign-in", "role", "cb-012", "Nguyễn Thị Thu Hà", "Đăng nhập từ trình duyệt Chrome trên Windows"],
  [0, "08:40", ...OFFICER, "update", "class-section", "hk2-2026-engl2001-02", "ENGL2001.02", "Đổi phòng học", [{ field: "Phòng", before: "H.3.11", after: "H.2.04" }]],
  [0, "09:05", ...SECRETARY, "approve", "grade-sheet", "hk1-2026-comp1040-01", "COMP1040.01 Cơ sở dữ liệu", "Duyệt bảng điểm cấp khoa"],
  [0, "09:31", ...OFFICER, "approve", "request", "don-7", "DT-2026-01258", "Đồng ý đơn xin mở lớp COMP1031"],
  [1, "10:12", ...SECRETARY, "approve", "grade-sheet", "hk1-2026-comp1010-01", "COMP1010.01 Lập trình cơ bản", "Duyệt bảng điểm cấp khoa"],
  [1, "14:02", ...LECTURER, "lock", "grade-sheet", "hk1-2026-litr1010-01", "LITR1010.01 Văn học Việt Nam hiện đại", "Chốt bảng điểm 47 sinh viên"],
  [1, "16:45", ...OFFICER2, "update", "student", "sv-60", "Hồ sơ 50.01.104.009", "Cập nhật số điện thoại", [{ field: "Điện thoại", before: "0903112233", after: "0977554410" }]],
  [2, "09:40", ...HEAD, "publish", "grade-sheet", "hk1-2026-math1011-01", "MATH1011.01 Giải tích 1", "Công bố điểm cho 58 sinh viên"],
  [2, "11:20", ...SECRETARY, "reject", "grade-sheet", "hk1-2026-psyc1001-01", "PSYC1001.01 Tâm lý học giáo dục", "Trả lại bảng điểm: tổng trọng số cột giữa kỳ sai", [{ field: "Trạng thái", before: "Đã chốt", after: "Trả lại" }]],
  [3, "10:20", ...HEAD, "permission", "role", "pq-10", "Lý Thùy Dương", "Cấp vai trò Giáo vụ khoa, Khoa Tiếng Anh", [{ field: "Vai trò", before: "Không có", after: "Giáo vụ khoa" }]],
  [3, "15:10", ...EXAM, "update", "exam", "thi-final-comp1080.01", "Thi cuối kỳ COMP1080.01", "Đổi phòng thi", [{ field: "Phòng", before: "A.203", after: "B.302" }]],
  [4, "08:05", ...OFFICER, "create", "registration-period", "dot-hk2-1", "Đợt 1, khóa 48 và 49", "Mở đợt đăng ký học kỳ 2"],
  [4, "08:06", ...OFFICER, "update", "registration-period", "dot-hk2-1", "Đợt 1, khóa 48 và 49", "Sửa hạn mức tín chỉ", [{ field: "Tín chỉ tối đa", before: "24", after: "25" }]],
  [5, "13:30", ...OFFICER2, "create", "announcement", "tb-01", "Đăng ký học phần học kỳ 2, đợt 1", "Đăng thông báo, ghim đầu trang"],
  [6, "17:22", ...OFFICER, "export", "student", "all", "Danh sách sinh viên", "Xuất 600 hồ sơ sinh viên ra Excel"],
  [8, "09:00", ...HEAD, "approve", "decision", "qd-6", "Khen thưởng học tập 2025-2026", "Trình ký quyết định khen thưởng"],
  [12, "14:44", ...SYSADMIN, "update", "regulation", "2025.1", "Quy chế đào tạo 2025.1", "Sửa ngưỡng cảnh báo mức 2", [{ field: "CPA mức 2", before: "1,4", after: "1,5" }]],
  [14, "10:10", ...OFFICER, "assign", "class-section", "hk2-2026-comp1100-02", "COMP1100.02", "Phân công giảng viên", [{ field: "Giảng viên", before: "Chưa phân công", after: "TS. Phạm Thanh Hà" }]],
  [20, "16:30", ...OFFICER2, "delete", "class-section", "hk2-2026-math1011-02", "MATH1011.02", "Hủy lớp do không đủ sĩ số tối thiểu", [{ field: "Trạng thái", before: "Mở đăng ký", after: "Đã hủy" }]],
];

export const AUDIT_LOG: AuditEntry[] = SEEDS.map(([daysAgo, time, actorName, actorRole, action, entityType, entityId, entityLabel, summary, changes = []], index) => ({
  id: `log-${String(index + 1).padStart(4, "0")}`,
  at: mockDate(-daysAgo, time),
  actorName,
  actorRole,
  action,
  entityType,
  entityId,
  entityLabel,
  summary,
  changes,
  ip: `10.10.${12 + (index % 5)}.${40 + index * 3}`,
}));
