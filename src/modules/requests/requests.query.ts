import "server-only";
import { cache } from "react";
import { asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { can } from "@/modules/access/access.constant";
import { getViewer, requirePermission } from "@/modules/access/access.query";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { lecturers } from "@/modules/users/users.schema";
import { officeStepRoles } from "@/modules/requests/requests.constant";
import { requestRows, type RequestPortal } from "@/modules/requests/requests.lib";
import type { RequestAccess } from "@/modules/requests/requests.rule";
import { academicRequests, requestAttachments } from "@/modules/requests/requests.schema";

export type { RequestPortal };

// Người đang xem: giảng viên (nếu tài khoản là giảng viên) và vai trò quản trị đang dùng (nếu có quyền mở hộp đơn từ).
export const getRequestAccess = cache(async (): Promise<RequestAccess> => {
  const { user, roles } = await requireSession();
  const [lecturer] = roles.includes("lecturer") ? await db.select({ id: lecturers.id }).from(lecturers).where(eq(lecturers.userId, user.id)) : [];
  const viewer = roles.includes("admin") ? await getViewer() : null;
  return {
    userId: user.id,
    lecturerId: lecturer?.id ?? null,
    office:
      viewer && can(viewer, "requests.process")
        ? { roles: officeStepRoles(viewer.permissions), faculty: viewer.faculty, supervise: can(viewer, "requests.supervise"), roleName: viewer.roleName }
        : null,
  };
});

// Cổng quản trị: đơn có bước thuộc quyền của vai trò đang dùng trong phạm vi khoa (hoặc mọi đơn trong phạm vi nếu có
// requests.supervise), cộng đơn người xem đã xử lý.
export const getRequests = cache(async () => {
  await requirePermission("requests.process");
  return requestRows(sql`true`, await getRequestAccess(), "office");
});

// Đơn do chính tài khoản đang đăng nhập gửi (sinh viên hoặc giảng viên).
export async function getRequestsOf(requesterId: string) {
  const access = await getRequestAccess();
  if (!isUuid(requesterId)) return [];
  return requestRows(or(eq(academicRequests.requesterStudentId, requesterId), eq(academicRequests.requesterLecturerId, requesterId))!, access, "own");
}

// Cổng giảng viên: đơn có bước cố vấn, giảng viên đang giao cho giảng viên đang đăng nhập hoặc giảng viên đã xử lý.
export async function getRequestsForAssignee() {
  const access = await getRequestAccess();
  if (!access.lecturerId) return [];
  return requestRows(sql`true`, access, "lecturer");
}

// Một đơn mà tài khoản đang đăng nhập được xem (cùng hàm quyền với danh sách); portal quyết định nút nào hiện.
export async function getRequest(id: string, portal: RequestPortal | "any" = "any") {
  const access = await getRequestAccess();
  if (!isUuid(id)) return null;
  const [request] = await requestRows(eq(academicRequests.id, id), access, portal);
  return request ?? null;
}

// Tệp minh chứng để tải xuống: chỉ trả khi tài khoản đang đăng nhập xem được đơn chứa tệp (cùng quyền với getRequest).
export async function getRequestAttachmentFile(attachmentId: string) {
  await requireSession();
  if (!isUuid(attachmentId)) return null;
  const [file] = await db
    .select({
      requestId: requestAttachments.requestId,
      fileName: requestAttachments.fileName,
      contentType: requestAttachments.contentType,
      sizeBytes: requestAttachments.sizeBytes,
      storageKey: requestAttachments.storageKey,
    })
    .from(requestAttachments)
    .where(eq(requestAttachments.id, attachmentId));
  if (!file) return null;
  const request = await getRequest(file.requestId);
  return request ? file : null;
}

// Giảng viên đang làm việc để Phòng Đào tạo chọn khi chuyển người xử lý bước cố vấn, giảng viên.
export async function getReassignCandidates() {
  await requirePermission("requests.supervise");
  const rows = await db
    .select({ id: lecturers.id, title: lecturers.title, fullName: lecturers.fullName, code: lecturers.code, faculty: faculties.name })
    .from(lecturers)
    .innerJoin(faculties, eq(faculties.id, lecturers.facultyId))
    .where(eq(lecturers.status, "active"))
    .orderBy(asc(faculties.name), asc(lecturers.fullName));
  return rows.map((row) => ({ id: row.id, label: `${row.title} ${row.fullName} (${row.code})`, faculty: row.faculty }));
}
