import "server-only";
import { and, asc, desc, eq, exists, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { newStorageKey, sweepOrphanFiles, withStoredFiles } from "@/shared/libs/storage.lib";
import { currentYear, formatDateTime } from "@/shared/libs/date.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { recordAudit, type AuditActor } from "@/modules/audit/audit.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections } from "@/modules/course-registration/course-registration.schema";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { examSessions } from "@/modules/exams/exams.schema";
import { gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import { notifyLecturers, notifyUsers } from "@/modules/notifications/notifications.lib";
import { calendarEvents } from "@/modules/settings/settings.schema";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { isOfficeStep, OFFICE_UNIT_LABEL, REQUEST_CODE_PREFIX, REQUEST_KINDS, requestView, STEP_PERMISSION, STEP_ROLE_LABEL } from "@/modules/requests/requests.constant";
import {
  addWorkingDays,
  cancelBlockedReason,
  effectiveAssignee,
  formatRequestCode,
  holidayDates,
  initialSteps,
  pickFinalComponent,
  planDecision,
  slaNotice,
  stepDeniedReason,
  superviseDeniedReason,
  type RequestAccess,
  type StepContext,
  type StudentRequestFacts,
} from "@/modules/requests/requests.rule";
import { academicRequests, requestAttachments, requestCodeCounters, requestSteps, requestSupplements } from "@/modules/requests/requests.schema";
import type { AcademicRequest, ApprovalStep, RequestDetail, RequesterType, RequestKind, RequestView, RequestViewerCan, StepRole } from "@/modules/requests/requests.type";

type Executor = Transaction | typeof db;

// Lỗi nghiệp vụ trong giao dịch đơn từ: action đổi thành câu báo, field có thì gắn vào ô của form.
export class RequestError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export type { StepContext };

// Số tiếp theo của mã đơn. Dòng đếm bị khóa tới hết giao dịch nên hai người gửi cùng lúc không lấy trùng số.
export async function allocateRequestCode(tx: Transaction, requesterType: RequesterType, year = currentYear()) {
  const prefix = REQUEST_CODE_PREFIX[requesterType];
  const [row] = await tx
    .insert(requestCodeCounters)
    .values({ prefix, year, lastValue: 1 })
    .onConflictDoUpdate({ target: [requestCodeCounters.prefix, requestCodeCounters.year], set: { lastValue: sql`${requestCodeCounters.lastValue} + 1` } })
    .returning({ value: requestCodeCounters.lastValue });
  return formatRequestCode(prefix, year, row.value);
}

// Ngày nghỉ lễ trong lịch năm học, để tính hạn xử lý theo ngày làm việc.
export async function loadHolidays(executor: Executor = db) {
  const rows = await executor.select({ startDate: calendarEvents.startDate, endDate: calendarEvents.endDate }).from(calendarEvents).where(eq(calendarEvents.kind, "holiday"));
  return holidayDates(rows);
}

export type NewAttachment = { name: string; contentType: string; storageKey: string; sizeBytes: number };

export type AttachmentFile = { name: string; contentType: string; data: Uint8Array };

// Ghi tệp minh chứng vào kho rồi chạy giao dịch tạo đơn với khóa lưu trữ của từng tệp. Giao dịch hỏng thì tệp vừa ghi bị xóa.
export function withAttachments<T>(files: AttachmentFile[], work: (attachments: NewAttachment[]) => Promise<T>) {
  const stored = files.map((file) => ({ ...file, key: newStorageKey("requests") }));
  return withStoredFiles(stored, () =>
    work(stored.map((file) => ({ name: file.name, contentType: file.contentType, storageKey: file.key, sizeBytes: file.data.byteLength }))),
  );
}

async function insertAttachments(tx: Transaction, requestId: string, attachments: NewAttachment[], now: Date) {
  if (attachments.length === 0) return;
  await tx.insert(requestAttachments).values(
    attachments.map((file) => ({
      requestId,
      fileName: file.name,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      storageKey: file.storageKey,
      uploadedAt: now,
    })),
  );
}

export type NewRequest = {
  kind: RequestKind;
  requester: { type: "student"; studentId: string } | { type: "lecturer"; lecturerId: string };
  facultyId: string;
  classSectionId?: string | null;
  resubmittedFromId?: string | null;
  subject: string;
  details: RequestDetail[];
  reason: string;
  attachments: NewAttachment[];
  lecturerAssigneeId: string | null;
  // Người gửi, để ghi nhật ký thao tác; test bỏ trống.
  actor?: AuditActor;
};

export async function insertRequest(tx: Transaction, input: NewRequest, year = currentYear()) {
  const now = new Date();
  const code = await allocateRequestCode(tx, input.requester.type, year);
  const [request] = await tx
    .insert(academicRequests)
    .values({
      code,
      kind: input.kind,
      requesterStudentId: input.requester.type === "student" ? input.requester.studentId : null,
      requesterLecturerId: input.requester.type === "lecturer" ? input.requester.lecturerId : null,
      facultyId: input.facultyId,
      classSectionId: input.classSectionId ?? null,
      resubmittedFromId: input.resubmittedFromId ?? null,
      subject: input.subject,
      details: input.details,
      reason: input.reason,
      createdAt: now,
    })
    .returning({ id: academicRequests.id, code: academicRequests.code });
  const holidays = await loadHolidays(tx);
  await tx.insert(requestSteps).values(initialSteps(input.kind, now, input.lecturerAssigneeId, holidays).map((step) => ({ ...step, requestId: request.id })));
  await insertAttachments(tx, request.id, input.attachments, now);
  const locked = await lockRequest(tx, request.id);
  await notifyStepHandlers(tx, locked, 0, {
    title: `Đơn ${code} chờ bạn xử lý`,
    body: `${REQUEST_KINDS[input.kind].label}: ${input.subject}. Bước ${locked.steps[0].label.toLowerCase()}, hạn ${formatDateTime(locked.steps[0].dueAt!)}.`,
  });
  if (input.actor) {
    await recordAudit(tx, {
      actor: input.actor,
      action: "create",
      entityType: "request",
      entityId: request.id,
      entityLabel: code,
      summary: input.resubmittedFromId ? `Gửi lại đơn ${REQUEST_KINDS[input.kind].label.toLowerCase()}` : `Gửi đơn ${REQUEST_KINDS[input.kind].label.toLowerCase()}`,
    });
  }
  return request;
}

// Cột điểm của lớp và điểm đang lưu của một sinh viên ở cột đó (null nếu chưa nhập).
export async function currentComponentScore(tx: Executor, input: { classSectionId: string; enrollmentId: string; componentKey: string }) {
  const [component] = await tx
    .select({ id: gradeComponents.id, label: gradeComponents.label })
    .from(gradeComponents)
    .innerJoin(gradeSheets, eq(gradeSheets.id, gradeComponents.gradeSheetId))
    .where(and(eq(gradeSheets.classSectionId, input.classSectionId), eq(gradeComponents.key, input.componentKey)));
  if (!component) return { component: null, score: null };
  const [row] = await tx
    .select({ score: gradeScores.score })
    .from(gradeScores)
    .where(and(eq(gradeScores.gradeComponentId, component.id), eq(gradeScores.enrollmentId, input.enrollmentId)));
  return { component: { label: component.label }, score: row?.score ?? null };
}

// Trạng thái bảng điểm của lớp (để kiểm điều kiện phúc khảo, sửa điểm).
export async function gradeSheetStatus(tx: Executor, classSectionId: string) {
  const [sheet] = await tx.select({ status: gradeSheets.status, publishedAt: gradeSheets.publishedAt }).from(gradeSheets).where(eq(gradeSheets.classSectionId, classSectionId));
  return sheet ?? null;
}

// Giá trị trên hệ thống để người duyệt đối chiếu với ô sinh viên tự khai: điểm cột cuối kỳ (phúc khảo), lịch thi của lớp (hoãn thi).
export async function studentRequestFacts(tx: Executor, kind: RequestKind, input: { classSectionId: string; enrollmentId: string }): Promise<StudentRequestFacts> {
  if (kind === "regrade") {
    const components = await tx
      .select({ key: gradeComponents.key, label: gradeComponents.label })
      .from(gradeComponents)
      .innerJoin(gradeSheets, eq(gradeSheets.id, gradeComponents.gradeSheetId))
      .where(eq(gradeSheets.classSectionId, input.classSectionId));
    const final = pickFinalComponent(components);
    if (!final) return { finalExam: null };
    const { score } = await currentComponentScore(tx, { ...input, componentKey: final.key });
    return { finalExam: { label: final.label, score } };
  }
  if (kind === "exam-postpone") {
    const exams = await tx
      .select({ kind: examSessions.kind, date: examSessions.date })
      .from(examSessions)
      .where(eq(examSessions.classSectionId, input.classSectionId))
      .orderBy(asc(examSessions.date));
    // Ca thi bù không phải lịch thi gốc để đối chiếu đơn hoãn thi.
    return { examDates: exams.filter((exam): exam is { kind: "midterm" | "final"; date: string } => exam.kind !== "makeup") };
  }
  return {};
}

const requesterLecturer = alias(lecturers, "requester_lecturer");

// Khóa dòng đơn: mọi thao tác đổi trạng thái (duyệt, từ chối, hủy, chuyển người, bổ sung) đều khóa dòng này trước, nên hai
// người bấm cùng lúc thì người sau chờ người trước xong rồi đọc lại trạng thái mới.
async function lockRequest(tx: Transaction, requestId: string) {
  const [request] = await tx
    .select({
      id: academicRequests.id,
      code: academicRequests.code,
      kind: academicRequests.kind,
      subject: academicRequests.subject,
      details: academicRequests.details,
      reason: academicRequests.reason,
      requesterStudentId: academicRequests.requesterStudentId,
      requesterLecturerId: academicRequests.requesterLecturerId,
      facultyId: academicRequests.facultyId,
      classSectionId: academicRequests.classSectionId,
      cancelledAt: academicRequests.cancelledAt,
      faculty: faculties.name,
      advisorId: administrativeClasses.advisorId,
      sectionLecturerId: classSections.lecturerId,
      requesterUserId: sql<string | null>`coalesce(${students.userId}, ${requesterLecturer.userId})`,
    })
    .from(academicRequests)
    .innerJoin(faculties, eq(faculties.id, academicRequests.facultyId))
    .leftJoin(students, eq(students.id, academicRequests.requesterStudentId))
    .leftJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .leftJoin(requesterLecturer, eq(requesterLecturer.id, academicRequests.requesterLecturerId))
    .leftJoin(classSections, eq(classSections.id, academicRequests.classSectionId))
    .where(eq(academicRequests.id, requestId))
    .for("update", { of: academicRequests });
  if (!request) throw new RequestError("Đơn không còn trong hệ thống. Tải lại trang.");
  const steps = await tx.select().from(requestSteps).where(eq(requestSteps.requestId, requestId)).orderBy(asc(requestSteps.position)).for("update");
  const [openSupplement] = await tx
    .select()
    .from(requestSupplements)
    .where(and(eq(requestSupplements.requestId, requestId), isNull(requestSupplements.respondedAt)));
  return { request, steps, openSupplement: openSupplement ?? null };
}

type LockedRequest = Awaited<ReturnType<typeof lockRequest>>;
type StepRow = LockedRequest["steps"][number];

function assigneeOf(locked: LockedRequest, step: StepRow) {
  return effectiveAssignee(step, { advisorId: locked.request.advisorId, sectionLecturerId: locked.request.sectionLecturerId });
}

function stepContext(locked: LockedRequest, step: StepRow): StepContext {
  return { role: step.role, assigneeLecturerId: assigneeOf(locked, step), faculty: locked.request.faculty, advisorId: locked.request.advisorId };
}

// Tài khoản cán bộ xử lý được bước của đơn vị: tài khoản vào được cổng quản trị (vai trò admin), được cấp vai trò có
// requests.process và quyền của bước, phạm vi toàn trường hoặc đúng khoa của đơn.
export async function officeHandlerUserIds(executor: Executor, role: StepRole, facultyId: string) {
  if (!isOfficeStep(role)) return [];
  const process = alias(rolePermissions, "process_permission");
  const rows = await executor
    .selectDistinct({ userId: roleAssignments.userId })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .innerJoin(process, and(eq(process.roleId, roles.id), eq(process.permission, "requests.process")))
    .innerJoin(rolePermissions, and(eq(rolePermissions.roleId, roles.id), eq(rolePermissions.permission, STEP_PERMISSION[role])))
    .innerJoin(user, eq(user.id, roleAssignments.userId))
    .where(and(or(eq(roles.scope, "university"), eq(roleAssignments.facultyId, facultyId)), sql`',' || ${user.role} || ',' LIKE '%,admin,%'`));
  return rows.map((row) => row.userId);
}

// Báo người có bước đến lượt: giảng viên, cố vấn ở cổng giảng viên; cán bộ có quyền bước ở cổng quản trị. Trả số người đã nhận.
async function notifyStepHandlers(tx: Transaction, locked: LockedRequest, index: number, message: { title: string; body: string }) {
  const step = locked.steps[index];
  if (!step) return 0;
  if (isOfficeStep(step.role)) {
    const userIds = await officeHandlerUserIds(tx, step.role, locked.request.facultyId);
    await notifyUsers(tx, userIds, "administrator", { kind: "request", ...message, href: `/administrator/requests?open=${locked.request.id}` });
    return userIds.length;
  }
  const lecturerId = assigneeOf(locked, step);
  if (!lecturerId) return 0;
  const notified = await notifyLecturers(tx, [lecturerId], { kind: "request", ...message, href: `/lecturer/requests?open=${locked.request.id}` });
  return notified.length;
}

async function notifyRequester(tx: Transaction, locked: LockedRequest, message: { title: string; body: string }) {
  if (!locked.request.requesterUserId) return;
  const audience = locked.request.requesterStudentId ? "student" : "lecturer";
  await notifyUsers(tx, [locked.request.requesterUserId], audience, {
    kind: "request",
    ...message,
    href: audience === "student" ? `/application/requests?open=${locked.request.id}` : `/lecturer/requests?tab=own&open=${locked.request.id}`,
  });
}

// Đơn duyệt xong bước cuối: điểm móc để đợt sau gắn tác động lên dữ liệu (phúc khảo đổi điểm, học vượt nâng hạn mức, rút học
// phần nhận W, bảo lưu ra quyết định...). Handler chạy trong cùng transaction với lần duyệt: ném lỗi thì cả lần duyệt rollback.
export type ApprovedRequest = {
  id: string;
  code: string;
  kind: RequestKind;
  requesterStudentId: string | null;
  requesterLecturerId: string | null;
  classSectionId: string | null;
  details: RequestDetail[];
  actor: AuditActor;
};

export type RequestApprovedHandler = (request: ApprovedRequest, tx: Transaction) => Promise<void>;

// Chưa loại đơn nào có handler: kết quả đơn hiện chỉ là ghi nhận, cán bộ cập nhật dữ liệu bằng tay.
export const REQUEST_APPROVED_HANDLERS: Partial<Record<RequestKind, RequestApprovedHandler>> = {};

export async function onRequestApproved(kind: RequestKind, request: ApprovedRequest, tx: Transaction) {
  await REQUEST_APPROVED_HANDLERS[kind]?.(request, tx);
}

export type StepDecision = {
  requestId: string;
  step: number;
  decision: "approved" | "rejected" | "skipped";
  comment: string;
  actor: AuditActor;
  // Trả câu báo nếu người này không được xử lý bước, null nếu được.
  authorize: (context: StepContext) => string | null;
  // Phòng Đào tạo xử lý thay (bước của người khác): ghi rõ trên bước, lý do bắt buộc.
  onBehalf?: boolean;
};

const DECISION_VERB = { approved: "Đồng ý", rejected: "Không đồng ý", skipped: "Bỏ qua" } as const;

export async function decideStep(tx: Transaction, input: StepDecision) {
  const locked = await lockRequest(tx, input.requestId);
  const { request, steps } = locked;
  const now = new Date();
  if (input.decision === "skipped" && !input.onBehalf) throw new RequestError("Chỉ Phòng Đào tạo xử lý thay mới bỏ qua được bước.");
  if (input.onBehalf && !input.comment.trim()) throw new RequestError("Ghi lý do xử lý thay.", "reason");
  const plan = planDecision({
    kind: request.kind,
    cancelled: request.cancelledAt !== null,
    statuses: steps.map((step) => step.status),
    step: input.step,
    decision: input.decision,
    now,
    holidays: await loadHolidays(tx),
    awaitingSupplement: locked.openSupplement !== null,
  });
  if (!plan.ok) throw new RequestError(plan.message);
  const current = steps[input.step];
  const context = stepContext(locked, current);
  const denied = input.authorize(context);
  if (denied) throw new RequestError(denied);
  await tx
    .update(requestSteps)
    .set({
      status: input.decision,
      // Bước cố vấn, giảng viên ghi lại người chịu trách nhiệm lúc xử lý (cố vấn, giảng viên lớp có thể đổi về sau).
      assigneeLecturerId: isOfficeStep(current.role) ? null : (context.assigneeLecturerId ?? current.assigneeLecturerId),
      actorUserId: input.actor.userId,
      actorName: input.actor.name,
      actedAt: now,
      comment: input.comment || null,
      onBehalf: input.onBehalf ?? false,
    })
    .where(eq(requestSteps.id, current.id));
  if (plan.next) {
    await tx
      .update(requestSteps)
      .set({ status: "pending", dueAt: plan.next.dueAt, dueSoonNotifiedAt: null, overdueNotifiedAt: null })
      .where(eq(requestSteps.id, steps[plan.next.index].id));
  }
  const actorRole = input.onBehalf ? `Phòng Đào tạo (xử lý thay ${STEP_ROLE_LABEL[current.role].toLowerCase()})` : STEP_ROLE_LABEL[current.role];
  const opinion = input.comment ? ` Ý kiến: ${input.comment}` : "";
  const about = `${REQUEST_KINDS[request.kind].label}: ${request.subject}.`;
  const next = plan.next ? steps[plan.next.index] : null;
  const nextRole = next ? STEP_ROLE_LABEL[next.role] : null;
  const passed = input.decision === "skipped" ? "bỏ qua bước" : "đã duyệt";
  await notifyRequester(
    tx,
    locked,
    input.decision === "rejected"
      ? { title: `Đơn ${request.code} bị từ chối`, body: `${about} ${actorRole} từ chối đơn.${opinion}` }
      : nextRole
        ? { title: `Đơn ${request.code} chuyển sang ${nextRole}`, body: `${about} ${actorRole} ${passed}, đơn đang chờ ${nextRole} xử lý.${opinion}` }
        : { title: `Đơn ${request.code} đã được duyệt`, body: `${about} ${actorRole} ${passed} ở bước cuối, đơn hoàn tất.${opinion}` },
  );
  if (plan.next && next) {
    await notifyStepHandlers(tx, { ...locked, steps: steps.map((step, index) => (index === plan.next!.index ? { ...step, status: "pending" as const } : step)) }, plan.next.index, {
      title: `Đơn ${request.code} chờ bạn xử lý`,
      body: `${about} Bước ${next.label.toLowerCase()}, hạn ${formatDateTime(plan.next.dueAt)}.`,
    });
  }
  await recordAudit(tx, {
    actor: input.actor,
    action: input.decision === "approved" ? "approve" : input.decision === "rejected" ? "reject" : "update",
    entityType: "request",
    entityId: request.id,
    entityLabel: request.code,
    summary: `${input.onBehalf ? "Xử lý thay: " : ""}${DECISION_VERB[input.decision]} bước "${current.label}"${input.comment ? `. ${input.comment}` : ""}`,
  });
  if (input.decision !== "rejected" && !plan.next) {
    await onRequestApproved(
      request.kind,
      {
        id: request.id,
        code: request.code,
        kind: request.kind,
        requesterStudentId: request.requesterStudentId,
        requesterLecturerId: request.requesterLecturerId,
        classSectionId: request.classSectionId,
        details: request.details,
        actor: input.actor,
      },
      tx,
    );
  }
}

// Chuyển bước cố vấn, giảng viên (chưa xử lý) cho giảng viên khác; người được chuyển giữ cố định, nhận thông báo nếu bước đang chờ.
export async function reassignStep(
  tx: Transaction,
  input: { requestId: string; step: number; lecturerId: string; reason: string; actor: AuditActor; authorize: (faculty: string) => string | null },
) {
  const locked = await lockRequest(tx, input.requestId);
  const { request, steps } = locked;
  const step = steps[input.step];
  if (!step) throw new RequestError("Bước không còn trong đơn. Tải lại trang.");
  const denied = input.authorize(request.faculty);
  if (denied) throw new RequestError(denied);
  if (request.cancelledAt) throw new RequestError("Người gửi đã hủy đơn.");
  if (steps.some((entry) => entry.status === "rejected")) throw new RequestError("Đơn đã bị từ chối, không chuyển người xử lý được.");
  if (step.status !== "pending" && step.status !== "waiting") throw new RequestError("Bước đã xử lý xong, không chuyển được.");
  if (isOfficeStep(step.role)) throw new RequestError(`Bước của ${STEP_ROLE_LABEL[step.role]} giao theo quyền của đơn vị; dùng Xử lý thay nếu cần.`);
  const [target] = await tx
    .select({ id: lecturers.id, title: lecturers.title, fullName: lecturers.fullName, status: lecturers.status })
    .from(lecturers)
    .where(eq(lecturers.id, input.lecturerId));
  if (!target) throw new RequestError("Giảng viên không còn trong hệ thống.", "lecturerId");
  if (target.status !== "active") throw new RequestError("Giảng viên đang tạm nghỉ, chọn người khác.", "lecturerId");
  const before = assigneeOf(locked, step);
  if (before === target.id) throw new RequestError("Bước đang giao cho giảng viên này.", "lecturerId");
  const now = new Date();
  await tx
    .update(requestSteps)
    .set({ assigneeLecturerId: target.id, reassignedAt: now, reassignedByName: input.actor.name, reassignReason: input.reason, dueSoonNotifiedAt: null, overdueNotifiedAt: null })
    .where(eq(requestSteps.id, step.id));
  const targetName = `${target.title} ${target.fullName}`;
  if (step.status === "pending") {
    await notifyLecturers(tx, [target.id], {
      kind: "request",
      title: `Đơn ${request.code} được chuyển cho bạn xử lý`,
      body: `${REQUEST_KINDS[request.kind].label}: ${request.subject}. Bước ${step.label.toLowerCase()}${step.dueAt ? `, hạn ${formatDateTime(step.dueAt)}` : ""}. Lý do chuyển: ${input.reason}`,
      href: `/lecturer/requests?open=${request.id}`,
    });
  }
  await recordAudit(tx, {
    actor: input.actor,
    action: "assign",
    entityType: "request",
    entityId: request.id,
    entityLabel: request.code,
    summary: `Chuyển người xử lý bước "${step.label}": ${input.reason}`,
    changes: [{ field: "Người xử lý", before: before ? (await lecturerName(tx, before)) : "Chưa có", after: targetName }],
  });
}

async function lecturerName(tx: Transaction, id: string) {
  const [row] = await tx.select({ title: lecturers.title, fullName: lecturers.fullName }).from(lecturers).where(eq(lecturers.id, id));
  return row ? `${row.title} ${row.fullName}` : "Không rõ";
}

// Người xử lý bước đang chờ yêu cầu bổ sung minh chứng: bước dừng tính hạn, người gửi nhận thông báo.
export async function requestSupplement(
  tx: Transaction,
  input: { requestId: string; step: number; note: string; actor: AuditActor; authorize: (context: StepContext) => string | null },
) {
  const locked = await lockRequest(tx, input.requestId);
  const { request, steps } = locked;
  const plan = planDecision({
    kind: request.kind,
    cancelled: request.cancelledAt !== null,
    statuses: steps.map((step) => step.status),
    step: input.step,
    decision: "approved",
    now: new Date(),
    awaitingSupplement: locked.openSupplement !== null,
  });
  if (!plan.ok) throw new RequestError(plan.message);
  const step = steps[input.step];
  const denied = input.authorize(stepContext(locked, step));
  if (denied) throw new RequestError(denied);
  await tx.insert(requestSupplements).values({ requestId: request.id, stepId: step.id, requestedByUserId: input.actor.userId, requestedByName: input.actor.name, requestNote: input.note });
  await notifyRequester(tx, locked, {
    title: `Đơn ${request.code} cần bổ sung minh chứng`,
    body: `${REQUEST_KINDS[request.kind].label}: ${request.subject}. ${STEP_ROLE_LABEL[step.role]} yêu cầu: ${input.note}`,
  });
  await recordAudit(tx, {
    actor: input.actor,
    action: "update",
    entityType: "request",
    entityId: request.id,
    entityLabel: request.code,
    summary: `Yêu cầu bổ sung ở bước "${step.label}": ${input.note}`,
  });
}

// Người gửi bổ sung theo yêu cầu: thêm tệp, ghi chú; bước đang chờ được tính hạn lại từ lúc bổ sung, người xử lý nhận thông báo.
export async function submitSupplement(
  tx: Transaction,
  input: { requestId: string; userId: string; note: string; attachments: NewAttachment[]; actor: AuditActor; existingFiles: number },
) {
  const locked = await lockRequest(tx, input.requestId);
  const { request, steps, openSupplement } = locked;
  if (request.requesterUserId !== input.userId) throw new RequestError("Chỉ người gửi mới bổ sung được đơn này.");
  if (!openSupplement || request.cancelledAt) throw new RequestError("Đơn không còn chờ bổ sung. Tải lại trang.");
  if (input.attachments.length === 0 && !input.note) throw new RequestError("Thêm tệp minh chứng hoặc ghi chú phần bổ sung.", "attachments");
  if (input.existingFiles + input.attachments.length > 10) throw new RequestError("Đơn đã có quá nhiều tệp minh chứng.", "attachments");
  const now = new Date();
  await insertAttachments(tx, request.id, input.attachments, now);
  await tx.update(requestSupplements).set({ respondedAt: now, responseNote: input.note || null }).where(eq(requestSupplements.id, openSupplement.id));
  const index = steps.findIndex((step) => step.id === openSupplement.stepId);
  const step = steps[index];
  if (step?.status === "pending") {
    const dueAt = addWorkingDays(now, REQUEST_KINDS[request.kind].steps[index]?.slaDays ?? 3, await loadHolidays(tx));
    await tx.update(requestSteps).set({ dueAt, dueSoonNotifiedAt: null, overdueNotifiedAt: null }).where(eq(requestSteps.id, step.id));
    await notifyStepHandlers(tx, locked, index, {
      title: `Đơn ${request.code} đã được bổ sung`,
      body: `${REQUEST_KINDS[request.kind].label}: ${request.subject}. Người gửi đã bổ sung${input.attachments.length > 0 ? ` ${input.attachments.length} tệp` : ""}${input.note ? `: ${input.note}` : ""}. Hạn mới ${formatDateTime(dueAt)}.`,
    });
  }
  await recordAudit(tx, {
    actor: input.actor,
    action: "update",
    entityType: "request",
    entityId: request.id,
    entityLabel: request.code,
    summary: `Bổ sung minh chứng${input.attachments.length > 0 ? ` (${input.attachments.length} tệp)` : ""}${input.note ? `: ${input.note}` : ""}`,
  });
}

// Đơn bị từ chối để gửi lại: chỉ người gửi, chỉ đơn đã bị từ chối và chưa gửi lại lần nào.
export async function lockRejectedForResubmit(tx: Transaction, requestId: string, userId: string) {
  const locked = await lockRequest(tx, requestId);
  if (locked.request.requesterUserId !== userId) throw new RequestError("Chỉ người gửi mới gửi lại được đơn này.");
  if (!locked.steps.some((step) => step.status === "rejected")) throw new RequestError("Chỉ gửi lại được đơn đã bị từ chối.");
  const [again] = await tx.select({ code: academicRequests.code }).from(academicRequests).where(eq(academicRequests.resubmittedFromId, requestId));
  if (again) throw new RequestError(`Đơn đã được gửi lại thành đơn ${again.code}.`);
  const lecturerStep = locked.steps.find((step) => step.role === "lecturer");
  return { ...locked.request, lecturerAssigneeId: lecturerStep ? (locked.request.sectionLecturerId ?? lecturerStep.assigneeLecturerId) : null };
}

export async function cancelOwnRequest(tx: Transaction, requestId: string, userId: string, actor: AuditActor) {
  const { request, steps } = await lockRequest(tx, requestId);
  if (request.requesterUserId !== userId) throw new RequestError("Chỉ người gửi mới hủy được đơn này.");
  const blocked = cancelBlockedReason(request.cancelledAt !== null, steps.map((step) => step.status));
  if (blocked) throw new RequestError(blocked);
  const now = new Date();
  await tx.update(academicRequests).set({ cancelledAt: now }).where(eq(academicRequests.id, requestId));
  // Đơn đã hủy không còn bước nào đến lượt, để bước đang chờ không hiện trong hộp đơn của người xử lý.
  await tx
    .update(requestSteps)
    .set({ status: "waiting", dueAt: null })
    .where(and(eq(requestSteps.requestId, requestId), eq(requestSteps.status, "pending")));
  await tx
    .update(requestSupplements)
    .set({ respondedAt: now })
    .where(and(eq(requestSupplements.requestId, requestId), isNull(requestSupplements.respondedAt)));
  await recordAudit(tx, { actor, action: "cancel", entityType: "request", entityId: request.id, entityLabel: request.code, summary: "Người gửi hủy đơn" });
}

const SLA_BATCH = 200;

// Tác vụ request-sla: báo người xử lý bước sắp hết hạn (còn dưới 24 giờ) và bước đã quá hạn, mỗi loại một lần cho mỗi lượt đến
// hạn (cờ due_soon_notified_at, overdue_notified_at; chuyển bước, chuyển người, bổ sung thì đặt lại). Đơn đang chờ bổ sung không nhắc.
// requestIds giới hạn vào vài đơn (test), bỏ trống là mọi đơn.
export async function runRequestSlaJob(now = new Date(), requestIds?: string[]) {
  const outcome = { dueSoon: 0, overdue: 0, recipients: 0 };
  const soon = new Date(now.getTime() + 24 * 3_600_000);
  for (let round = 0; round < 20; round += 1) {
    const handled = await db.transaction(async (tx) => {
      const due = await tx
        .select({ requestId: requestSteps.requestId, stepId: requestSteps.id, dueAt: requestSteps.dueAt, dueSoonNotifiedAt: requestSteps.dueSoonNotifiedAt, overdueNotifiedAt: requestSteps.overdueNotifiedAt })
        .from(requestSteps)
        .innerJoin(academicRequests, eq(academicRequests.id, requestSteps.requestId))
        .where(
          and(
            eq(requestSteps.status, "pending"),
            lte(requestSteps.dueAt, soon),
            isNull(academicRequests.cancelledAt),
            requestIds ? inArray(requestSteps.requestId, requestIds) : undefined,
            or(and(lte(requestSteps.dueAt, now), isNull(requestSteps.overdueNotifiedAt)), isNull(requestSteps.dueSoonNotifiedAt)),
            sql`NOT EXISTS (SELECT 1 FROM ${requestSupplements} WHERE ${requestSupplements.requestId} = ${requestSteps.requestId} AND ${requestSupplements.respondedAt} IS NULL)`,
          ),
        )
        .orderBy(asc(requestSteps.dueAt))
        .limit(SLA_BATCH)
        .for("update", { of: requestSteps, skipLocked: true });
      let count = 0;
      for (const row of due) {
        const notice = slaNotice({ dueAt: row.dueAt!, dueSoonNotifiedAt: row.dueSoonNotifiedAt, overdueNotifiedAt: row.overdueNotifiedAt }, now);
        // Đã quá hạn thì không nhắc "sắp hết hạn" nữa: đánh dấu cả hai cờ.
        const flags = notice === "overdue" || row.dueAt! <= now ? { dueSoonNotifiedAt: row.dueSoonNotifiedAt ?? now, overdueNotifiedAt: now } : { dueSoonNotifiedAt: now };
        if (notice) {
          const locked = await lockRequest(tx, row.requestId);
          const index = locked.steps.findIndex((step) => step.id === row.stepId);
          const step = locked.steps[index];
          const about = `${REQUEST_KINDS[locked.request.kind].label}: ${locked.request.subject}.`;
          outcome.recipients += await notifyStepHandlers(
            tx,
            locked,
            index,
            notice === "overdue"
              ? { title: `Đơn ${locked.request.code} đã quá hạn xử lý`, body: `${about} Bước ${step.label.toLowerCase()} quá hạn từ ${formatDateTime(row.dueAt!)}.` }
              : { title: `Đơn ${locked.request.code} sắp hết hạn xử lý`, body: `${about} Bước ${step.label.toLowerCase()} hết hạn lúc ${formatDateTime(row.dueAt!)}.` },
          );
          if (notice === "overdue") outcome.overdue += 1;
          else outcome.dueSoon += 1;
        }
        await tx.update(requestSteps).set(flags).where(eq(requestSteps.id, row.stepId));
        count += 1;
      }
      return count;
    });
    if (handled < SLA_BATCH) break;
  }
  return outcome;
}

// Tác vụ định kỳ: xóa tệp minh chứng không còn dòng request_attachments nào trỏ tới (tiến trình chết giữa lúc ghi tệp và commit).
export async function sweepOrphanRequestFiles() {
  const removed = await sweepOrphanFiles("requests", async (keys) => {
    const rows = await db.select({ key: requestAttachments.storageKey }).from(requestAttachments).where(inArray(requestAttachments.storageKey, keys));
    return new Set(rows.map((row) => row.key));
  });
  return { requestFilesRemoved: removed };
}

// ---- Danh sách đơn theo quyền người xem (dùng chung cho query và test, không tự kiểm phiên) ----

const requestFaculty = alias(faculties, "request_faculty");
const requesterLecturerFaculty = alias(faculties, "requester_lecturer_faculty");
const advisor = alias(lecturers, "advisor");
const requestSection = alias(classSections, "request_section");
const sectionLecturer = alias(lecturers, "section_lecturer");
const stepLecturer = alias(lecturers, "step_lecturer");
const resubmittedFrom = alias(academicRequests, "resubmitted_from");
const resubmittedAs = alias(academicRequests, "resubmitted_as");
const visibleStep = alias(requestSteps, "visible_step");

const displayName = (title: string | null, fullName: string | null) => (fullName ? `${title} ${fullName}` : null);

// Cổng đang xem đơn: người gửi (own), cổng giảng viên (bước cố vấn, giảng viên), cổng quản trị (bước của khoa, phòng).
export type RequestPortal = "own" | "lecturer" | "office";

// Giảng viên chịu trách nhiệm bước (cùng logic với effectiveAssignee trong requests.rule): đã xử lý hoặc đã chuyển thì giữ người
// đã lưu, còn lại đi theo cố vấn hiện tại của lớp sinh hoạt, giảng viên hiện tại của lớp học phần.
const visibleStepAssignee = sql`CASE
  WHEN ${visibleStep.status} IN ('approved', 'rejected', 'skipped') OR ${visibleStep.reassignedAt} IS NOT NULL THEN ${visibleStep.assigneeLecturerId}
  WHEN ${visibleStep.role} = 'advisor' THEN ${administrativeClasses.advisorId}
  WHEN ${visibleStep.role} = 'lecturer' THEN coalesce(${requestSection.lecturerId}, ${visibleStep.assigneeLecturerId})
END`;

function hasStep(condition: SQL | undefined) {
  return exists(
    db
      .select({ id: visibleStep.id })
      .from(visibleStep)
      .where(and(eq(visibleStep.requestId, academicRequests.id), condition)),
  );
}

// Một hàm quyền xem đơn cho danh sách, chi tiết và tải minh chứng: người gửi; giảng viên có bước cố vấn, giảng viên giao cho mình;
// cán bộ có quyền bước (requests.step.*) và đơn có bước đó trong phạm vi khoa; Phòng Đào tạo có requests.supervise thấy mọi đơn
// trong phạm vi; ai đã xử lý một bước của đơn thì vẫn xem lại được.
function visibleTo(access: RequestAccess, portal: RequestPortal | "any"): SQL {
  const parts: (SQL | undefined)[] = [];
  if (portal === "own" || portal === "any") parts.push(or(eq(students.userId, access.userId), eq(requesterLecturer.userId, access.userId)));
  if ((portal === "lecturer" || portal === "any") && access.lecturerId) {
    parts.push(hasStep(and(inArray(visibleStep.role, ["advisor", "lecturer"]), sql`${visibleStepAssignee} = ${access.lecturerId}`)));
    parts.push(hasStep(and(inArray(visibleStep.role, ["advisor", "lecturer"]), eq(visibleStep.actorUserId, access.userId))));
  }
  if ((portal === "office" || portal === "any") && access.office) {
    const scope = access.office.faculty === null ? undefined : eq(requestFaculty.name, access.office.faculty);
    if (access.office.supervise) parts.push(scope ?? sql`true`);
    else if (access.office.roles.length > 0) parts.push(and(scope, hasStep(inArray(visibleStep.role, access.office.roles))));
    parts.push(hasStep(and(inArray(visibleStep.role, ["faculty", "academic-office", "exam-office"]), eq(visibleStep.actorUserId, access.userId))));
  }
  const conditions = parts.filter((part) => part !== undefined);
  return conditions.length > 0 ? or(...conditions)! : sql`false`;
}


type Row = { advisorId: string | null; sectionLecturerId: string | null; requesterUserId: string | null; faculty: string };

// Người xem làm được gì với đơn ở cổng đang xem; cùng các hàm quyền (stepDeniedReason, superviseDeniedReason) với action.
function viewerCan(view: RequestView, raw: RequestView["steps"], row: Row, access: RequestAccess, portal: RequestPortal | "any"): RequestViewerCan {
  const active = view.status === "pending" || view.status === "in-review";
  const pendingIndex = raw.findIndex((step) => step.status === "pending");
  const current = pendingIndex >= 0 ? raw[pendingIndex] : null;
  const context = current ? { role: current.role, assigneeLecturerId: current.assigneeId, faculty: row.faculty, advisorId: row.advisorId } : null;
  const handles = (target: "lecturer" | "office") => (portal === target || portal === "any") && context !== null && stepDeniedReason(access, target, context) === null;
  const decide = active && (handles("lecturer") || handles("office"));
  const isOwn = row.requesterUserId === access.userId && (portal === "own" || portal === "any");
  const supervisor = (portal === "office" || portal === "any") && superviseDeniedReason(access, row.faculty) === null;
  const finished = view.status === "approved" || view.status === "rejected" || view.status === "cancelled";
  return {
    decide,
    requestSupplement: decide,
    supervise: supervisor && active && current !== null,
    reassign: supervisor && !finished && raw.some((step) => !isOfficeStep(step.role) && (step.status === "pending" || step.status === "waiting")),
    cancel: isOwn && cancelBlockedReason(view.cancelledAt !== null, view.steps.map((step) => step.status)) === null,
    supplement: isOwn && view.openSupplement !== null && view.status === "needs-info",
    resubmit: isOwn && view.status === "rejected" && view.resubmittedAs === null,
    openFiles: true,
  };
}

// Đơn kèm người gửi, khoa, cố vấn hiện tại của sinh viên gửi, các bước, yêu cầu bổ sung và tệp minh chứng.
export async function requestRows(where: SQL, access: RequestAccess, portal: RequestPortal | "any"): Promise<RequestView[]> {
  const rows = await db
    .select({
      id: academicRequests.id,
      code: academicRequests.code,
      kind: academicRequests.kind,
      studentId: students.id,
      studentName: students.fullName,
      studentCode: students.code,
      studentUserId: students.userId,
      className: administrativeClasses.code,
      lecturerId: requesterLecturer.id,
      lecturerTitle: requesterLecturer.title,
      lecturerName: requesterLecturer.fullName,
      lecturerCode: requesterLecturer.code,
      lecturerUserId: requesterLecturer.userId,
      lecturerFaculty: requesterLecturerFaculty.name,
      faculty: requestFaculty.name,
      classSectionId: academicRequests.classSectionId,
      subject: academicRequests.subject,
      details: academicRequests.details,
      reason: academicRequests.reason,
      createdAt: academicRequests.createdAt,
      cancelledAt: academicRequests.cancelledAt,
      advisorId: advisor.id,
      advisorTitle: advisor.title,
      advisorName: advisor.fullName,
      sectionLecturerId: sectionLecturer.id,
      sectionLecturerTitle: sectionLecturer.title,
      sectionLecturerName: sectionLecturer.fullName,
      resubmittedFromId: resubmittedFrom.id,
      resubmittedFromCode: resubmittedFrom.code,
      resubmittedAsId: resubmittedAs.id,
      resubmittedAsCode: resubmittedAs.code,
    })
    .from(academicRequests)
    .innerJoin(requestFaculty, eq(requestFaculty.id, academicRequests.facultyId))
    .leftJoin(students, eq(students.id, academicRequests.requesterStudentId))
    .leftJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .leftJoin(advisor, eq(advisor.id, administrativeClasses.advisorId))
    .leftJoin(requesterLecturer, eq(requesterLecturer.id, academicRequests.requesterLecturerId))
    .leftJoin(requesterLecturerFaculty, eq(requesterLecturerFaculty.id, requesterLecturer.facultyId))
    .leftJoin(requestSection, eq(requestSection.id, academicRequests.classSectionId))
    .leftJoin(sectionLecturer, eq(sectionLecturer.id, requestSection.lecturerId))
    .leftJoin(resubmittedFrom, eq(resubmittedFrom.id, academicRequests.resubmittedFromId))
    .leftJoin(resubmittedAs, eq(resubmittedAs.resubmittedFromId, academicRequests.id))
    .where(and(where, visibleTo(access, portal)))
    .orderBy(desc(academicRequests.createdAt), desc(academicRequests.id));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [steps, files, supplements] = await Promise.all([
    db
      .select({
        id: requestSteps.id,
        requestId: requestSteps.requestId,
        role: requestSteps.role,
        label: requestSteps.label,
        assigneeLecturerId: requestSteps.assigneeLecturerId,
        lecturerTitle: stepLecturer.title,
        lecturerName: stepLecturer.fullName,
        status: requestSteps.status,
        actorName: requestSteps.actorName,
        actedAt: requestSteps.actedAt,
        comment: requestSteps.comment,
        dueAt: requestSteps.dueAt,
        onBehalf: requestSteps.onBehalf,
        reassignedAt: requestSteps.reassignedAt,
        reassignedByName: requestSteps.reassignedByName,
        reassignReason: requestSteps.reassignReason,
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
        uploadedAt: requestAttachments.uploadedAt,
      })
      .from(requestAttachments)
      .where(inArray(requestAttachments.requestId, ids))
      .orderBy(asc(requestAttachments.uploadedAt), asc(requestAttachments.id)),
    db
      .select({
        id: requestSupplements.id,
        requestId: requestSupplements.requestId,
        stepLabel: requestSteps.label,
        requestedByName: requestSupplements.requestedByName,
        requestNote: requestSupplements.requestNote,
        requestedAt: requestSupplements.requestedAt,
        respondedAt: requestSupplements.respondedAt,
        responseNote: requestSupplements.responseNote,
      })
      .from(requestSupplements)
      .innerJoin(requestSteps, eq(requestSteps.id, requestSupplements.stepId))
      .where(inArray(requestSupplements.requestId, ids))
      .orderBy(asc(requestSupplements.requestedAt)),
  ]);
  const stepsOf = Map.groupBy(steps, (step) => step.requestId);
  const filesOf = Map.groupBy(files, (file) => file.requestId);
  const supplementsOf = Map.groupBy(supplements, (supplement) => supplement.requestId);
  return rows.map((row) => {
    const isStudent = row.studentId !== null;
    const names = new Map<string, string | null>([
      ...(row.advisorId ? [[row.advisorId, displayName(row.advisorTitle, row.advisorName)] as const] : []),
      ...(row.sectionLecturerId ? [[row.sectionLecturerId, displayName(row.sectionLecturerTitle, row.sectionLecturerName)] as const] : []),
    ]);
    const assignee = (step: (typeof steps)[number]): Pick<ApprovalStep, "assigneeId" | "assigneeName"> => {
      if (step.role === "faculty") return { assigneeId: null, assigneeName: row.faculty };
      if (isOfficeStep(step.role)) return { assigneeId: null, assigneeName: OFFICE_UNIT_LABEL[step.role] };
      const id = effectiveAssignee(step, { advisorId: row.advisorId, sectionLecturerId: row.sectionLecturerId });
      if (!id) return { assigneeId: null, assigneeName: step.role === "advisor" ? "Chưa có cố vấn học tập" : null };
      const name = id === step.assigneeLecturerId ? displayName(step.lecturerTitle, step.lecturerName) : (names.get(id) ?? null);
      return { assigneeId: id, assigneeName: name };
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
      attachments: (filesOf.get(row.id) ?? []).map(({ requestId: _requestId, uploadedAt, ...file }) => ({ ...file, uploadedAt: uploadedAt.toISOString() })),
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
        onBehalf: step.onBehalf,
        reassigned:
          step.reassignedAt && step.reassignedByName && step.reassignReason
            ? { byName: step.reassignedByName, reason: step.reassignReason, at: step.reassignedAt.toISOString() }
            : null,
      })),
      supplements: (supplementsOf.get(row.id) ?? []).map(({ requestId: _requestId, requestedAt, respondedAt, ...supplement }) => ({
        ...supplement,
        requestedAt: requestedAt.toISOString(),
        respondedAt: respondedAt?.toISOString() ?? null,
      })),
      classSectionId: row.classSectionId,
      resubmittedFrom: row.resubmittedFromId && row.resubmittedFromCode ? { id: row.resubmittedFromId, code: row.resubmittedFromCode } : null,
      resubmittedAs: row.resubmittedAsId && row.resubmittedAsCode ? { id: row.resubmittedAsId, code: row.resubmittedAsCode } : null,
    };
    const view = requestView(request);
    const facts = { advisorId: row.advisorId, sectionLecturerId: row.sectionLecturerId, requesterUserId: row.studentUserId ?? row.lecturerUserId, faculty: row.faculty };
    return { ...view, can: viewerCan(view, request.steps, facts, access, portal) };
  });
}

// Đơn người xem (access) được thấy ở một cổng, kèm quyền thao tác. Không tự kiểm phiên: nơi gọi lấy access từ getRequestAccess()
// (test truyền access dựng sẵn để kiểm hàm quyền mà không cần đăng nhập).
export function requestsVisibleTo(access: RequestAccess, portal: RequestPortal | "any", requestId?: string) {
  return requestRows(requestId ? eq(academicRequests.id, requestId) : sql`true`, access, portal);
}

