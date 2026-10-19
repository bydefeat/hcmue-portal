import type { AuditChange } from "@/modules/audit/audit.type";

type Value = string | number | boolean | null | undefined;

function display(value: Value) {
  if (value === null || value === undefined || value === "") return "Không có";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  return String(value);
}

// Chỉ giữ các trường thật sự đổi giá trị, đổi về chuỗi hiển thị để nhật ký đọc được không cần tra mã.
export function auditChanges(fields: [field: string, before: Value, after: Value][]): AuditChange[] {
  return fields.filter(([, before, after]) => display(before) !== display(after)).map(([field, before, after]) => ({ field, before: display(before), after: display(after) }));
}
