"use server";

import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionFailure, type ActionResult } from "@/shared/libs/action.lib";
import { dayjs, formatDate, schoolToday, weekdayOf } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { readFile } from "@/shared/libs/storage.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { weekdayLabel } from "@/shared/constants/period.constant";
import { requireSession } from "@/modules/authentication/authentication.query";
import { auditActorOf, type AuditActor } from "@/modules/audit/audit.lib";
import { requirePermission } from "@/modules/access/access.query";
import { classSections, enrollments, sectionMeetings, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, majors } from "@/modules/curriculum/curriculum.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { getStudentStandings } from "@/modules/grades/grades.query";
import { withdrawBlockedReason } from "@/modules/grades/grades.rule";
import { getRegulation } from "@/modules/settings/settings.query";
import { getCurrentLecturer, getCurrentStudent } from "@/modules/users/users.query";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { ATTACHMENT_LIMIT, REQUEST_KINDS, REQUESTS_CONSTRAINT_MESSAGE } from "@/modules/requests/requests.constant";
import {
  cancelOwnRequest,
  currentComponentScore,
  decideStep,
  gradeSheetStatus,
  insertRequest,
  lockRejectedForResubmit,
  reassignStep,
  RequestError,
  requestSupplement,
  studentRequestFacts,
  submitSupplement,
  withAttachments,
  type AttachmentFile,
} from "@/modules/requests/requests.lib";
import { getRequest, getRequestAccess, type RequestPortal } from "@/modules/requests/requests.query";
import { reserveTermsUsed } from "@/modules/requests/requests.reserve";
import {
  checkAttachments,
  DECIDE_STEP_SCHEMA,
  gradeChangeBlockedReason,
  gradeChangeSheetBlockedReason,
  LECTURER_REQUEST_SCHEMA,
  makeupLabel,
  missingAttachmentReason,
  overloadBlockedReason,
  readRequestForm,
  REASSIGN_STEP_SCHEMA,
  regradeBlockedReason,
  reserveBlockedReason,
  reserveTermsOf,
  RESUBMIT_SCHEMA,
  scoreText,
  sessionLabel,
  stepDeniedReason,
  STUDENT_REQUEST_SCHEMA,
  studentRequestContent,
  SUPERVISE_STEP_SCHEMA,
  superviseDeniedReason,
  SUPPLEMENT_REQUEST_SCHEMA,
  SUPPLEMENT_SUBMIT_SCHEMA,
  type DecideStepInput,
  type LecturerRequestValues,
  type ReassignStepInput,
  type StudentRequestFacts,
  type SuperviseStepInput,
  type SupplementRequestInput,
} from "@/modules/requests/requests.rule";
import { requestAttachments as requestAttachmentsTable } from "@/modules/requests/requests.schema";
import type { RequestDetail, RequestKind, RequestView } from "@/modules/requests/requests.type";

const MISSING = "Đơn không còn trong hệ thống. Tải lại trang.";

function failure(error: unknown) {
  if (error instanceof RequestError) return actionError(error.message, error.field ? { [error.field]: error.message } : undefined);
  return actionFailure(error, REQUESTS_CONSTRAINT_MESSAGE);
}

function revalidateRequests() {
  for (const path of ["/application/requests", "/application/dashboard", "/lecturer/requests", "/lecturer", "/administrator/requests", "/administrator"]) {
    revalidatePath(path);
  }
}

async function readAttachments(files: File[]): Promise<{ ok: true; files: AttachmentFile[] } | ActionFailure> {
  const uploads = await Promise.all(files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) })));
  const checked = checkAttachments(uploads.map((upload) => ({ name: upload.name, size: upload.data.byteLength, head: upload.data.subarray(0, 16) })));
  if (!checked.ok) return actionError(checked.message, { attachments: checked.message });
  return { ok: true, files: uploads.map((upload, index) => ({ ...checked.files[index], data: upload.data })) };
}

async function reloaded(id: string, portal: RequestPortal): Promise<ActionResult<RequestView>> {
  const request = await getRequest(id, portal);
  return request ? actionOk(request) : actionError("Đã lưu nhưng chưa đọc lại được đơn, tải lại trang.");
}

const studentActor = (student: { fullName: string }, userId: string): AuditActor => ({ userId, name: student.fullName, role: "Sinh viên" });
const lecturerActor = (lecturer: { displayName: string }, userId: string): AuditActor => ({ userId, name: lecturer.displayName, role: "Giảng viên" });

async function regulationRules() {
  const regulation = await getRegulation();
  return {
    maxPerTerm: regulation.credits.maxPerTerm,
    overloadMinCpa: regulation.credits.overloadMinCpa,
    overloadExtraCredits: regulation.credits.overloadExtraCredits,
    regradeWindowDays: regulation.workflow.regradeWindowDays,
    maxReserveTerms: regulation.workflow.maxReserveTerms,
    withdrawDeadlineWeeks: regulation.workflow.withdrawDeadlineWeeks,
  };
}

async function checkSectionEligibility(tx: Transaction, kind: RequestKind, classSectionId: string, rules: { regradeWindowDays: number; withdrawDeadlineWeeks: number }) {
  if (kind === "regrade") {
    const blocked = regradeBlockedReason(await gradeSheetStatus(tx, classSectionId), new Date(), rules.regradeWindowDays);
    if (blocked) throw new RequestError(blocked, "section");
  }
  if (kind === "grade-change") {
    const blocked = gradeChangeSheetBlockedReason((await gradeSheetStatus(tx, classSectionId))?.status ?? null);
    if (blocked) throw new RequestError(blocked, "classId");
  }
  if (kind === "withdraw") {
    const [term] = await tx
      .select({ startDate: terms.startDate, endDate: terms.endDate })
      .from(classSections)
      .innerJoin(terms, eq(terms.id, classSections.termId))
      .where(eq(classSections.id, classSectionId));
    const sheet = await gradeSheetStatus(tx, classSectionId);
    const blocked = term ? withdrawBlockedReason({ termStart: term.startDate, termEnd: term.endDate, sheetStatus: sheet?.status ?? null }, schoolToday(), rules.withdrawDeadlineWeeks) : null;
    if (blocked) throw new RequestError(blocked, "section");
  }
}

async function checkReserveLimit(tx: Transaction, studentId: string, details: RequestDetail[], maxReserveTerms: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`reserve:${studentId}`}))`);
  const used = await reserveTermsUsed(tx, studentId, { includeInFlight: true });
  const blocked = reserveBlockedReason({ used, requested: reserveTermsOf(details) ?? 1 }, maxReserveTerms);
  if (blocked) throw new RequestError(blocked, "duration");
}

export async function createStudentRequest(formData: FormData): Promise<ActionResult<RequestView>> {
  const student = await getCurrentStudent();
  const { user } = await requireSession();
  const form = readRequestForm(formData);
  const parsed = parseInput(STUDENT_REQUEST_SCHEMA, form.input);
  if (!parsed.ok) return parsed;
  const uploads = await readAttachments(form.files);
  if (!uploads.ok) return uploads;
  const { kind, fields, reason } = parsed.data;
  const missing = missingAttachmentReason(kind, uploads.files.length);
  if (missing) return actionError(missing, { attachments: missing });
  const rules = await regulationRules();
  if (kind === "overload") {
    const [standing] = await getStudentStandings([student.id]);
    const blocked = overloadBlockedReason({ credits: Number(fields.credits), cpa4: standing?.cpa4 ?? 0 }, rules);
    if (blocked) return actionError(blocked.message, { [blocked.field]: blocked.message });
  }
  const roles = REQUEST_KINDS[kind].steps.map((step) => step.role);
  let requestId: string;
  try {
    requestId = await withAttachments(uploads.files, (attachments) =>
      db.transaction(async (tx) => {
        const [profile] = await tx
          .select({ facultyId: majors.facultyId, advisorId: administrativeClasses.advisorId })
          .from(students)
          .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
          .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
          .where(eq(students.id, student.id));
        if (roles.includes("advisor") && !profile.advisorId) {
          throw new RequestError(`Lớp ${student.className} chưa có cố vấn học tập nên chưa gửi được loại đơn này. Liên hệ giáo vụ khoa.`, "kind");
        }
        let sectionLabel: string | null = null;
        let lecturerId: string | null = null;
        let facts: StudentRequestFacts = {};
        let classSectionId: string | null = null;
        if (typeof fields.section === "string") {
          const [section] = await tx
            .select({ enrollmentId: enrollments.id, code: classSections.code, courseName: courses.name, lecturerId: classSections.lecturerId })
            .from(enrollments)
            .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
            .innerJoin(courses, eq(courses.id, classSections.courseId))
            .where(and(eq(enrollments.studentId, student.id), eq(enrollments.classSectionId, fields.section), eq(enrollments.status, "enrolled")));
          if (!section) throw new RequestError("Bạn không học lớp này. Chọn lớp trong danh sách.", "section");
          classSectionId = fields.section;
          sectionLabel = `${section.code} ${section.courseName}`;
          await checkSectionEligibility(tx, kind, fields.section, rules);
          if (roles.includes("lecturer")) {
            if (!section.lecturerId) throw new RequestError(`Lớp ${section.code} chưa có giảng viên phụ trách nên chưa gửi được đơn. Liên hệ Phòng Đào tạo.`, "section");
            lecturerId = section.lecturerId;
          }
          facts = await studentRequestFacts(tx, kind, { classSectionId: fields.section, enrollmentId: section.enrollmentId });
        }
        const content = studentRequestContent({ kind, fields }, sectionLabel, facts);
        if (kind === "reserve") await checkReserveLimit(tx, student.id, content.details, rules.maxReserveTerms);
        const request = await insertRequest(tx, {
          kind,
          requester: { type: "student", studentId: student.id },
          facultyId: profile.facultyId,
          classSectionId,
          ...content,
          reason,
          attachments,
          lecturerAssigneeId: lecturerId,
          actor: studentActor(student, user.id),
        });
        return request.id;
      }),
    );
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId, "own");
}

type OwnSection = { id: string; code: string; courseName: string; termId: string; endDate: string };

async function teachingLeaveContent(
  tx: Transaction,
  lecturerId: string,
  section: OwnSection,
  input: Extract<LecturerRequestValues, { kind: "teaching-leave" }>,
): Promise<{ subject: string; details: RequestDetail[] }> {
  const [date, startText] = input.sessionDate.split("|");
  const day = dayjs(date);
  if (!day.isValid() || !day.isAfter(dayjs(), "day")) throw new RequestError("Chỉ xin nghỉ buổi học từ ngày mai trở đi.", "sessionDate");
  if (day.isAfter(section.endDate, "day")) throw new RequestError("Buổi này nằm ngoài thời gian học của lớp.", "sessionDate");
  const [meeting] = await tx
    .select({ dayOfWeek: sectionMeetings.dayOfWeek, startPeriod: sectionMeetings.startPeriod, endPeriod: sectionMeetings.endPeriod, room: rooms.code })
    .from(sectionMeetings)
    .innerJoin(rooms, eq(rooms.id, sectionMeetings.roomId))
    .where(and(eq(sectionMeetings.classSectionId, section.id), eq(sectionMeetings.dayOfWeek, weekdayOf(date)), eq(sectionMeetings.startPeriod, Number(startText))));
  if (!meeting) throw new RequestError("Lớp không có buổi học vào ngày và tiết này.", "sessionDate");
  const conflicts = await tx
    .select({ code: classSections.code })
    .from(sectionMeetings)
    .innerJoin(classSections, eq(classSections.id, sectionMeetings.classSectionId))
    .where(
      and(
        eq(classSections.lecturerId, lecturerId),
        eq(classSections.termId, section.termId),
        ne(classSections.status, "cancelled"),
        eq(sectionMeetings.dayOfWeek, input.makeupDay),
        lte(sectionMeetings.startPeriod, input.makeupEnd),
        gte(sectionMeetings.endPeriod, input.makeupStart),
      ),
    );
  if (conflicts.length > 0) {
    throw new RequestError(`Giờ dạy bù trùng lịch dạy lớp ${[...new Set(conflicts.map((row) => row.code))].join(", ")}. Chọn giờ khác.`, "makeupDay");
  }
  const [room] = await tx
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.code, input.makeupRoom), eq(rooms.status, "active")))
    .limit(1);
  if (!room) throw new RequestError(`Phòng ${input.makeupRoom} không có hoặc đang bảo trì. Chọn phòng khác.`, "makeupRoom");
  return {
    subject: `${section.code}, ${weekdayLabel(meeting.dayOfWeek)}, ${formatDate(date)}`,
    details: [
      { label: "Buổi nghỉ", value: sessionLabel(date, meeting) },
      { label: "Dạy bù", value: makeupLabel(input) },
    ],
  };
}

export async function createLecturerRequest(formData: FormData): Promise<ActionResult<RequestView>> {
  const lecturer = await getCurrentLecturer();
  const { user } = await requireSession();
  const form = readRequestForm(formData);
  const parsed = parseInput(LECTURER_REQUEST_SCHEMA, form.input);
  if (!parsed.ok) return parsed;
  const uploads = await readAttachments(form.files);
  if (!uploads.ok) return uploads;
  const values = parsed.data;
  const missing = missingAttachmentReason(values.kind, uploads.files.length);
  if (missing) return actionError(missing, { attachments: missing });
  const rules = await regulationRules();
  let requestId: string;
  try {
    requestId = await withAttachments(uploads.files, (attachments) =>
      db.transaction(async (tx) => {
        const [section] = await tx
          .select({
            id: classSections.id,
            code: classSections.code,
            courseName: courses.name,
            termId: classSections.termId,
            endDate: classSections.endDate,
            lecturerId: classSections.lecturerId,
          })
          .from(classSections)
          .innerJoin(courses, eq(courses.id, classSections.courseId))
          .where(eq(classSections.id, values.classId));
        if (!section || section.lecturerId !== lecturer.id) throw new RequestError("Bạn không dạy lớp này. Chọn lớp trong danh sách.", "classId");
        const [profile] = await tx.select({ facultyId: lecturers.facultyId }).from(lecturers).where(eq(lecturers.id, lecturer.id));
        let content: { subject: string; details: RequestDetail[] };
        if (values.kind === "grade-change") {
          await checkSectionEligibility(tx, "grade-change", section.id, rules);
          const [student] = await tx
            .select({ enrollmentId: enrollments.id, fullName: students.fullName, code: students.code })
            .from(enrollments)
            .innerJoin(students, eq(students.id, enrollments.studentId))
            .where(and(eq(enrollments.classSectionId, section.id), eq(enrollments.studentId, values.studentId), eq(enrollments.status, "enrolled")));
          if (!student) throw new RequestError("Sinh viên không có trong danh sách lớp.", "studentId");
          const current = await currentComponentScore(tx, { classSectionId: section.id, enrollmentId: student.enrollmentId, componentKey: values.componentKey });
          const blocked = gradeChangeBlockedReason(current.component, current.score, values.newScore);
          if (blocked) throw new RequestError(blocked.message, blocked.field);
          content = {
            subject: `${section.code} ${section.courseName}`,
            details: [
              { label: "Sinh viên", value: `${student.fullName}, ${formatStudentCode(student.code)}` },
              { label: "Cột điểm", value: current.component?.label ?? values.componentKey },
              { label: "Điểm cũ", value: scoreText(current.score) },
              { label: "Điểm mới", value: scoreText(values.newScore) },
            ],
          };
        } else {
          content = await teachingLeaveContent(tx, lecturer.id, section, values);
        }
        const request = await insertRequest(tx, {
          kind: values.kind,
          requester: { type: "lecturer", lecturerId: lecturer.id },
          facultyId: profile.facultyId,
          classSectionId: section.id,
          ...content,
          reason: values.reason,
          attachments,
          lecturerAssigneeId: null,
          actor: lecturerActor(lecturer, user.id),
        });
        return request.id;
      }),
    );
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId, "own");
}

export async function decideAsLecturer(requestId: string, input: DecideStepInput): Promise<ActionResult<RequestView>> {
  const lecturer = await getCurrentLecturer();
  const { user } = await requireSession();
  if (!isUuid(requestId)) return actionError(MISSING);
  const parsed = parseInput(DECIDE_STEP_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const access = await getRequestAccess();
  try {
    await db.transaction((tx) =>
      decideStep(tx, { requestId, ...parsed.data, actor: lecturerActor(lecturer, user.id), authorize: (context) => stepDeniedReason(access, "lecturer", context) }),
    );
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId, "lecturer");
}

export async function decideAsOffice(requestId: string, input: DecideStepInput): Promise<ActionResult<RequestView>> {
  const viewer = await requirePermission("requests.process");
  if (!isUuid(requestId)) return actionError(MISSING);
  const parsed = parseInput(DECIDE_STEP_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const access = await getRequestAccess();
  try {
    await db.transaction((tx) => decideStep(tx, { requestId, ...parsed.data, actor: auditActorOf(viewer), authorize: (context) => stepDeniedReason(access, "office", context) }));
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId, "office");
}

export async function superviseRequestStep(requestId: string, input: SuperviseStepInput): Promise<ActionResult<RequestView>> {
  const viewer = await requirePermission("requests.supervise");
  if (!isUuid(requestId)) return actionError(MISSING);
  const parsed = parseInput(SUPERVISE_STEP_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const access = await getRequestAccess();
  try {
    await db.transaction((tx) =>
      decideStep(tx, {
        requestId,
        step: parsed.data.step,
        decision: parsed.data.decision,
        comment: parsed.data.reason,
        onBehalf: true,
        effect: parsed.data.effect,
        actor: auditActorOf(viewer),
        authorize: (context) => superviseDeniedReason(access, context.faculty),
      }),
    );
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId, "office");
}

export async function reassignRequestStep(requestId: string, input: ReassignStepInput): Promise<ActionResult<RequestView>> {
  const viewer = await requirePermission("requests.supervise");
  if (!isUuid(requestId)) return actionError(MISSING);
  const parsed = parseInput(REASSIGN_STEP_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const access = await getRequestAccess();
  try {
    await db.transaction((tx) => reassignStep(tx, { requestId, ...parsed.data, actor: auditActorOf(viewer), authorize: (faculty) => superviseDeniedReason(access, faculty) }));
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId, "office");
}

export async function askForSupplement(requestId: string, portal: "lecturer" | "office", input: SupplementRequestInput): Promise<ActionResult<RequestView>> {
  if (!isUuid(requestId)) return actionError(MISSING);
  let actor: AuditActor;
  if (portal === "office") actor = auditActorOf(await requirePermission("requests.process"));
  else {
    const lecturer = await getCurrentLecturer();
    actor = lecturerActor(lecturer, (await requireSession()).user.id);
  }
  const parsed = parseInput(SUPPLEMENT_REQUEST_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const access = await getRequestAccess();
  try {
    await db.transaction((tx) => requestSupplement(tx, { requestId, ...parsed.data, actor, authorize: (context) => stepDeniedReason(access, portal, context) }));
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId, portal);
}

async function requesterActor(): Promise<AuditActor> {
  const { user, roles } = await requireSession();
  return { userId: user.id, name: user.name, role: roles.includes("student") ? "Sinh viên" : "Giảng viên" };
}

export async function submitRequestSupplement(formData: FormData): Promise<ActionResult<RequestView>> {
  const actor = await requesterActor();
  const form = readRequestForm(formData);
  const parsed = parseInput(SUPPLEMENT_SUBMIT_SCHEMA, form.input);
  if (!parsed.ok) return parsed;
  const request = await getRequest(parsed.data.requestId, "own");
  if (!request?.can.supplement) return actionError("Đơn không còn chờ bổ sung. Tải lại trang.");
  if (request.attachments.length + form.files.length > ATTACHMENT_LIMIT.files * 2) return actionError("Đơn đã có quá nhiều tệp minh chứng.", { attachments: "Quá nhiều tệp" });
  const uploads = await readAttachments(form.files);
  if (!uploads.ok) return uploads;
  try {
    await withAttachments(uploads.files, (attachments) =>
      db.transaction((tx) =>
        submitSupplement(tx, { requestId: request.id, userId: actor.userId!, note: parsed.data.note, attachments, actor, existingFiles: request.attachments.length }),
      ),
    );
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(request.id, "own");
}

export async function resubmitRequest(formData: FormData): Promise<ActionResult<RequestView>> {
  const actor = await requesterActor();
  const form = readRequestForm(formData);
  const parsed = parseInput(RESUBMIT_SCHEMA, form.input);
  if (!parsed.ok) return parsed;
  const previous = await getRequest(parsed.data.requestId, "own");
  if (!previous?.can.resubmit) return actionError("Chỉ gửi lại được đơn của bạn đã bị từ chối và chưa gửi lại lần nào. Tải lại trang.");
  const uploads = await readAttachments(form.files);
  if (!uploads.ok) return uploads;
  const kept = previous.attachments.filter((file) => parsed.data.keepAttachmentIds.includes(file.id));
  const keptFiles: AttachmentFile[] = [];
  if (kept.length > 0) {
    const rows = await db
      .select({ id: requestAttachmentsTable.id, storageKey: requestAttachmentsTable.storageKey })
      .from(requestAttachmentsTable)
      .where(and(eq(requestAttachmentsTable.requestId, previous.id), inArray(requestAttachmentsTable.id, kept.map((file) => file.id))));
    for (const file of kept) {
      const key = rows.find((row) => row.id === file.id)?.storageKey;
      const data = key ? await readFile(key) : null;
      if (!data) return actionError(`Tệp ${file.fileName} của đơn cũ không còn trong kho, chọn lại tệp.`, { attachments: "Tệp cũ không còn" });
      keptFiles.push({ name: file.fileName, contentType: file.contentType, data });
    }
  }
  const files = [...keptFiles, ...uploads.files];
  const checked = checkAttachments(files.map((file) => ({ name: file.name, size: file.data.byteLength, head: file.data.subarray(0, 16) })));
  if (!checked.ok) return actionError(checked.message, { attachments: checked.message });
  const missing = missingAttachmentReason(previous.kind, files.length);
  if (missing) return actionError(missing, { attachments: missing });
  const rules = await regulationRules();
  if (previous.kind === "overload") {
    const [standing] = await getStudentStandings([previous.requesterId]);
    if ((standing?.cpa4 ?? 0) < rules.overloadMinCpa) return actionError(overloadBlockedReason({ credits: rules.maxPerTerm + 1, cpa4: standing?.cpa4 ?? 0 }, rules)!.message);
  }
  let requestId: string;
  try {
    requestId = await withAttachments(files, (attachments) =>
      db.transaction(async (tx) => {
        const old = await lockRejectedForResubmit(tx, previous.id, actor.userId!);
        if (old.classSectionId) await checkSectionEligibility(tx, old.kind, old.classSectionId, rules);
        if (old.kind === "reserve" && old.requesterStudentId) await checkReserveLimit(tx, old.requesterStudentId, old.details, rules.maxReserveTerms);
        const created = await insertRequest(tx, {
          kind: old.kind,
          requester: old.requesterStudentId ? { type: "student", studentId: old.requesterStudentId } : { type: "lecturer", lecturerId: old.requesterLecturerId! },
          facultyId: old.facultyId,
          classSectionId: old.classSectionId,
          resubmittedFromId: old.id,
          subject: old.subject,
          details: old.details,
          reason: parsed.data.reason,
          attachments,
          lecturerAssigneeId: old.lecturerAssigneeId,
          actor,
        });
        return created.id;
      }),
    );
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId, "own");
}

export async function cancelRequest(requestId: string): Promise<ActionResult<RequestView>> {
  const actor = await requesterActor();
  if (!isUuid(requestId)) return actionError(MISSING);
  try {
    await db.transaction((tx) => cancelOwnRequest(tx, requestId, actor.userId!, actor));
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId, "own");
}
