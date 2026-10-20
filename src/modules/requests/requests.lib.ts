import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { newStorageKey, sweepOrphanFiles, withStoredFiles } from "@/shared/libs/storage.lib";
import { currentYear } from "@/shared/libs/date.lib";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { examSessions } from "@/modules/exams/exams.schema";
import { gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import { notifyUsers } from "@/modules/notifications/notifications.lib";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { REQUEST_CODE_PREFIX, REQUEST_KINDS, STEP_ROLE_LABEL } from "@/modules/requests/requests.constant";
import { cancelBlockedReason, formatRequestCode, initialSteps, planDecision, type StudentRequestFacts } from "@/modules/requests/requests.rule";
import { academicRequests, requestAttachments, requestCodeCounters, requestSteps } from "@/modules/requests/requests.schema";
import type { RequestDetail, RequesterType, RequestKind, StepRole } from "@/modules/requests/requests.type";

// Lỗi nghiệp vụ trong giao dịch đơn từ: action đổi thành câu báo, field có thì gắn vào ô của form.
export class RequestError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

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

export type NewAttachment = { name: string; contentType: string; storageKey: string; sizeBytes: number };

export type AttachmentFile = { name: string; contentType: string; data: Uint8Array };

// Ghi tệp minh chứng vào kho rồi chạy giao dịch tạo đơn với khóa lưu trữ của từng tệp. Giao dịch hỏng thì tệp vừa ghi bị xóa.
export function withAttachments<T>(files: AttachmentFile[], work: (attachments: NewAttachment[]) => Promise<T>) {
  const stored = files.map((file) => ({ ...file, key: newStorageKey("requests") }));
  return withStoredFiles(stored, () =>
    work(stored.map((file) => ({ name: file.name, contentType: file.contentType, storageKey: file.key, sizeBytes: file.data.byteLength }))),
  );
}

export type NewRequest = {
  kind: RequestKind;
  requester: { type: "student"; studentId: string } | { type: "lecturer"; lecturerId: string };
  facultyId: string;
  subject: string;
  details: RequestDetail[];
  reason: string;
  attachments: NewAttachment[];
  lecturerAssigneeId: string | null;
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
      subject: input.subject,
      details: input.details,
      reason: input.reason,
      createdAt: now,
    })
    .returning({ id: academicRequests.id, code: academicRequests.code });
  await tx.insert(requestSteps).values(initialSteps(input.kind, now, input.lecturerAssigneeId).map((step) => ({ ...step, requestId: request.id })));
  if (input.attachments.length > 0) {
    await tx
      .insert(requestAttachments)
      .values(
        input.attachments.map((file) => ({
          requestId: request.id,
          fileName: file.name,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          storageKey: file.storageKey,
          uploadedAt: now,
        })),
      );
  }
  return request;
}

// Cột điểm của lớp và điểm đang lưu của một sinh viên ở cột đó (null nếu chưa nhập).
export async function currentComponentScore(tx: Transaction, input: { classSectionId: string; enrollmentId: string; componentKey: string }) {
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

// Giá trị trên hệ thống để người duyệt đối chiếu với ô sinh viên tự khai: điểm cột cuối kỳ (phúc khảo), lịch thi của lớp (hoãn thi).
export async function studentRequestFacts(tx: Transaction, kind: RequestKind, input: { classSectionId: string; enrollmentId: string }): Promise<StudentRequestFacts> {
  if (kind === "regrade") {
    const { score } = await currentComponentScore(tx, { ...input, componentKey: "final" });
    return { examScore: score };
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

// Khóa dòng đơn: mọi thao tác đổi trạng thái (duyệt, từ chối, hủy) đều khóa dòng này trước, nên hai người bấm cùng lúc
// thì người sau chờ người trước xong rồi đọc lại trạng thái mới.
async function lockRequest(tx: Transaction, requestId: string) {
  const [request] = await tx
    .select({
      id: academicRequests.id,
      code: academicRequests.code,
      kind: academicRequests.kind,
      subject: academicRequests.subject,
      requesterStudentId: academicRequests.requesterStudentId,
      cancelledAt: academicRequests.cancelledAt,
      faculty: faculties.name,
      advisorId: administrativeClasses.advisorId,
      requesterUserId: sql<string | null>`coalesce(${students.userId}, ${requesterLecturer.userId})`,
    })
    .from(academicRequests)
    .innerJoin(faculties, eq(faculties.id, academicRequests.facultyId))
    .leftJoin(students, eq(students.id, academicRequests.requesterStudentId))
    .leftJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .leftJoin(requesterLecturer, eq(requesterLecturer.id, academicRequests.requesterLecturerId))
    .where(eq(academicRequests.id, requestId))
    .for("update", { of: academicRequests });
  if (!request) throw new RequestError("Đơn không còn trong hệ thống. Tải lại trang.");
  const steps = await tx.select().from(requestSteps).where(eq(requestSteps.requestId, requestId)).orderBy(asc(requestSteps.position)).for("update");
  return { request, steps };
}

export type StepContext = { role: StepRole; assigneeLecturerId: string | null; faculty: string; advisorId: string | null };

export type StepDecision = {
  requestId: string;
  step: number;
  decision: "approved" | "rejected";
  comment: string;
  actor: { userId: string | null; name: string };
  // Trả câu báo nếu người này không được xử lý bước, null nếu được.
  authorize: (context: StepContext) => string | null;
};

export async function decideStep(tx: Transaction, input: StepDecision) {
  const { request, steps } = await lockRequest(tx, input.requestId);
  const now = new Date();
  const plan = planDecision({
    kind: request.kind,
    cancelled: request.cancelledAt !== null,
    statuses: steps.map((step) => step.status),
    step: input.step,
    decision: input.decision,
    now,
  });
  if (!plan.ok) throw new RequestError(plan.message);
  const current = steps[input.step];
  const denied = input.authorize({ role: current.role, assigneeLecturerId: current.assigneeLecturerId, faculty: request.faculty, advisorId: request.advisorId });
  if (denied) throw new RequestError(denied);
  await tx
    .update(requestSteps)
    .set({ status: input.decision, actorUserId: input.actor.userId, actorName: input.actor.name, actedAt: now, comment: input.comment || null })
    .where(eq(requestSteps.id, current.id));
  if (plan.next) {
    await tx.update(requestSteps).set({ status: "pending", dueAt: plan.next.dueAt }).where(eq(requestSteps.id, steps[plan.next.index].id));
  }
  // Báo người gửi trên cổng của họ; người gửi chưa có tài khoản cổng thì bỏ qua.
  if (!request.requesterUserId) return;
  const actorRole = STEP_ROLE_LABEL[current.role];
  const opinion = input.comment ? ` Ý kiến: ${input.comment}` : "";
  const about = `${REQUEST_KINDS[request.kind].label}: ${request.subject}.`;
  const nextRole = plan.next ? STEP_ROLE_LABEL[steps[plan.next.index].role] : null;
  const message =
    input.decision === "rejected"
      ? { title: `Đơn ${request.code} bị từ chối`, body: `${about} ${actorRole} từ chối đơn.${opinion}` }
      : nextRole
        ? { title: `Đơn ${request.code} chuyển sang ${nextRole}`, body: `${about} ${actorRole} đã duyệt, đơn đang chờ ${nextRole} xử lý.${opinion}` }
        : { title: `Đơn ${request.code} đã được duyệt`, body: `${about} ${actorRole} đã duyệt bước cuối, đơn hoàn tất.${opinion}` };
  const audience = request.requesterStudentId ? "student" : "lecturer";
  await notifyUsers(tx, [request.requesterUserId], audience, {
    kind: "request",
    ...message,
    href: audience === "student" ? "/application/requests" : "/lecturer/requests",
  });
}

export async function cancelOwnRequest(tx: Transaction, requestId: string, userId: string) {
  const { request, steps } = await lockRequest(tx, requestId);
  if (request.requesterUserId !== userId) throw new RequestError("Chỉ người gửi mới hủy được đơn này.");
  const blocked = cancelBlockedReason(request.cancelledAt !== null, steps.map((step) => step.status));
  if (blocked) throw new RequestError(blocked);
  await tx.update(academicRequests).set({ cancelledAt: new Date() }).where(eq(academicRequests.id, requestId));
  // Đơn đã hủy không còn bước nào đến lượt, để bước đang chờ không hiện trong hộp đơn của người xử lý.
  await tx
    .update(requestSteps)
    .set({ status: "waiting", dueAt: null })
    .where(and(eq(requestSteps.requestId, requestId), eq(requestSteps.status, "pending")));
}

// Tác vụ định kỳ: xóa tệp minh chứng không còn dòng request_attachments nào trỏ tới (tiến trình chết giữa lúc ghi tệp và commit).
export async function sweepOrphanRequestFiles() {
  const removed = await sweepOrphanFiles("requests", async (keys) => {
    const rows = await db.select({ key: requestAttachments.storageKey }).from(requestAttachments).where(inArray(requestAttachments.storageKey, keys));
    return new Set(rows.map((row) => row.key));
  });
  return { requestFilesRemoved: removed };
}
