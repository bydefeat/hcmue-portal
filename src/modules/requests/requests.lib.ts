import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Transaction } from "@/shared/libs/db.lib";
import { currentYear } from "@/shared/libs/date.lib";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { REQUEST_CODE_PREFIX } from "@/modules/requests/requests.constant";
import { cancelBlockedReason, formatRequestCode, initialSteps, planDecision } from "@/modules/requests/requests.rule";
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

export type NewRequest = {
  kind: RequestKind;
  requester: { type: "student"; studentId: string } | { type: "lecturer"; lecturerId: string };
  facultyId: string;
  subject: string;
  details: RequestDetail[];
  reason: string;
  attachments: { name: string; size: number; type: string }[];
  lecturerAssigneeId: string | null;
};

export async function insertRequest(tx: Transaction, input: NewRequest) {
  const now = new Date();
  const code = await allocateRequestCode(tx, input.requester.type);
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
      .values(input.attachments.map((file) => ({ requestId: request.id, fileName: file.name, contentType: file.type, sizeBytes: file.size, uploadedAt: now })));
  }
  return request;
}

const requesterLecturer = alias(lecturers, "requester_lecturer");

// Khóa dòng đơn: mọi thao tác đổi trạng thái (duyệt, từ chối, hủy) đều khóa dòng này trước, nên hai người bấm cùng lúc
// thì người sau chờ người trước xong rồi đọc lại trạng thái mới.
async function lockRequest(tx: Transaction, requestId: string) {
  const [request] = await tx
    .select({
      id: academicRequests.id,
      kind: academicRequests.kind,
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
