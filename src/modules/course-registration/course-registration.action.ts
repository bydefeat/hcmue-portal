"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { z } from "zod";
import { and, eq, gt, inArray, isNull, lte, ne, notInArray, sql } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, InputError, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { env } from "@/shared/libs/env.lib";
import { PDF_MIME } from "@/shared/libs/pdf.lib";
import { bytesToBase64 } from "@/shared/libs/spreadsheet.lib";
import { studentEmailOf } from "@/shared/libs/student-code.lib";
import {
  ADMIN_REGISTER_SCHEMA,
  CLASS_SECTION_SCHEMA,
  HOLD_SCHEMA,
  PERIOD_SCHEMA,
  pickTimetable,
  receiptConfirmedAt,
  receiptVerificationCode,
  REGISTER_SCHEMA,
  SWAP_SCHEMA,
  TERM_SCHEMA,
  termNaming,
  type AdminRegisterInput,
  type ClassSectionInput,
  type HoldInput,
  type PeriodInput,
  type RegisterInput,
  type SwapInput,
  type TermInput,
} from "@/modules/course-registration/course-registration.rule";
import { conflictsOf, REGISTRATION_CONSTRAINT_MESSAGE } from "@/modules/course-registration/course-registration.constant";
import {
  adminDropStudent,
  adminRegisterStudent,
  cancelSection,
  dropForStudent,
  joinWaitlistForStudent,
  loadSections,
  moveStudents,
  promoteWaitlist,
  registerForStudent,
  swapForStudent,
  type RegistrationActor,
} from "@/modules/course-registration/course-registration.lib";
import { classRosterPdf, registrationReceiptPdf } from "@/modules/course-registration/course-registration.pdf";
import {
  getClassRoster,
  getClassSection,
  getRegistrationEvents,
  getRegistrationHolds,
  getRegistrationPeriods,
  getRegistrationTargetTerm,
  getStudentEnrollments,
  getTerms,
  getUnregisteredStudents,
  readClassSectionAfterWrite,
  REGISTRATION_REMINDER_HREF,
} from "@/modules/course-registration/course-registration.query";
import {
  classSectionAudienceMajors,
  classSections,
  labGroups,
  registrationHolds,
  registrationPeriods,
  reservedSeatMajors,
  reservedSeats,
  sectionMeetings,
  terms,
  waitlistEntries,
} from "@/modules/course-registration/course-registration.schema";
import { campuses, rooms } from "@/modules/facilities/facilities.schema";
import { can, inScope } from "@/modules/access/access.constant";
import { getViewer, requirePermission, requireSchoolWidePermission } from "@/modules/access/access.query";
import type { Viewer } from "@/modules/access/access.type";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { deliverMailSoon, enqueueMail } from "@/modules/mail/mail.lib";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import { syncClassSessions, weeklyScheduleOf, type WeeklySchedule } from "@/modules/schedule/schedule.lib";
import { getRegulation } from "@/modules/settings/settings.query";
import { getCurrentLecturer, getCurrentStudent, getStudent } from "@/modules/users/users.query";
import type { ClassSectionView, RegistrationHold, RegistrationPeriodView, Term } from "@/modules/course-registration/course-registration.type";

const STAFF_CHANNEL = "Phòng Đào tạo";

function staffActor(viewer: Viewer): RegistrationActor {
  return { userId: viewer.id, label: viewer.name, channel: STAFF_CHANNEL };
}

function failure(error: unknown) {
  return actionFailure(error, REGISTRATION_CONSTRAINT_MESSAGE);
}

function revalidateRegistration() {
  revalidatePath("/application", "layout");
  revalidatePath("/administrator", "layout");
}

// ---- Sinh viên tự đăng ký ----

export async function registerSections(input: RegisterInput): Promise<ActionResult<{ registeredIds: string[] }>> {
  const student = await getCurrentStudent();
  const parsed = parseInput(REGISTER_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const [term, regulation] = await Promise.all([getRegistrationTargetTerm(), getRegulation()]);
  let registeredIds: string[];
  try {
    registeredIds = await db.transaction((tx) =>
      registerForStudent(tx, { studentId: student.id, termId: term.id, sectionIds: parsed.data.sectionIds, labChoices: parsed.data.labChoices, rules: regulation, now: new Date() }),
    );
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/application", "layout");
  return actionOk({ registeredIds });
}

export async function dropSection(sectionId: string): Promise<ActionResult<{ registeredIds: string[] }>> {
  const student = await getCurrentStudent();
  if (!isUuid(sectionId)) return actionError("Lớp không còn tồn tại, tải lại trang.");
  const [term, regulation] = await Promise.all([getRegistrationTargetTerm(), getRegulation()]);
  let registeredIds: string[];
  try {
    ({ registeredIds } = await db.transaction((tx) => dropForStudent(tx, { studentId: student.id, termId: term.id, sectionId, rules: regulation, now: new Date() })));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/application", "layout");
  return actionOk({ registeredIds });
}

// Đổi lớp cùng học phần hoặc đổi nhóm thực hành trong một bước: không được chỗ mới thì vẫn giữ chỗ cũ.
export async function swapSection(input: SwapInput): Promise<ActionResult<{ registeredIds: string[] }>> {
  const student = await getCurrentStudent();
  const parsed = parseInput(SWAP_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const [term, regulation] = await Promise.all([getRegistrationTargetTerm(), getRegulation()]);
  let registeredIds: string[];
  try {
    ({ registeredIds } = await db.transaction((tx) =>
      swapForStudent(tx, {
        studentId: student.id,
        termId: term.id,
        fromSectionId: parsed.data.fromSectionId,
        toSectionId: parsed.data.toSectionId,
        labGroupId: parsed.data.labGroupId ?? null,
        rules: regulation,
        now: new Date(),
      }),
    ));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/application", "layout");
  return actionOk({ registeredIds });
}

export async function joinWaitlist(sectionId: string): Promise<ActionResult<{ position: number }>> {
  const student = await getCurrentStudent();
  if (!isUuid(sectionId)) return actionError("Lớp không còn tồn tại, tải lại trang.");
  const [term, regulation] = await Promise.all([getRegistrationTargetTerm(), getRegulation()]);
  let position: number;
  try {
    position = await db.transaction((tx) => joinWaitlistForStudent(tx, { studentId: student.id, termId: term.id, sectionId, rules: regulation, now: new Date() }));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/application/registration");
  return actionOk({ position });
}

export async function leaveWaitlist(sectionId: string): Promise<ActionResult> {
  const student = await getCurrentStudent();
  if (!isUuid(sectionId)) return actionError("Lớp không còn tồn tại, tải lại trang.");
  try {
    await db
      .update(waitlistEntries)
      .set({ status: "cancelled", resolvedAt: new Date() })
      .where(and(eq(waitlistEntries.studentId, student.id), eq(waitlistEntries.classSectionId, sectionId), eq(waitlistEntries.status, "waiting")));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/application/registration");
  return actionOk();
}

// ---- Lớp học phần ----

// Tra id theo mã (phòng, ngành); mã không có trong danh mục, hoặc mã phòng trùng ở nhiều cơ sở, thì báo lỗi vào ô tương ứng.
function idsByCode(rows: { id: string; code: string }[], wanted: string[], field: string, label: string) {
  const missing = wanted.filter((code) => !rows.some((row) => row.code === code));
  if (missing.length > 0) throw new InputError(`${label} ${missing.join(", ")} không có trong danh mục`, field);
  const ambiguous = wanted.filter((code) => rows.filter((row) => row.code === code).length > 1);
  if (ambiguous.length > 0) throw new InputError(`${label} ${ambiguous.join(", ")} có ở nhiều cơ sở, đổi mã phòng để phân biệt`, field);
  return new Map(rows.map((row) => [row.code, row.id]));
}

type RoomFacts = { id: string; code: string; capacity: number; status: "active" | "maintenance"; note: string; campus: string };

// Phòng phải đang dùng được và đủ chỗ (phòng lý thuyết cho cả lớp, phòng thực hành cho từng nhóm); lịch không trùng phòng, không
// trùng giờ giảng viên với lớp khác trong cả học kỳ (mọi khoa, kể cả lớp nháp), cùng tiêu chí với conflictsOf của giao diện.
async function scheduleProblem(
  tx: Transaction,
  candidate: {
    id: string | null;
    termId: string;
    lecturerId: string | null;
    capacity: number;
    meetings: { dayOfWeek: number; startPeriod: number; endPeriod: number; room: string }[];
    labGroups: { code: string; dayOfWeek: number; startPeriod: number; endPeriod: number; room: string; capacity: number }[];
  },
  roomRows: RoomFacts[],
) {
  const roomOf = new Map(roomRows.map((room) => [room.code, room]));
  for (const meeting of candidate.meetings) {
    const room = roomOf.get(meeting.room)!;
    if (room.status === "maintenance") return { field: "meetings", message: `Phòng ${room.code} đang bảo trì${room.note ? ` (${room.note})` : ""}, chọn phòng khác.` };
    if (room.capacity < candidate.capacity) return { field: "capacity", message: `Phòng ${room.code} chỉ có ${room.capacity} chỗ, ít hơn sĩ số tối đa ${candidate.capacity}. Giảm sĩ số hoặc chọn phòng lớn hơn.` };
  }
  for (const group of candidate.labGroups) {
    const room = roomOf.get(group.room)!;
    if (room.status === "maintenance") return { field: "labGroups", message: `Phòng ${room.code} đang bảo trì${room.note ? ` (${room.note})` : ""}, chọn phòng khác cho nhóm ${group.code}.` };
    if (room.capacity < group.capacity) return { field: "labGroups", message: `Phòng ${room.code} chỉ có ${room.capacity} chỗ, ít hơn sĩ số nhóm ${group.code} (${group.capacity}).` };
  }
  const others = await loadSections(tx, and(eq(classSections.termId, candidate.termId), ne(classSections.status, "cancelled"), candidate.id ? ne(classSections.id, candidate.id) : undefined)!);
  const [conflict] = conflictsOf(
    {
      id: candidate.id ?? "",
      status: "open",
      lecturerId: candidate.lecturerId,
      meetings: candidate.meetings,
      labGroups: candidate.labGroups.map((group) => ({ id: group.code, code: group.code, capacity: group.capacity, enrolled: 0, meeting: group })),
    },
    others,
  );
  if (conflict) return { field: conflict.kind === "lecturer" ? "lecturerId" : "meetings", message: `${conflict.message}. Đổi giờ, phòng hoặc giảng viên trước khi lưu.` };
  return null;
}

async function inScopeSections(viewer: Viewer, termId: string) {
  const rows = await loadSections(db, eq(classSections.termId, termId));
  return rows
    .map((section) => ({ ...section, isFull: section.enrolled >= section.capacity, conflicts: conflictsOf(section, rows) }))
    .filter((section) => inScope(viewer, section.faculty));
}

// Lưu lớp trả lại cả danh sách lớp trong phạm vi của học kỳ với xung đột tính ở server trên toàn học kỳ: sửa một lớp có thể làm
// lớp khác (khoa khác) hết hoặc thêm xung đột, giao diện không tự tính lại trên danh sách đã lọc theo khoa.
export async function saveClassSection(termId: string, id: string | null, input: ClassSectionInput): Promise<ActionResult<{ saved: ClassSectionView; sections: ClassSectionView[] }>> {
  const viewer = await requirePermission("class-sections.manage");
  if (!isUuid(termId) || (id !== null && !isUuid(id))) return actionError("Lớp học phần không còn tồn tại, tải lại trang.");
  const parsed = parseInput(CLASS_SECTION_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  const regulation = await getRegulation();
  let sectionId: string;
  try {
    sectionId = await db.transaction(async (tx) => {
      const [term] = await tx.select({ startDate: terms.startDate, endDate: terms.endDate }).from(terms).where(eq(terms.id, termId));
      if (!term) throw new InputError("Học kỳ không còn tồn tại, tải lại trang.", "courseCode");
      const [course] = await tx
        .select({ id: courses.id, faculty: faculties.name })
        .from(courses)
        .innerJoin(faculties, eq(faculties.id, courses.facultyId))
        .where(eq(courses.code, values.courseCode));
      if (!course) throw new InputError("Học phần không có trong danh mục", "courseCode");
      if (!inScope(viewer, course.faculty)) throw new InputError("Học phần thuộc khoa khác, bạn không mở lớp được", "courseCode");
      const roomCodes = [...new Set([...values.meetings.map((meeting) => meeting.room), ...values.labGroups.map((group) => group.room)])];
      const majorCodes = [...new Set([...values.audienceMajors, ...values.reservedSeats.flatMap((seat) => seat.majorCodes)])];
      const [roomRows, majorRows] = await Promise.all([
        tx
          .select({ id: rooms.id, code: rooms.code, capacity: rooms.capacity, status: rooms.status, note: rooms.note, campus: campuses.name })
          .from(rooms)
          .innerJoin(campuses, eq(campuses.id, rooms.campusId))
          .where(inArray(rooms.code, roomCodes)),
        majorCodes.length > 0 ? tx.select({ id: majors.id, code: majors.code }).from(majors).where(inArray(majors.code, majorCodes)) : [],
      ]);
      const roomIds = idsByCode(roomRows, roomCodes, "meetings", "Phòng");
      const majorIds = idsByCode(majorRows, majorCodes, "audienceMajors", "Ngành");
      const code = `${values.courseCode}.${String(values.sectionNumber).padStart(2, "0")}`;
      const columns = {
        lecturerId: values.lecturerId ?? null,
        capacity: values.capacity,
        minEnrollment: values.minEnrollment,
        audienceCohorts: values.audienceCohorts.length > 0 ? values.audienceCohorts : null,
        audienceNote: values.audienceNote || null,
      };

      let rowId: string;
      let previousSchedule: WeeklySchedule | null = null;
      let previousCapacity = 0;
      if (id) {
        const [existing] = await tx
          .select({ status: classSections.status, enrolled: classSections.enrolledCount, courseId: classSections.courseId, capacity: classSections.capacity })
          .from(classSections)
          .where(and(eq(classSections.id, id), eq(classSections.termId, termId)))
          .for("update");
        if (!existing) throw new InputError("Lớp học phần không còn tồn tại, tải lại trang.", "courseCode");
        if (existing.courseId !== course.id) throw new InputError("Không đổi được học phần của lớp đã mở", "courseCode");
        if (existing.status === "cancelled" && values.status !== "cancelled") throw new InputError("Lớp đã hủy không mở lại được; mở lớp mới nếu cần", "status");
        if (values.status === "draft" && existing.enrolled > 0) {
          throw new InputError(`Lớp đang có ${existing.enrolled} sinh viên, không chuyển về nháp được. Hủy lớp (sinh viên được báo) nếu không mở nữa`, "status");
        }
        if (values.status !== "cancelled" && values.capacity < existing.enrolled) {
          throw new InputError(`Lớp đang có ${existing.enrolled} sinh viên, sĩ số tối đa không nhỏ hơn số này`, "capacity");
        }
        if (values.status === "cancelled") {
          if (existing.status !== "cancelled") await cancelSection(tx, id, staffActor(viewer));
          return id;
        }
        previousSchedule = await weeklyScheduleOf(tx, id);
        previousCapacity = existing.capacity;
        await tx.update(classSections).set({ ...columns, status: values.status }).where(eq(classSections.id, id));
        rowId = id;
      } else {
        if (values.status === "cancelled") throw new InputError("Lớp mới chỉ ở trạng thái nháp hoặc mở đăng ký", "status");
        const [row] = await tx
          .insert(classSections)
          .values({ ...columns, status: values.status, termId, courseId: course.id, sectionNumber: values.sectionNumber, code, startDate: term.startDate, endDate: term.endDate })
          .returning({ id: classSections.id });
        rowId = row.id;
      }

      const problem = await scheduleProblem(tx, { id: rowId, termId, lecturerId: columns.lecturerId, capacity: values.capacity, meetings: values.meetings, labGroups: values.labGroups }, roomRows);
      if (problem) throw new InputError(problem.message, problem.field);

      await tx.delete(sectionMeetings).where(eq(sectionMeetings.classSectionId, rowId));
      await tx.insert(sectionMeetings).values(values.meetings.map((meeting) => ({ classSectionId: rowId, dayOfWeek: meeting.dayOfWeek, startPeriod: meeting.startPeriod, endPeriod: meeting.endPeriod, roomId: roomIds.get(meeting.room)! })));

      await tx.delete(classSectionAudienceMajors).where(eq(classSectionAudienceMajors.classSectionId, rowId));
      if (values.audienceMajors.length > 0) {
        await tx.insert(classSectionAudienceMajors).values(values.audienceMajors.map((majorCode) => ({ classSectionId: rowId, majorId: majorIds.get(majorCode)! })));
      }

      // Nhóm thực hành và chỗ dành riêng giữ theo mã/tên để không mất sinh viên đã xếp; bỏ nhóm đang có người thì DB chặn.
      const labCodes = values.labGroups.map((group) => `${code}.${group.code}`);
      await tx.delete(labGroups).where(and(eq(labGroups.classSectionId, rowId), labCodes.length > 0 ? notInArray(labGroups.code, labCodes) : undefined));
      for (const group of values.labGroups) {
        const labValues = { dayOfWeek: group.dayOfWeek, startPeriod: group.startPeriod, endPeriod: group.endPeriod, roomId: roomIds.get(group.room)!, capacity: group.capacity };
        await tx
          .insert(labGroups)
          .values({ ...labValues, classSectionId: rowId, code: `${code}.${group.code}` })
          .onConflictDoUpdate({ target: [labGroups.classSectionId, labGroups.code], set: labValues });
      }
      const seatLabels = values.reservedSeats.map((seat) => seat.label);
      await tx.delete(reservedSeats).where(and(eq(reservedSeats.classSectionId, rowId), seatLabels.length > 0 ? notInArray(reservedSeats.label, seatLabels) : undefined));
      for (const seat of values.reservedSeats) {
        const [existingSeat] = await tx
          .select({ id: reservedSeats.id })
          .from(reservedSeats)
          .where(and(eq(reservedSeats.classSectionId, rowId), eq(reservedSeats.label, seat.label)));
        const seatId = existingSeat
          ? (await tx.update(reservedSeats).set({ seats: seat.seats, cohorts: seat.cohorts }).where(eq(reservedSeats.id, existingSeat.id)).returning({ id: reservedSeats.id }))[0].id
          : (await tx.insert(reservedSeats).values({ classSectionId: rowId, label: seat.label, seats: seat.seats, cohorts: seat.cohorts }).returning({ id: reservedSeats.id }))[0].id;
        await tx.delete(reservedSeatMajors).where(eq(reservedSeatMajors.reservedSeatId, seatId));
        if (seat.majorCodes.length > 0) await tx.insert(reservedSeatMajors).values(seat.majorCodes.map((majorCode) => ({ reservedSeatId: seatId, majorId: majorIds.get(majorCode)! })));
      }
      // Buổi học (điểm danh) sinh lại theo lịch tuần mới; đổi lịch thì báo sinh viên của lớp và giảng viên.
      await syncClassSessions(tx, rowId, { previous: previousSchedule });
      // Tăng sĩ số lớp đang mở: xếp người trong danh sách chờ vào chỗ mới.
      if (id && values.status === "open" && values.capacity > previousCapacity) await promoteWaitlist(tx, rowId, regulation, new Date());
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: id ? "update" : "create",
        entityType: "class-section",
        entityId: rowId,
        entityLabel: code,
        summary: id ? `Sửa lớp ${code}` : `Mở lớp ${code}`,
        changes: id && values.capacity !== previousCapacity ? [{ field: "Sĩ số tối đa", before: String(previousCapacity), after: String(values.capacity) }] : [],
      });
      return rowId;
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator", "layout");
  revalidatePath("/application", "layout");
  const sections = await inScopeSections(viewer, termId);
  const saved = sections.find((section) => section.id === sectionId) ?? (await readClassSectionAfterWrite(sectionId));
  return saved ? actionOk({ saved, sections }) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

const sectionIdsSchema = z.array(z.uuid()).min(1, "Chọn ít nhất một lớp").max(100);

export async function assignLecturer(sectionId: string, lecturerId: string | null): Promise<ActionResult<ClassSectionView>> {
  const viewer = await requirePermission("teaching.assign");
  if (!isUuid(sectionId) || (lecturerId !== null && !isUuid(lecturerId))) return actionError("Lớp hoặc giảng viên không còn tồn tại, tải lại trang.");
  const section = await getClassSection(sectionId);
  if (!section || !inScope(viewer, section.faculty)) return actionError("Lớp học phần không còn tồn tại hoặc thuộc khoa khác.");
  try {
    await db.transaction(async (tx) => {
      if (lecturerId) {
        // Trùng giờ dạy kiểm với lịch mới nhất của cả học kỳ, cùng hàm conflictsOf với trang lớp học phần.
        const others = await loadSections(tx, and(eq(classSections.termId, section.termId), ne(classSections.status, "cancelled"), ne(classSections.id, section.id))!);
        const clash = conflictsOf({ ...section, lecturerId }, others).find((conflict) => conflict.kind === "lecturer");
        if (clash) throw new InputError(`Giảng viên đã dạy ${clash.withCode} cùng giờ với ${section.code}. Chọn giảng viên khác hoặc đổi lịch lớp trước.`);
      }
      await tx.update(classSections).set({ lecturerId }).where(eq(classSections.id, sectionId));
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator", "layout");
  const updated = await readClassSectionAfterWrite(sectionId);
  return updated ? actionOk(updated) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Mở thêm lớp nháp cho học phần đang đầy: cùng sĩ số, đối tượng (ngành, khóa, ghi chú) và chỗ dành riêng với lớp gốc, số thứ tự kế tiếp,
// chưa có lịch, phòng, giảng viên (chép lịch cũ chắc chắn trùng phòng với lớp gốc). Xếp lịch ở mục Lớp học phần rồi mới mở đăng ký.
export async function openExtraSections(sectionIds: string[]): Promise<ActionResult<ClassSectionView[]>> {
  const viewer = await requirePermission("class-sections.manage");
  const parsed = sectionIdsSchema.safeParse(sectionIds);
  if (!parsed.success) return actionError("Chọn ít nhất một lớp.");
  let createdIds: string[];
  try {
    createdIds = await db.transaction(async (tx) => {
      const ids: string[] = [];
      for (const sourceId of parsed.data) {
        const source = await getClassSection(sourceId);
        if (!source || !inScope(viewer, source.faculty)) throw new InputError("Có lớp không còn tồn tại hoặc thuộc khoa khác.", "sectionIds");
        const [origin] = await tx.select().from(classSections).where(eq(classSections.id, sourceId));
        const [{ next }] = await tx
          .select({ next: sql<number>`coalesce(max(${classSections.sectionNumber}), 0) + 1` })
          .from(classSections)
          .where(and(eq(classSections.termId, origin.termId), eq(classSections.courseId, origin.courseId)));
        const code = `${source.courseCode}.${String(next).padStart(2, "0")}`;
        const [created] = await tx
          .insert(classSections)
          .values({
            termId: origin.termId,
            courseId: origin.courseId,
            sectionNumber: next,
            code,
            capacity: origin.capacity,
            minEnrollment: origin.minEnrollment,
            status: "draft",
            startDate: origin.startDate,
            endDate: origin.endDate,
            audienceCohorts: origin.audienceCohorts,
            audienceNote: origin.audienceNote,
          })
          .returning({ id: classSections.id });
        const audience = await tx.select({ majorId: classSectionAudienceMajors.majorId }).from(classSectionAudienceMajors).where(eq(classSectionAudienceMajors.classSectionId, sourceId));
        if (audience.length > 0) await tx.insert(classSectionAudienceMajors).values(audience.map((row) => ({ classSectionId: created.id, majorId: row.majorId })));
        const seats = await tx.select().from(reservedSeats).where(eq(reservedSeats.classSectionId, sourceId));
        for (const seat of seats) {
          const [copy] = await tx.insert(reservedSeats).values({ classSectionId: created.id, label: seat.label, seats: seat.seats, cohorts: seat.cohorts }).returning({ id: reservedSeats.id });
          const seatMajors = await tx.select({ majorId: reservedSeatMajors.majorId }).from(reservedSeatMajors).where(eq(reservedSeatMajors.reservedSeatId, seat.id));
          if (seatMajors.length > 0) await tx.insert(reservedSeatMajors).values(seatMajors.map((row) => ({ reservedSeatId: copy.id, majorId: row.majorId })));
        }
        await recordAudit(tx, { actor: auditActorOf(viewer), action: "create", entityType: "class-section", entityId: created.id, entityLabel: code, summary: `Mở thêm lớp nháp ${code} từ lớp đầy ${source.code}` });
        ids.push(created.id);
      }
      return ids;
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator", "layout");
  const sections = await Promise.all(createdIds.map((id) => readClassSectionAfterWrite(id)));
  return actionOk(sections.filter((section) => section !== null));
}

export async function cancelSections(sectionIds: string[]): Promise<ActionResult<{ dropped: number }>> {
  const viewer = await requirePermission("class-sections.manage");
  const parsed = sectionIdsSchema.safeParse(sectionIds);
  if (!parsed.success) return actionError("Chọn ít nhất một lớp.");
  let dropped = 0;
  try {
    dropped = await db.transaction(async (tx) => {
      let total = 0;
      for (const id of parsed.data.toSorted()) {
        const section = await getClassSection(id);
        if (!section || !inScope(viewer, section.faculty)) throw new InputError("Có lớp không còn tồn tại hoặc thuộc khoa khác.", "sectionIds");
        const result = await cancelSection(tx, id, staffActor(viewer));
        total += result.dropped;
        await recordAudit(tx, { actor: auditActorOf(viewer), action: "update", entityType: "class-section", entityId: id, entityLabel: section.code, summary: `Hủy lớp ${section.code}, rút ${result.dropped} sinh viên` });
      }
      return total;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateRegistration();
  return actionOk({ dropped });
}

// Chuyển sinh viên của lớp vừa hủy sang lớp khác cùng học phần; mỗi sinh viên kiểm như đăng ký, ai không đủ điều kiện thì trả lý do.
export async function moveCancelledStudents(fromId: string, toId: string): Promise<ActionResult<{ moved: number; remaining: number; skipped: { studentName: string; reason: string }[] }>> {
  const viewer = await requirePermission("class-sections.manage");
  if (!isUuid(fromId) || !isUuid(toId)) return actionError("Lớp không còn tồn tại, tải lại trang.");
  const [from, to, regulation] = await Promise.all([getClassSection(fromId), getClassSection(toId), getRegulation()]);
  if (!from || !to || !inScope(viewer, to.faculty)) return actionError("Lớp không còn tồn tại hoặc thuộc khoa khác.");
  let result: Awaited<ReturnType<typeof moveStudents>>;
  try {
    result = await db.transaction((tx) => moveStudents(tx, { fromId, toId, actor: staffActor(viewer), rules: regulation, now: new Date() }));
  } catch (error) {
    return failure(error);
  }
  const names = await Promise.all(result.skipped.map((entry) => getStudent(entry.studentId)));
  revalidateRegistration();
  return actionOk({
    moved: result.moved,
    remaining: result.skipped.length,
    skipped: result.skipped.map((entry, index) => ({ studentName: names[index] ? `${names[index]!.code} ${names[index]!.fullName}` : "Sinh viên", reason: entry.reason })),
  });
}

// ---- Danh sách chờ (Phòng Đào tạo) ----

// Chạy lại việc xếp từ danh sách chờ cho một lớp (ví dụ sau khi gỡ khóa cho người đứng đầu danh sách).
export async function processWaitlist(sectionId: string): Promise<ActionResult<{ promoted: number }>> {
  const viewer = await requirePermission("registration.manage");
  if (!isUuid(sectionId)) return actionError("Lớp không còn tồn tại, tải lại trang.");
  const [section, regulation] = await Promise.all([getClassSection(sectionId), getRegulation()]);
  if (!section || !inScope(viewer, section.faculty)) return actionError("Lớp không còn tồn tại hoặc thuộc khoa khác.");
  let promoted: string[];
  try {
    promoted = await db.transaction((tx) => promoteWaitlist(tx, sectionId, regulation, new Date()));
  } catch (error) {
    return failure(error);
  }
  revalidateRegistration();
  return actionOk({ promoted: promoted.length });
}

export async function removeWaitlistEntry(entryId: string, reason: string): Promise<ActionResult> {
  const viewer = await requirePermission("registration.manage");
  if (!isUuid(entryId)) return actionError("Lượt chờ không còn tồn tại, tải lại trang.");
  const note = reason.trim();
  if (note.length < 5) return actionError("Ghi lý do để sinh viên biết", { reason: "Tối thiểu 5 ký tự" });
  try {
    const removed = await db.transaction(async (tx) => {
      const [entry] = await tx
        .update(waitlistEntries)
        .set({ status: "cancelled", resolvedAt: new Date() })
        .where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.status, "waiting")))
        .returning({ studentId: waitlistEntries.studentId, sectionId: waitlistEntries.classSectionId });
      if (!entry) return false;
      const [section] = await tx.select({ code: classSections.code, termId: classSections.termId, faculty: faculties.name }).from(classSections).innerJoin(courses, eq(courses.id, classSections.courseId)).innerJoin(faculties, eq(faculties.id, courses.facultyId)).where(eq(classSections.id, entry.sectionId));
      if (!inScope(viewer, section.faculty)) throw new InputError("Lớp thuộc khoa khác.");
      await notifyStudents(tx, [entry.studentId], { kind: "system", title: `Bạn được đưa khỏi danh sách chờ lớp ${section.code}`, body: `Lý do: ${note}`, href: "/application/registration" });
      return true;
    });
    if (!removed) return actionError("Sinh viên không còn trong danh sách chờ.");
  } catch (error) {
    return failure(error);
  }
  revalidateRegistration();
  return actionOk();
}

// ---- Học kỳ, đợt đăng ký ----

function termLabel(term: { name: string }) {
  return term.name;
}

export async function createTerm(input: TermInput): Promise<ActionResult<Term>> {
  const viewer = await requireSchoolWidePermission("registration.manage");
  const parsed = parseInput(TERM_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const naming = termNaming(parsed.data.academicYear, parsed.data.semester);
  let termId: string;
  try {
    termId = await db.transaction(async (tx) => {
      const [row] = await tx.insert(terms).values({ ...naming, ...parsed.data }).returning({ id: terms.id });
      await recordAudit(tx, { actor: auditActorOf(viewer), action: "create", entityType: "term", entityId: row.id, entityLabel: naming.name, summary: `Tạo ${naming.name}, ${formatDate(parsed.data.startDate)} đến ${formatDate(parsed.data.endDate)}` });
      return row.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator", "layout");
  const term = (await getTerms()).find((entry) => entry.id === termId);
  return term ? actionOk(term) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Đặt học kỳ hiện tại (học kỳ đang học: thời khóa biểu, điểm danh, học phí) hoặc học kỳ nhận đăng ký. Mỗi loại chỉ một học kỳ
// (unique index), đổi trong một transaction: bỏ cờ ở học kỳ cũ rồi đặt cho học kỳ mới.
export async function setTermFlag(termId: string, flag: "current" | "registration-target"): Promise<ActionResult<Term[]>> {
  const viewer = await requireSchoolWidePermission("registration.manage");
  if (!isUuid(termId)) return actionError("Học kỳ không còn tồn tại, tải lại trang.");
  const column = flag === "current" ? terms.isCurrent : terms.isRegistrationTarget;
  const label = flag === "current" ? "học kỳ hiện tại" : "học kỳ nhận đăng ký";
  try {
    await db.transaction(async (tx) => {
      const [target] = await tx.select({ id: terms.id, name: terms.name }).from(terms).where(eq(terms.id, termId)).for("update");
      if (!target) throw new InputError("Học kỳ không còn tồn tại, tải lại trang.");
      const [previous] = await tx.select({ id: terms.id, name: terms.name }).from(terms).where(eq(column, true)).for("update");
      if (previous?.id === termId) throw new InputError(`${termLabel(target)} đã là ${label}.`);
      const set = flag === "current" ? { isCurrent: false } : { isRegistrationTarget: false };
      if (previous) await tx.update(terms).set(set).where(eq(terms.id, previous.id));
      await tx.update(terms).set(flag === "current" ? { isCurrent: true } : { isRegistrationTarget: true }).where(eq(terms.id, termId));
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "update",
        entityType: "term",
        entityId: termId,
        entityLabel: target.name,
        summary: `Đặt ${target.name} là ${label}`,
        changes: [{ field: label[0].toUpperCase() + label.slice(1), before: previous?.name ?? "Chưa đặt", after: target.name }],
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return actionOk(await getTerms());
}

function periodAudit(values: { name: string; cohorts: number[]; opensAt: Date; closesAt: Date; minCredits: number | null; maxCredits: number | null }) {
  const credits = values.minCredits === null && values.maxCredits === null ? "theo quy chế" : `${values.minCredits ?? "quy chế"} đến ${values.maxCredits ?? "quy chế"} tín chỉ`;
  return `${values.name}: khóa ${values.cohorts.join(", ")}, ${formatDateTime(values.opensAt)} đến ${formatDateTime(values.closesAt)}, hạn mức ${credits}`;
}

export async function savePeriod(termId: string, id: string | null, input: PeriodInput): Promise<ActionResult<RegistrationPeriodView>> {
  const viewer = await requireSchoolWidePermission("registration.manage");
  if (!isUuid(termId) || (id !== null && !isUuid(id))) return actionError("Đợt đăng ký không còn tồn tại, tải lại trang.");
  const parsed = parseInput(PERIOD_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = { ...parsed.data, opensAt: new Date(parsed.data.opensAt), closesAt: new Date(parsed.data.closesAt) };
  let periodId: string;
  try {
    periodId = await db.transaction(async (tx) => {
      const [row] = id
        ? await tx.update(registrationPeriods).set(values).where(and(eq(registrationPeriods.id, id), eq(registrationPeriods.termId, termId))).returning({ id: registrationPeriods.id })
        : await tx.insert(registrationPeriods).values({ ...values, termId }).returning({ id: registrationPeriods.id });
      if (!row) throw new InputError("Đợt đăng ký không còn tồn tại, tải lại trang.");
      await recordAudit(tx, { actor: auditActorOf(viewer), action: id ? "update" : "create", entityType: "registration-period", entityId: row.id, entityLabel: values.name, summary: periodAudit(values) });
      return row.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateRegistration();
  const period = (await getRegistrationPeriods(termId)).find((entry) => entry.id === periodId);
  return period ? actionOk(period) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Đóng sớm đợt đang mở: dời giờ đóng về hiện tại. Đợt đã đóng thì không mở lại được ở đây.
export async function closePeriod(id: string): Promise<ActionResult<RegistrationPeriodView>> {
  const viewer = await requireSchoolWidePermission("registration.manage");
  if (!isUuid(id)) return actionError("Đợt đăng ký không còn tồn tại, tải lại trang.");
  const now = new Date();
  let termId: string;
  try {
    termId = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(registrationPeriods)
        .set({ closesAt: now })
        .where(and(eq(registrationPeriods.id, id), lte(registrationPeriods.opensAt, now), gt(registrationPeriods.closesAt, now)))
        .returning({ termId: registrationPeriods.termId, name: registrationPeriods.name });
      if (!row) throw new InputError("Đợt không đang mở, không đóng được.");
      await recordAudit(tx, { actor: auditActorOf(viewer), action: "lock", entityType: "registration-period", entityId: id, entityLabel: row.name, summary: `Đóng sớm ${row.name} lúc ${formatDateTime(now)}` });
      return row.termId;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateRegistration();
  const period = (await getRegistrationPeriods(termId)).find((entry) => entry.id === id);
  return period ? actionOk(period) : actionError("Đã đóng nhưng chưa đọc lại được, tải lại trang.");
}

// ---- Khóa đăng ký ----

// Phòng Đào tạo đặt mọi loại khóa; Phòng Kế hoạch - Tài chính (tuition.manage) đặt và gỡ khóa học phí.
function canManageHold(viewer: Viewer, kind: RegistrationHold["kind"]) {
  return can(viewer, "registration.manage") || (kind === "tuition" && can(viewer, "tuition.manage"));
}

export async function createHold(input: HoldInput): Promise<ActionResult<RegistrationHold>> {
  const viewer = await getViewer();
  if (!can(viewer, "registration.manage") && !can(viewer, "tuition.manage")) forbidden();
  const parsed = parseInput(HOLD_SCHEMA, input);
  if (!parsed.ok) return parsed;
  if (!canManageHold(viewer, parsed.data.kind)) return actionError("Vai trò của bạn chỉ đặt được khóa học phí.", { kind: "Chọn loại Học phí" });
  const student = await getStudent(parsed.data.studentId);
  if (!student || !inScope(viewer, student.faculty)) return actionError("Sinh viên không còn tồn tại hoặc thuộc khoa khác.", { studentId: "Chọn sinh viên thuộc khoa của bạn" });
  let holdId: string;
  try {
    holdId = await db.transaction(async (tx) => {
      const [row] = await tx.insert(registrationHolds).values({ ...parsed.data, createdByUserId: viewer.id, createdByLabel: viewer.name }).returning({ id: registrationHolds.id });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "lock",
        entityType: "student",
        entityId: student.id,
        entityLabel: `${student.code} ${student.fullName}`,
        summary: `Đặt khóa đăng ký${parsed.data.blocking ? "" : " (chỉ nhắc)"}: ${parsed.data.reason}`,
      });
      if (parsed.data.blocking) {
        await notifyStudents(tx, [student.id], { kind: "system", title: "Tài khoản bị khóa đăng ký học phần", body: `${parsed.data.reason}. Cách gỡ: ${parsed.data.resolveHint}`, href: "/application/registration" });
      }
      return row.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateRegistration();
  const hold = (await getRegistrationHolds(parsed.data.studentId)).find((entry) => entry.id === holdId);
  return hold ? actionOk(hold) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function releaseHold(id: string, note: string): Promise<ActionResult<RegistrationHold>> {
  const viewer = await getViewer();
  if (!can(viewer, "registration.manage") && !can(viewer, "tuition.manage")) forbidden();
  if (!isUuid(id)) return actionError("Khóa đăng ký không còn tồn tại, tải lại trang.");
  const basis = note.trim();
  if (!basis) return actionError("Ghi căn cứ gỡ khóa, ví dụ số biên lai học phí hoặc tên giấy tờ đã nhận", { note: "Chưa ghi căn cứ" });
  const [current] = await db.select({ studentId: registrationHolds.studentId, kind: registrationHolds.kind, reason: registrationHolds.reason }).from(registrationHolds).where(eq(registrationHolds.id, id));
  const student = current ? await getStudent(current.studentId) : null;
  if (!current || !student || !inScope(viewer, student.faculty)) return actionError("Khóa đăng ký không còn tồn tại hoặc thuộc khoa khác.");
  if (!canManageHold(viewer, current.kind)) return actionError("Vai trò của bạn chỉ gỡ được khóa học phí.");
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(registrationHolds)
        .set({ releasedAt: new Date(), releasedByUserId: viewer.id, releasedByLabel: `${viewer.name}: ${basis.slice(0, 300)}` })
        .where(and(eq(registrationHolds.id, id), isNull(registrationHolds.releasedAt)))
        .returning({ studentId: registrationHolds.studentId });
      if (!row) throw new InputError("Khóa này đã được gỡ trước đó.");
      await recordAudit(tx, { actor: auditActorOf(viewer), action: "update", entityType: "student", entityId: student.id, entityLabel: `${student.code} ${student.fullName}`, summary: `Gỡ khóa đăng ký "${current.reason}". Căn cứ: ${basis}` });
      await notifyStudents(tx, [student.id], { kind: "system", title: "Đã gỡ khóa đăng ký học phần", body: `Khóa "${current.reason}" đã được gỡ.`, href: "/application/registration" });
    });
  } catch (error) {
    return failure(error);
  }
  revalidateRegistration();
  const hold = (await getRegistrationHolds(current.studentId)).find((entry) => entry.id === id);
  return hold ? actionOk(hold) : actionError("Đã gỡ nhưng chưa đọc lại được, tải lại trang.");
}

// ---- Phòng Đào tạo đăng ký, hủy hộ ----

export async function adminRegister(input: AdminRegisterInput): Promise<ActionResult<ClassSectionView>> {
  const viewer = await requirePermission("registration.manage");
  const parsed = parseInput(ADMIN_REGISTER_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { studentId, sectionId, labGroupId, reason, override } = parsed.data;
  const [student, section, regulation] = await Promise.all([getStudent(studentId), getClassSection(sectionId), getRegulation()]);
  if (!student || !section) return actionError("Sinh viên hoặc lớp không còn hợp lệ, tải lại trang.");
  if (!inScope(viewer, student.faculty)) return actionError("Sinh viên thuộc khoa khác, bạn không đăng ký hộ được.");
  try {
    await db.transaction((tx) =>
      adminRegisterStudent(tx, { studentId, sectionId, labGroupId: labGroupId ?? null, reason, override, actor: staffActor(viewer), rules: regulation, now: new Date() }),
    );
  } catch (error) {
    return failure(error);
  }
  revalidateRegistration();
  const updated = await readClassSectionAfterWrite(sectionId);
  return updated ? actionOk(updated) : actionError("Đã đăng ký nhưng chưa đọc lại được, tải lại trang.");
}

export async function adminDrop(studentId: string, sectionId: string, reason: string): Promise<ActionResult> {
  const viewer = await requirePermission("registration.manage");
  if (!isUuid(studentId) || !isUuid(sectionId)) return actionError("Sinh viên hoặc lớp không còn hợp lệ, tải lại trang.");
  const note = reason.trim();
  if (!note) return actionError("Ghi lý do hủy hộ để sinh viên và cố vấn biết", { reason: "Chưa ghi lý do" });
  const [student, regulation] = await Promise.all([getStudent(studentId), getRegulation()]);
  if (!student || !inScope(viewer, student.faculty)) return actionError("Sinh viên không còn hợp lệ hoặc thuộc khoa khác.");
  try {
    await db.transaction((tx) => adminDropStudent(tx, { studentId, sectionId, reason: note.slice(0, 1000), actor: staffActor(viewer), rules: regulation, now: new Date() }));
  } catch (error) {
    return failure(error);
  }
  revalidateRegistration();
  return actionOk();
}

// Nhắc sinh viên chưa đăng ký trong đợt đang mở: gửi thông báo trên cổng sinh viên. Chỉ nhắc được sinh viên trong phạm vi khoa
// của người gửi và vẫn còn chưa đăng ký lúc gửi; sinh viên chưa kích hoạt tài khoản cổng thì không nhận được thông báo.
export async function remindUnregisteredStudents(
  studentIds: string[],
): Promise<ActionResult<{ remindedIds: string[]; remindedAt: string; withoutAccount: number; mailed: number }>> {
  const viewer = await requirePermission("registration.manage");
  const parsed = parseInput(z.object({ studentIds: z.array(z.uuid()).min(1, "Chưa chọn sinh viên").max(2000) }), { studentIds });
  if (!parsed.ok) return parsed;
  const term = await getRegistrationTargetTerm();
  const wanted = new Set(parsed.data.studentIds);
  const pending = (await getUnregisteredStudents(term.id)).filter((student) => wanted.has(student.id) && inScope(viewer, student.faculty));
  if (pending.length === 0) return actionError("Các sinh viên đã chọn đã đăng ký hoặc không còn trong đợt đang mở, tải lại trang.");
  const remindedAt = new Date();
  let remindedIds: string[];
  let mailIds: string[];
  try {
    ({ remindedIds, mailIds } = await db.transaction(async (tx) => ({
      remindedIds: await notifyStudents(
        tx,
        pending.map((student) => student.id),
        {
          kind: "deadline",
          title: "Bạn chưa đăng ký học phần",
          body: `${term.name} đang trong đợt đăng ký của khóa bạn. Đăng ký trước khi đợt đóng để không bị thiếu tín chỉ tối thiểu.`,
          href: REGISTRATION_REMINDER_HREF,
          createdAt: remindedAt,
        },
      ),
      // Thư tới email trường của mọi sinh viên được nhắc, kể cả chưa có tài khoản cổng (kênh duy nhất tới các bạn này).
      mailIds: await enqueueMail(tx, [
        {
          kind: "registration-reminder",
          to: pending.map((student) => studentEmailOf(student.code)),
          subject: `Nhắc đăng ký học phần ${term.name}`,
          text: [
            "Chào bạn,",
            `${term.name} đang trong đợt đăng ký học phần của khóa bạn và hệ thống chưa ghi nhận bạn đăng ký lớp nào. Đăng ký trước khi đợt đóng để không bị thiếu tín chỉ tối thiểu.`,
            `Đăng ký tại: ${env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL.replace(/\/+$/, "")}${REGISTRATION_REMINDER_HREF}`,
            "Chưa đăng nhập được HCMUE Portal thì liên hệ Phòng Đào tạo để được cấp hoặc kích hoạt tài khoản.",
          ].join("\n\n"),
        },
      ]),
    })));
  } catch (error) {
    return failure(error);
  }
  deliverMailSoon(mailIds);
  revalidatePath("/administrator/registration-monitor");
  return actionOk({
    remindedIds,
    remindedAt: remindedAt.toISOString(),
    withoutAccount: pending.length - remindedIds.length,
    mailed: mailIds.length,
  });
}

type PdfFile = { fileName: string; base64: string; mimeType: string };

// Phiếu đăng ký một học kỳ (mặc định học kỳ đang nhận đăng ký) của chính sinh viên đang đăng nhập, cùng nội dung và mã xác thực
// với trang Lịch sử và phiếu đăng ký.
export async function downloadRegistrationReceiptPdf(termId?: string): Promise<ActionResult<PdfFile>> {
  const student = await getCurrentStudent();
  const all = await getTerms();
  const term = (termId ? all.find((entry) => entry.id === termId) : null) ?? (await getRegistrationTargetTerm());
  const [enrolled, periods, events] = await Promise.all([getStudentEnrollments(student.id, term.id), getRegistrationPeriods(term.id), getRegistrationEvents(student.id, term.id)]);
  const timetable = pickTimetable(enrolled);
  const bytes = await registrationReceiptPdf({
    student,
    termName: term.name,
    enrollments: timetable,
    confirmedAt: receiptConfirmedAt(periods, student.cohort, events, term.startDate),
    verificationCode: receiptVerificationCode(student.id, term.id, timetable.map(({ section }) => section.id)),
  });
  return actionOk({ fileName: `phieu-dang-ky-${term.code}-${student.code.replace(/\./g, "")}.pdf`, base64: bytesToBase64(bytes), mimeType: PDF_MIME });
}

// Danh sách lớp bản PDF: chỉ giảng viên được phân công dạy lớp.
export async function exportClassRosterPdf(classSectionId: string): Promise<ActionResult<PdfFile>> {
  const lecturer = await getCurrentLecturer();
  if (!isUuid(classSectionId)) return actionError("Không tìm thấy lớp học phần.");
  const [row] = await db
    .select({ lecturerId: classSections.lecturerId, termName: terms.name })
    .from(classSections)
    .innerJoin(terms, eq(terms.id, classSections.termId))
    .where(eq(classSections.id, classSectionId));
  if (!row || row.lecturerId !== lecturer.id) return actionError("Không tìm thấy lớp học phần bạn được phân công dạy.");
  const [section, roster] = await Promise.all([getClassSection(classSectionId), getClassRoster(classSectionId)]);
  if (!section) return actionError("Không tìm thấy lớp học phần.");
  const bytes = await classRosterPdf(section, row.termName, roster);
  return actionOk({ fileName: `danh-sach-${section.code}.pdf`, base64: bytesToBase64(bytes), mimeType: PDF_MIME });
}
