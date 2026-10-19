"use server";

import { and, eq, gte, lte, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { dayjs, formatDate, weekdayOf } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { weekdayLabel } from "@/shared/constants/period.constant";
import { requireSession } from "@/modules/authentication/authentication.query";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { classSections, enrollments, sectionMeetings } from "@/modules/course-registration/course-registration.schema";
import { courses, majors } from "@/modules/curriculum/curriculum.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { getCurrentLecturer, getCurrentStudent } from "@/modules/users/users.query";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { officeStepRoles, REQUEST_KINDS, REQUESTS_CONSTRAINT_MESSAGE, STEP_ROLE_LABEL } from "@/modules/requests/requests.constant";
import { cancelOwnRequest, decideStep, insertRequest, RequestError, type StepContext } from "@/modules/requests/requests.lib";
import { getRequest } from "@/modules/requests/requests.query";
import {
  DECIDE_STEP_SCHEMA,
  LECTURER_REQUEST_SCHEMA,
  makeupLabel,
  scoreText,
  sessionLabel,
  STUDENT_REQUEST_SCHEMA,
  studentRequestContent,
  type DecideStepInput,
  type LecturerRequestInput,
  type LecturerRequestValues,
  type StudentRequestInput,
} from "@/modules/requests/requests.rule";
import type { RequestDetail, RequestView } from "@/modules/requests/requests.type";

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

async function reloaded(id: string): Promise<ActionResult<RequestView>> {
  const request = await getRequest(id);
  return request ? actionOk(request) : actionError("Đã lưu nhưng chưa đọc lại được đơn, tải lại trang.");
}

export async function createStudentRequest(input: StudentRequestInput): Promise<ActionResult<RequestView>> {
  const student = await getCurrentStudent();
  const parsed = parseInput(STUDENT_REQUEST_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { kind, fields, reason, attachments } = parsed.data;
  const roles = REQUEST_KINDS[kind].steps.map((step) => step.role);
  let requestId: string;
  try {
    requestId = await db.transaction(async (tx) => {
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
      if (typeof fields.section === "string") {
        const [section] = await tx
          .select({ code: classSections.code, courseName: courses.name, lecturerId: classSections.lecturerId })
          .from(enrollments)
          .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
          .innerJoin(courses, eq(courses.id, classSections.courseId))
          .where(and(eq(enrollments.studentId, student.id), eq(enrollments.classSectionId, fields.section), eq(enrollments.status, "enrolled")));
        if (!section) throw new RequestError("Bạn không học lớp này. Chọn lớp trong danh sách.", "section");
        sectionLabel = `${section.code} ${section.courseName}`;
        if (roles.includes("lecturer")) {
          if (!section.lecturerId) throw new RequestError(`Lớp ${section.code} chưa có giảng viên phụ trách nên chưa gửi được đơn. Liên hệ Phòng Đào tạo.`, "section");
          lecturerId = section.lecturerId;
        }
      }
      const content = studentRequestContent({ kind, fields }, sectionLabel);
      const request = await insertRequest(tx, {
        kind,
        requester: { type: "student", studentId: student.id },
        facultyId: profile.facultyId,
        ...content,
        reason,
        attachments,
        lecturerAssigneeId: lecturerId,
      });
      return request.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId);
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

export async function createLecturerRequest(input: LecturerRequestInput): Promise<ActionResult<RequestView>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(LECTURER_REQUEST_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  let requestId: string;
  try {
    requestId = await db.transaction(async (tx) => {
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
        const [student] = await tx
          .select({ fullName: students.fullName, code: students.code })
          .from(enrollments)
          .innerJoin(students, eq(students.id, enrollments.studentId))
          .where(and(eq(enrollments.classSectionId, section.id), eq(enrollments.studentId, values.studentId), eq(enrollments.status, "enrolled")));
        if (!student) throw new RequestError("Sinh viên không có trong danh sách lớp.", "studentId");
        content = {
          subject: `${section.code} ${section.courseName}`,
          details: [
            { label: "Sinh viên", value: `${student.fullName}, ${formatStudentCode(student.code)}` },
            { label: "Cột điểm", value: values.componentLabel },
            { label: "Điểm cũ", value: scoreText(values.oldScore) },
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
        ...content,
        reason: values.reason,
        attachments: values.attachments,
        lecturerAssigneeId: null,
      });
      return request.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId);
}

// Cổng giảng viên: cố vấn duyệt bước cố vấn của sinh viên lớp mình, giảng viên dạy lớp xử lý bước giảng viên được giao.
export async function decideAsLecturer(requestId: string, input: DecideStepInput): Promise<ActionResult<RequestView>> {
  const lecturer = await getCurrentLecturer();
  const { user } = await requireSession();
  if (!isUuid(requestId)) return actionError(MISSING);
  const parsed = parseInput(DECIDE_STEP_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const authorize = ({ role, assigneeLecturerId, advisorId }: StepContext) => {
    if (role === "advisor") return advisorId === lecturer.id ? null : "Bạn không phải cố vấn học tập của sinh viên gửi đơn.";
    if (role === "lecturer") return assigneeLecturerId === lecturer.id ? null : "Bước này giao cho giảng viên khác.";
    return `Bước này do ${STEP_ROLE_LABEL[role]} xử lý, không xử lý ở cổng giảng viên.`;
  };
  try {
    await db.transaction((tx) => decideStep(tx, { requestId, ...parsed.data, actor: { userId: user.id, name: lecturer.displayName }, authorize }));
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId);
}

// Cổng quản trị: bước của khoa, Phòng Đào tạo, Phòng Khảo thí theo vai trò đang dùng và phạm vi khoa của vai trò.
export async function decideAsOffice(requestId: string, input: DecideStepInput): Promise<ActionResult<RequestView>> {
  const viewer = await requirePermission("requests.process");
  if (!isUuid(requestId)) return actionError(MISSING);
  const parsed = parseInput(DECIDE_STEP_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const allowed = officeStepRoles(viewer.roleKey);
  const authorize = ({ role, faculty }: StepContext) => {
    if (role === "advisor" || role === "lecturer") return `Bước này do ${STEP_ROLE_LABEL[role].toLowerCase()} xử lý ở cổng giảng viên.`;
    if (!allowed.includes(role)) return `Bước này do ${STEP_ROLE_LABEL[role]} xử lý, vai trò ${viewer.roleName} không xử lý được.`;
    if (!inScope(viewer, faculty)) return `Đơn thuộc ${faculty}, ngoài phạm vi vai trò của bạn.`;
    return null;
  };
  try {
    await db.transaction((tx) => decideStep(tx, { requestId, ...parsed.data, actor: { userId: viewer.id, name: viewer.name }, authorize }));
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId);
}

export async function cancelRequest(requestId: string): Promise<ActionResult<RequestView>> {
  const { user } = await requireSession();
  if (!isUuid(requestId)) return actionError(MISSING);
  try {
    await db.transaction((tx) => cancelOwnRequest(tx, requestId, user.id));
  } catch (error) {
    return failure(error);
  }
  revalidateRequests();
  return reloaded(requestId);
}
