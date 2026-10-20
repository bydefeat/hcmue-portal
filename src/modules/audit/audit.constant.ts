import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AuditAction, AuditEntityType } from "@/modules/audit/audit.type";

export const AUDIT_ACTION: Record<AuditAction, StatusMeta> = {
  create: { label: "Tạo mới", tone: "neutral" },
  update: { label: "Sửa", tone: "neutral" },
  delete: { label: "Xóa", tone: "danger" },
  approve: { label: "Duyệt", tone: "success" },
  reject: { label: "Từ chối", tone: "warning" },
  publish: { label: "Công bố", tone: "success" },
  lock: { label: "Chốt", tone: "neutral" },
  assign: { label: "Phân công", tone: "neutral" },
  export: { label: "Xuất dữ liệu", tone: "neutral" },
  "sign-in": { label: "Đăng nhập", tone: "neutral" },
  permission: { label: "Đổi quyền", tone: "warning" },
  submit: { label: "Trình ký", tone: "neutral" },
  sign: { label: "Ký", tone: "success" },
  revoke: { label: "Thu hồi", tone: "danger" },
  return: { label: "Trả lại", tone: "warning" },
};

export const AUDIT_ENTITY_LABEL: Record<AuditEntityType, string> = {
  student: "Hồ sơ sinh viên",
  lecturer: "Giảng viên",
  "grade-sheet": "Bảng điểm",
  "class-section": "Lớp học phần",
  "registration-period": "Đợt đăng ký",
  request: "Đơn từ",
  decision: "Quyết định",
  announcement: "Thông báo",
  role: "Phân quyền",
  regulation: "Quy chế",
  exam: "Lịch thi",
  "calendar-event": "Lịch năm học",
  report: "Báo cáo",
  program: "Chương trình đào tạo",
  staff: "Cán bộ",
  course: "Học phần",
  graduation: "Xét tốt nghiệp",
};

export const AUDIT_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  audit_logs_changes_array: "Danh sách thay đổi trong nhật ký phải là một mảng.",
};

export const AUDIT_ACTION_OPTIONS =Object.entries(AUDIT_ACTION).map(([value, meta]) => ({ value, label: meta.label }));

export const AUDIT_ENTITY_OPTIONS = Object.entries(AUDIT_ENTITY_LABEL).map(([value, label]) => ({ value, label }));
