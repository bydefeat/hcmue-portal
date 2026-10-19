import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, exists, inArray, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { can } from "@/modules/access/access.constant";
import { getViewer, requirePermission } from "@/modules/access/access.query";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { OFFICE_UNIT_LABEL, officeStepRoles, requestView } from "@/modules/requests/requests.constant";
import { academicRequests, requestAttachments, requestSteps } from "@/modules/requests/requests.schema";
import type { AcademicRequest, ApprovalStep, RequestView, StepRole } from "@/modules/requests/requests.type";

const requestFaculty = alias(faculties, "request_faculty");
const requesterLecturer = alias(lecturers, "requester_lecturer");
const requesterLecturerFaculty = alias(faculties, "requester_lecturer_faculty");
const advisor = alias(lecturers, "advisor");
const stepLecturer = alias(lecturers, "step_lecturer");

const displayName = (title: string | null, fullName: string | null) => (fullName ? `${title} ${fullName}` : null);

function lecturerStepOf(lecturerId: string) {
  return exists(
    db
      .select({ id: requestSteps.id })
      .from(requestSteps)
      .where(and(eq(requestSteps.requestId, academicRequests.id), eq(requestSteps.role, "lecturer"), eq(requestSteps.assigneeLecturerId, lecturerId))),
  );
}

const hasAdvisorStep = exists(
  db
    .select({ id: requestSteps.id })
    .from(requestSteps)
    .where(and(eq(requestSteps.requestId, academicRequests.id), eq(requestSteps.role, "advisor"))),
);

// Đơn kèm người gửi, khoa, cố vấn hiện tại của sinh viên gửi, các bước và tên tệp minh chứng; trả đúng kiểu RequestView cũ.
async function requestRows(where?: SQL): Promise<RequestView[]> {
  const rows = await db
    .select({
      id: academicRequests.id,
      code: academicRequests.code,
      kind: academicRequests.kind,
      studentId: students.id,
      studentName: students.fullName,
      studentCode: students.code,
      className: administrativeClasses.code,
      lecturerId: requesterLecturer.id,
      lecturerTitle: requesterLecturer.title,
      lecturerName: requesterLecturer.fullName,
      lecturerCode: requesterLecturer.code,
      lecturerFaculty: requesterLecturerFaculty.name,
      faculty: requestFaculty.name,
      subject: academicRequests.subject,
      details: academicRequests.details,
      reason: academicRequests.reason,
      createdAt: academicRequests.createdAt,
      cancelledAt: academicRequests.cancelledAt,
      advisorId: advisor.id,
      advisorTitle: advisor.title,
      advisorName: advisor.fullName,
    })
    .from(academicRequests)
    .innerJoin(requestFaculty, eq(requestFaculty.id, academicRequests.facultyId))
    .leftJoin(students, eq(students.id, academicRequests.requesterStudentId))
    .leftJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .leftJoin(advisor, eq(advisor.id, administrativeClasses.advisorId))
    .leftJoin(requesterLecturer, eq(requesterLecturer.id, academicRequests.requesterLecturerId))
    .leftJoin(requesterLecturerFaculty, eq(requesterLecturerFaculty.id, requesterLecturer.facultyId))
    .where(where)
    .orderBy(desc(academicRequests.createdAt), desc(academicRequests.id));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [steps, files] = await Promise.all([
    db
      .select({
        requestId: requestSteps.requestId,
        role: requestSteps.role,
        label: requestSteps.label,
        lecturerId: stepLecturer.id,
        lecturerTitle: stepLecturer.title,
        lecturerName: stepLecturer.fullName,
        status: requestSteps.status,
        actorName: requestSteps.actorName,
        actedAt: requestSteps.actedAt,
        comment: requestSteps.comment,
        dueAt: requestSteps.dueAt,
      })
      .from(requestSteps)
      .leftJoin(stepLecturer, eq(stepLecturer.id, requestSteps.assigneeLecturerId))
      .where(inArray(requestSteps.requestId, ids))
      .orderBy(asc(requestSteps.requestId), asc(requestSteps.position)),
    db
      .select({
        requestId: requestAttachments.requestId,
        id: requestAttachments.id,
        fileName: requestAttachments.fileName,
        contentType: requestAttachments.contentType,
        sizeBytes: requestAttachments.sizeBytes,
      })
      .from(requestAttachments)
      .where(inArray(requestAttachments.requestId, ids))
      .orderBy(asc(requestAttachments.uploadedAt), asc(requestAttachments.id)),
  ]);
  const stepsOf = Map.groupBy(steps, (step) => step.requestId);
  const filesOf = Map.groupBy(files, (file) => file.requestId);
  return rows.map((row) => {
    const isStudent = row.studentId !== null;
    const assignee = (step: (typeof steps)[number]): Pick<ApprovalStep, "assigneeId" | "assigneeName"> => {
      if (step.role === "advisor") return { assigneeId: row.advisorId, assigneeName: displayName(row.advisorTitle, row.advisorName) };
      if (step.role === "lecturer") return { assigneeId: step.lecturerId, assigneeName: displayName(step.lecturerTitle, step.lecturerName) };
      if (step.role === "faculty") return { assigneeId: null, assigneeName: row.faculty };
      return { assigneeId: null, assigneeName: OFFICE_UNIT_LABEL[step.role] };
    };
    const request: AcademicRequest = {
      id: row.id,
      code: row.code,
      kind: row.kind,
      requesterType: isStudent ? "student" : "lecturer",
      requesterId: (isStudent ? row.studentId : row.lecturerId) ?? "",
      requesterName: (isStudent ? row.studentName : displayName(row.lecturerTitle, row.lecturerName)) ?? "",
      requesterCode: isStudent ? formatStudentCode(row.studentCode ?? "") : (row.lecturerCode ?? ""),
      requesterUnit: (isStudent ? row.className : row.lecturerFaculty) ?? "",
      faculty: row.faculty,
      subject: row.subject,
      details: row.details,
      reason: row.reason,
      attachments: (filesOf.get(row.id) ?? []).map(({ requestId: _requestId, ...file }) => file),
      createdAt: row.createdAt.toISOString(),
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      steps: (stepsOf.get(row.id) ?? []).map((step) => ({
        role: step.role,
        label: step.label,
        ...assignee(step),
        status: step.status,
        actorName: step.actorName,
        actedAt: step.actedAt?.toISOString() ?? null,
        comment: step.comment,
        dueAt: step.dueAt?.toISOString() ?? null,
      })),
    };
    return requestView(request);
  });
}

// Mọi đơn trong phạm vi khoa của cán bộ đang xem (giáo vụ khoa chỉ thấy khoa mình).
export const getRequests = cache(async () => {
  const viewer = await requirePermission("requests.process");
  return requestRows(viewer.faculty === null ? undefined : eq(requestFaculty.name, viewer.faculty));
});

// Đơn do chính tài khoản đang đăng nhập gửi (sinh viên hoặc giảng viên).
export async function getRequestsOf(requesterId: string) {
  const { user } = await requireSession();
  if (!isUuid(requesterId)) return [];
  return requestRows(
    or(
      and(eq(academicRequests.requesterStudentId, requesterId), eq(students.userId, user.id)),
      and(eq(academicRequests.requesterLecturerId, requesterId), eq(requesterLecturer.userId, user.id)),
    ),
  );
}

// Đơn có bước giao cho giảng viên đang đăng nhập: cố vấn của sinh viên gửi, hoặc giảng viên dạy lớp được phúc khảo, hoãn thi.
export async function getRequestsForAssignee(assigneeId: string, roles: StepRole[]) {
  const { user } = await requireSession();
  if (!isUuid(assigneeId)) return [];
  const [lecturer] = await db.select({ id: lecturers.id }).from(lecturers).where(and(eq(lecturers.id, assigneeId), eq(lecturers.userId, user.id)));
  if (!lecturer) return [];
  const conditions = [
    roles.includes("advisor") ? and(eq(advisor.id, lecturer.id), hasAdvisorStep) : undefined,
    roles.includes("lecturer") ? lecturerStepOf(lecturer.id) : undefined,
  ].filter((condition) => condition !== undefined);
  return conditions.length > 0 ? requestRows(or(...conditions)) : [];
}

// Một đơn mà tài khoản đang đăng nhập được xem: người gửi, cố vấn, giảng viên được giao bước, cán bộ có bước xử lý trong phạm vi khoa.
export async function getRequest(id: string) {
  const { user, roles } = await requireSession();
  if (!isUuid(id)) return null;
  const viewer = roles.includes("admin") ? await getViewer() : null;
  const [currentLecturer] = await db.select({ id: lecturers.id }).from(lecturers).where(eq(lecturers.userId, user.id));
  // Cán bộ chỉ xem (và tải minh chứng) đơn có bước thuộc vai trò mình xử lý, trong phạm vi khoa của vai trò.
  const officeRoles = viewer && can(viewer, "requests.process") ? officeStepRoles(viewer.roleKey) : [];
  const office =
    viewer && officeRoles.length > 0
      ? and(
          viewer.faculty === null ? undefined : eq(requestFaculty.name, viewer.faculty),
          exists(
            db
              .select({ id: requestSteps.id })
              .from(requestSteps)
              .where(and(eq(requestSteps.requestId, academicRequests.id), inArray(requestSteps.role, officeRoles))),
          ),
        )
      : undefined;
  const [request] = await requestRows(
    and(
      eq(academicRequests.id, id),
      or(
        eq(students.userId, user.id),
        eq(requesterLecturer.userId, user.id),
        // Cố vấn chỉ xem đơn có bước cố vấn (đơn cấp bảng điểm của sinh viên lớp mình thì không).
        currentLecturer ? and(eq(advisor.id, currentLecturer.id), hasAdvisorStep) : undefined,
        currentLecturer ? lecturerStepOf(currentLecturer.id) : undefined,
        office,
      ),
    ),
  );
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
