"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, asc, desc, eq, gt, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { daysUntil } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { env } from "@/shared/libs/env.lib";
import { studentEmailOf } from "@/shared/libs/student-code.lib";
import {
  ADMIN_REGISTER_SCHEMA,
  basketProblems,
  CLASS_SECTION_SCHEMA,
  HOLD_SCHEMA,
  PERIOD_SCHEMA,
  creditCapOf,
  evaluateSection,
  REGISTER_SCHEMA,
  sectionCredits,
  type AdminRegisterInput,
  type ClassSectionInput,
  type EligibilityContext,
  type HoldInput,
  type PeriodInput,
  type RegisterInput,
} from "@/modules/course-registration/course-registration.rule";
import { allMeetings, overlaps, REGISTRATION_CONSTRAINT_MESSAGE } from "@/modules/course-registration/course-registration.constant";
import {
  getClassSection,
  getClassSections,
  getCurrentTerm,
  getRegistrationHolds,
  getRegistrationPeriods,
  getRegistrationTargetTerm,
  getUnregisteredStudents,
  readClassSectionAfterWrite,
  REGISTRATION_REMINDER_HREF,
} from "@/modules/course-registration/course-registration.query";
import {
  classSectionAudienceMajors,
  classSections,
  enrollments,
  labGroups,
  registrationEvents,
  registrationHolds,
  registrationPeriods,
  reservedSeatMajors,
  reservedSeats,
  sectionMeetings,
  terms,
  waitlistEntries,
} from "@/modules/course-registration/course-registration.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission, requireSchoolWidePermission } from "@/modules/access/access.query";
import { courseRelations, courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { academicWarnings, courseResults } from "@/modules/grades/grades.schema";
import { regulations } from "@/modules/settings/settings.schema";
import { deliverMailSoon, enqueueMail } from "@/modules/mail/mail.lib";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import { syncClassSessions, weeklyScheduleOf, type WeeklySchedule } from "@/modules/schedule/schedule.lib";
import { INVOICE_PAID_SQL, INVOICE_TOTAL_SQL } from "@/modules/tuition/tuition.lib";
import { tuitionInvoices } from "@/modules/tuition/tuition.schema";
import { getCurrentStudent, getStudent, requireActiveStudent } from "@/modules/users/users.query";
import type { ClassSectionView, RegistrationHold, RegistrationPeriodView } from "@/modules/course-registration/course-registration.type";
import type { Student } from "@/modules/users/users.type";

const LETTER_RANK = ["A", "B+", "B", "C+", "C", "D+", "D", "F"];

const relatedCourses = alias(courses, "related_courses");

type Registration = { student: Student; termId: string; sections: ClassSectionView[]; registered: ClassSectionView[] };

// Mọi điều kiện đăng ký được kiểm lại ở server với dữ liệu mới nhất, dùng đúng hàm evaluateSection của giao diện.
async function eligibilityOf({ student, termId, registered }: Registration, planned: ClassSectionView[], labChoices: Record<string, string>) {
  const [results, relations, [regulation], [warning], currentTerm] = await Promise.all([
    db
      .select({ code: courses.code, letter: courseResults.letter })
      .from(courseResults)
      .innerJoin(courses, eq(courses.id, courseResults.courseId))
      .where(and(eq(courseResults.studentId, student.id), sql`${courseResults.letter} IS NOT NULL`)),
    db
      .select({ courseCode: courses.code, kind: courseRelations.kind, relatedCode: relatedCourses.code })
      .from(courseRelations)
      .innerJoin(courses, eq(courses.id, courseRelations.courseId))
      .innerJoin(relatedCourses, eq(relatedCourses.id, courseRelations.relatedCourseId)),
    db.select({ rules: regulations.rules }).from(regulations).orderBy(desc(regulations.effectiveFrom)).limit(1),
    db.select({ level: academicWarnings.level }).from(academicWarnings).where(eq(academicWarnings.studentId, student.id)).orderBy(desc(academicWarnings.createdAt)).limit(1),
    getCurrentTerm(),
  ]);
  const passedGrades: Record<string, string> = {};
  for (const result of results) {
    const current = passedGrades[result.code];
    if (!current || LETTER_RANK.indexOf(result.letter!) < LETTER_RANK.indexOf(current)) passedGrades[result.code] = result.letter!;
  }
  const relationMap = (kind: string) => {
    const map: Record<string, string[]> = {};
    for (const relation of relations.filter((entry) => entry.kind === kind)) (map[relation.courseCode] ??= []).push(relation.relatedCode);
    return map;
  };
  const inProgress = await db
    .select({ code: courses.code })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(and(eq(enrollments.studentId, student.id), eq(enrollments.termId, currentTerm.id), eq(enrollments.status, "enrolled")));
  const credits = regulation?.rules.credits ?? { minPerTerm: 14, maxPerTerm: 25, maxWhenWarned: 14 };
  const cap = creditCapOf(credits, warning?.level ?? 0);
  const context: EligibilityContext = {
    planned: [...registered, ...planned],
    passedGrades,
    prerequisites: relationMap("prerequisite"),
    corequisites: relationMap("corequisite"),
    equivalents: relationMap("equivalent"),
    courseNames: {},
    maxCredits: cap.max,
    creditCapNote: cap.note,
    inProgressCodes: termId === currentTerm.id ? [] : inProgress.map((row) => row.code),
    student: { majorCode: student.majorCode, cohort: student.cohort },
    labChoices,
  };
  return { context, minCredits: credits.minPerTerm };
}

async function loadRegistration(): Promise<Registration | string> {
  const [active, term, currentTerm] = await Promise.all([requireActiveStudent(), getRegistrationTargetTerm(), getCurrentTerm()]);
  // Bảo lưu, tạm ngừng học, đã tốt nghiệp: không đăng ký, hủy, đổi nhóm được.
  if (!active.student) return active.message;
  const { student } = active;
  const now = new Date();
  const [[period], [hold], [invoice], sections, rows] = await Promise.all([
    db
      .select({ id: registrationPeriods.id })
      .from(registrationPeriods)
      .where(
        and(
          eq(registrationPeriods.termId, term.id),
          sql`${student.cohort} = ANY(${registrationPeriods.cohorts})`,
          lte(registrationPeriods.opensAt, now),
          gt(registrationPeriods.closesAt, now),
        ),
      )
      .limit(1),
    db
      .select({ reason: registrationHolds.reason })
      .from(registrationHolds)
      .where(and(eq(registrationHolds.studentId, student.id), eq(registrationHolds.blocking, true), isNull(registrationHolds.releasedAt)))
      .limit(1),
    // Học phí học kỳ đang học còn nợ: tổng các khoản trừ miễn giảm (không âm), trừ số đã nộp còn hiệu lực. Tên bảng viết đầy đủ:
    // truy vấn một bảng thì drizzle bỏ tên bảng, "id" trong truy vấn con sẽ trỏ nhầm sang id của invoice_lines/payments.
    db
      .select({
        dueDate: tuitionInvoices.dueDate,
        balance: sql<number>`${INVOICE_TOTAL_SQL} - ${INVOICE_PAID_SQL}`.mapWith(Number),
      })
      .from(tuitionInvoices)
      .where(and(eq(tuitionInvoices.studentId, student.id), eq(tuitionInvoices.termId, currentTerm.id))),
    getClassSections(term.id),
    db
      .select({ sectionId: enrollments.classSectionId })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, student.id), eq(enrollments.termId, term.id), eq(enrollments.status, "enrolled"))),
  ]);
  if (!period) return `Ngoài thời gian đăng ký của khóa ${student.cohort}.`;
  if (hold) return `Tài khoản đang bị khóa đăng ký: ${hold.reason}`;
  // Cùng điều kiện với khóa "học phí quá hạn" trang đăng ký hiển thị: còn nợ và đã qua ngày hạn nộp.
  if (invoice && invoice.balance > 0 && daysUntil(invoice.dueDate) < 0) {
    return `Học phí ${currentTerm.shortName} quá hạn, còn nợ ${invoice.balance.toLocaleString("vi-VN")} đ. Nộp đủ học phí để mở khóa đăng ký.`;
  }
  const registeredIds = new Set(rows.map((row) => row.sectionId));
  return { student, termId: term.id, sections, registered: sections.filter((section) => registeredIds.has(section.id)) };
}

// Chỗ còn cho sinh viên này sau khi trừ chỗ dành riêng cho đối tượng khác; nếu sinh viên thuộc một nhóm dành riêng còn chỗ thì dùng chỗ đó.
async function claimSeat(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], sectionId: string, student: Student) {
  const [section] = await tx
    .select({ capacity: classSections.capacity, enrolled: classSections.enrolledCount, code: classSections.code })
    .from(classSections)
    .where(eq(classSections.id, sectionId))
    .for("update");
  const seats = await tx
    .select({
      id: reservedSeats.id,
      seats: reservedSeats.seats,
      taken: reservedSeats.takenCount,
      cohorts: reservedSeats.cohorts,
      majorCodes: sql<string[]>`coalesce(array_agg(${majors.code}) FILTER (WHERE ${majors.code} IS NOT NULL), '{}')`,
    })
    .from(reservedSeats)
    .leftJoin(reservedSeatMajors, eq(reservedSeatMajors.reservedSeatId, reservedSeats.id))
    .leftJoin(majors, eq(majors.id, reservedSeatMajors.majorId))
    .where(eq(reservedSeats.classSectionId, sectionId))
    .groupBy(reservedSeats.id)
    .orderBy(asc(reservedSeats.id));
  const fits = (seat: (typeof seats)[number]) =>
    (seat.majorCodes.length === 0 || seat.majorCodes.includes(student.majorCode)) && (seat.cohorts.length === 0 || seat.cohorts.includes(student.cohort));
  const own = seats.find((seat) => fits(seat) && seat.taken < seat.seats);
  if (own) return { reservedSeatId: own.id };
  const heldForOthers = seats.filter((seat) => !fits(seat)).reduce((sum, seat) => sum + Math.max(0, seat.seats - seat.taken), 0);
  if (section.capacity - section.enrolled - heldForOthers <= 0) return `Lớp ${section.code} đã hết chỗ cho đối tượng của bạn.`;
  return { reservedSeatId: null };
}

export async function registerSections(input: RegisterInput): Promise<ActionResult<{ registeredIds: string[] }>> {
  const parsed = parseInput(REGISTER_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const registration = await loadRegistration();
  if (typeof registration === "string") return actionError(registration);
  const { student, termId, sections, registered } = registration;
  const byId = new Map(sections.map((section) => [section.id, section]));
  const planned = parsed.data.sectionIds.map((id) => byId.get(id));
  if (planned.some((section) => !section || section.status !== "open")) return actionError("Có lớp không còn mở đăng ký, tải lại trang.");
  const chosen = planned as ClassSectionView[];
  if (chosen.some((section) => registered.some((entry) => entry.id === section.id))) return actionError("Có lớp bạn đã đăng ký rồi, tải lại trang.");

  const labChoices = parsed.data.labChoices;
  const { context, minCredits } = await eligibilityOf(registration, chosen, labChoices);
  for (const section of chosen) {
    const blocking = evaluateSection(section, { ...context, planned: context.planned.filter((entry) => entry.id !== section.id) }).find(
      (issue) => issue.blocking && issue.kind !== "full" && issue.kind !== "reserved",
    );
    if (blocking) return actionError(`${section.code}: ${blocking.message}`);
    if (section.labGroups.length > 0 && !section.labGroups.some((group) => group.id === labChoices[section.id])) {
      return actionError(`Chưa chọn nhóm thực hành cho ${section.code}.`);
    }
  }
  const [problem] = basketProblems([...registered, ...chosen], context);
  if (problem) return actionError(`${problem.section.code}: ${problem.issue.message}`);
  if (sectionCredits([...registered, ...chosen]) < minCredits) return actionError(`Cần đăng ký tối thiểu ${minCredits} tín chỉ trong học kỳ.`);

  try {
    // Khóa lớp theo thứ tự id để hai sinh viên đăng ký cùng nhóm lớp không chờ vòng nhau.
    const result = await db.transaction(async (tx) => {
      for (const section of chosen.toSorted((a, b) => a.id.localeCompare(b.id))) {
        const seat = await claimSeat(tx, section.id, student);
        if (typeof seat === "string") return seat;
        const [course] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.code, section.courseCode));
        await tx.insert(enrollments).values({
          studentId: student.id,
          classSectionId: section.id,
          termId,
          courseId: course.id,
          labGroupId: labChoices[section.id] ?? null,
          reservedSeatId: seat.reservedSeatId,
        });
        await tx.insert(registrationEvents).values({ studentId: student.id, classSectionId: section.id, kind: "add", actorLabel: student.fullName, channel: "Cổng sinh viên" });
        await tx
          .update(waitlistEntries)
          .set({ status: "cancelled", resolvedAt: new Date() })
          .where(and(eq(waitlistEntries.studentId, student.id), eq(waitlistEntries.classSectionId, section.id), eq(waitlistEntries.status, "waiting")));
      }
      return null;
    });
    if (result) return actionError(result);
  } catch (error) {
    return actionFailure(error, REGISTRATION_CONSTRAINT_MESSAGE);
  }
  revalidatePath("/application", "layout");
  return actionOk({ registeredIds: [...registered, ...chosen].map((section) => section.id) });
}

export async function dropSection(sectionId: string): Promise<ActionResult<{ registeredIds: string[] }>> {
  if (!isUuid(sectionId)) return actionError("Lớp không còn tồn tại, tải lại trang.");
  const registration = await loadRegistration();
  if (typeof registration === "string") return actionError(registration);
  const { student, termId, registered } = registration;
  const section = registered.find((entry) => entry.id === sectionId);
  if (!section) return actionError("Bạn không còn trong lớp này, tải lại trang.");
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(enrollments)
        .set({ status: "dropped", droppedAt: new Date() })
        .where(and(eq(enrollments.studentId, student.id), eq(enrollments.classSectionId, sectionId), eq(enrollments.termId, termId), eq(enrollments.status, "enrolled")));
      await tx.insert(registrationEvents).values({ studentId: student.id, classSectionId: sectionId, kind: "drop", actorLabel: student.fullName, channel: "Cổng sinh viên" });
    });
  } catch (error) {
    return actionFailure(error, REGISTRATION_CONSTRAINT_MESSAGE);
  }
  revalidatePath("/application", "layout");
  return actionOk({ registeredIds: registered.filter((entry) => entry.id !== sectionId).map((entry) => entry.id) });
}

export async function joinWaitlist(sectionId: string): Promise<ActionResult<{ position: number }>> {
  if (!isUuid(sectionId)) return actionError("Lớp không còn tồn tại, tải lại trang.");
  const registration = await loadRegistration();
  if (typeof registration === "string") return actionError(registration);
  const section = registration.sections.find((entry) => entry.id === sectionId);
  if (!section || section.status !== "open") return actionError("Lớp không còn mở đăng ký.");
  try {
    await db.insert(waitlistEntries).values({ studentId: registration.student.id, classSectionId: sectionId });
    const [{ position }] = await db
      .select({ position: sql<number>`count(*)::int` })
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.classSectionId, sectionId), eq(waitlistEntries.status, "waiting")));
    revalidatePath("/application/registration");
    return actionOk({ position });
  } catch (error) {
    return actionFailure(error, REGISTRATION_CONSTRAINT_MESSAGE);
  }
}

export async function leaveWaitlist(sectionId: string): Promise<ActionResult> {
  if (!isUuid(sectionId)) return actionError("Lớp không còn tồn tại, tải lại trang.");
  const student = await getCurrentStudent();
  try {
    await db
      .update(waitlistEntries)
      .set({ status: "cancelled", resolvedAt: new Date() })
      .where(and(eq(waitlistEntries.studentId, student.id), eq(waitlistEntries.classSectionId, sectionId), eq(waitlistEntries.status, "waiting")));
  } catch (error) {
    return actionFailure(error, REGISTRATION_CONSTRAINT_MESSAGE);
  }
  revalidatePath("/application/registration");
  return actionOk();
}

class InputError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

function adminFailure(error: unknown) {
  if (error instanceof InputError) return actionError(error.message, { [error.field]: error.message });
  return actionFailure(error, REGISTRATION_CONSTRAINT_MESSAGE);
}

// Tra id theo mã (phòng, ngành); mã không có trong danh mục thì báo lỗi vào ô tương ứng.
function idsByCode(rows: { id: string; code: string }[], wanted: string[], field: string, label: string) {
  const map = new Map(rows.map((row) => [row.code, row.id]));
  const missing = wanted.filter((code) => !map.has(code));
  if (missing.length > 0) throw new InputError(field, `${label} ${missing.join(", ")} không có trong danh mục`);
  return map;
}

// Trang lịch sử đăng ký của sinh viên: nơi xem lớp bị hủy, bị hủy hộ, được chuyển lớp.
const REGISTRATION_HISTORY_HREF = "/application/registration/history";

// Mã lớp và tên học phần để ghi vào thông báo cho sinh viên.
async function sectionLabelOf(tx: Transaction, sectionId: string) {
  const [row] = await tx
    .select({ code: classSections.code, courseName: courses.name })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .where(eq(classSections.id, sectionId));
  return row;
}

// Lớp bị hủy: trả chỗ cho mọi sinh viên đang học và ghi lại để sinh viên biết vì sao mất lớp.
async function dropAllForCancelledSection(tx: Transaction, sectionId: string, actorLabel: string) {
  const dropped = await tx
    .update(enrollments)
    .set({ status: "dropped", droppedAt: new Date() })
    .where(and(eq(enrollments.classSectionId, sectionId), eq(enrollments.status, "enrolled")))
    .returning({ studentId: enrollments.studentId });
  if (dropped.length > 0) {
    await tx
      .insert(registrationEvents)
      .values(dropped.map((row) => ({ studentId: row.studentId, classSectionId: sectionId, kind: "section-cancelled" as const, actorLabel, channel: "Phòng Đào tạo" })));
    const section = await sectionLabelOf(tx, sectionId);
    await notifyStudents(
      tx,
      dropped.map((row) => row.studentId),
      {
        kind: "system",
        title: `Lớp ${section.code} bị hủy`,
        body: `Phòng Đào tạo đã hủy lớp ${section.code} (${section.courseName}), bạn không còn trong lớp này. Đăng ký lớp khác cùng học phần trong đợt điều chỉnh hoặc chờ Phòng Đào tạo chuyển lớp.`,
        href: REGISTRATION_HISTORY_HREF,
      },
    );
  }
  return dropped.length;
}

export async function saveClassSection(termId: string, id: string | null, input: ClassSectionInput): Promise<ActionResult<ClassSectionView>> {
  const viewer = await requirePermission("class-sections.manage");
  if (!isUuid(termId) || (id !== null && !isUuid(id))) return actionError("Lớp học phần không còn tồn tại, tải lại trang.");
  const parsed = parseInput(CLASS_SECTION_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  let sectionId: string;
  try {
    sectionId = await db.transaction(async (tx) => {
      const [term] = await tx.select({ startDate: terms.startDate, endDate: terms.endDate }).from(terms).where(eq(terms.id, termId));
      if (!term) throw new InputError("courseCode", "Học kỳ không còn tồn tại, tải lại trang.");
      const [course] = await tx
        .select({ id: courses.id, faculty: faculties.name })
        .from(courses)
        .innerJoin(faculties, eq(faculties.id, courses.facultyId))
        .where(eq(courses.code, values.courseCode));
      if (!course) throw new InputError("courseCode", "Học phần không có trong danh mục");
      if (!inScope(viewer, course.faculty)) throw new InputError("courseCode", "Học phần thuộc khoa khác, bạn không mở lớp được");
      const roomCodes = [...new Set([...values.meetings.map((meeting) => meeting.room), ...values.labGroups.map((group) => group.room)])];
      const majorCodes = [...new Set([...values.audienceMajors, ...values.reservedSeats.flatMap((seat) => seat.majorCodes)])];
      const [roomRows, majorRows] = await Promise.all([
        tx.select({ id: rooms.id, code: rooms.code }).from(rooms).where(inArray(rooms.code, roomCodes)),
        majorCodes.length > 0 ? tx.select({ id: majors.id, code: majors.code }).from(majors).where(inArray(majors.code, majorCodes)) : [],
      ]);
      const roomIds = idsByCode(roomRows, roomCodes, "meetings", "Phòng");
      const majorIds = idsByCode(majorRows, majorCodes, "audienceMajors", "Ngành");
      const code = `${values.courseCode}.${String(values.sectionNumber).padStart(2, "0")}`;
      const columns = {
        lecturerId: values.lecturerId ?? null,
        capacity: values.capacity,
        minEnrollment: values.minEnrollment,
        status: values.status,
        audienceCohorts: values.audienceCohorts.length > 0 ? values.audienceCohorts : null,
        audienceNote: values.audienceNote || null,
      };

      let rowId: string;
      let previousSchedule: WeeklySchedule | null = null;
      if (id) {
        const [existing] = await tx
          .select({ status: classSections.status, enrolled: classSections.enrolledCount, courseId: classSections.courseId })
          .from(classSections)
          .where(and(eq(classSections.id, id), eq(classSections.termId, termId)))
          .for("update");
        if (!existing) throw new InputError("courseCode", "Lớp học phần không còn tồn tại, tải lại trang.");
        if (existing.courseId !== course.id) throw new InputError("courseCode", "Không đổi được học phần của lớp đã mở");
        previousSchedule = await weeklyScheduleOf(tx, id);
        if (values.status !== "cancelled" && values.capacity < existing.enrolled) {
          throw new InputError("capacity", `Lớp đang có ${existing.enrolled} sinh viên, sĩ số tối đa không nhỏ hơn số này`);
        }
        if (values.status === "cancelled" && existing.status !== "cancelled") await dropAllForCancelledSection(tx, id, viewer.name);
        await tx.update(classSections).set(columns).where(eq(classSections.id, id));
        rowId = id;
      } else {
        const [row] = await tx
          .insert(classSections)
          .values({ ...columns, termId, courseId: course.id, sectionNumber: values.sectionNumber, code, startDate: term.startDate, endDate: term.endDate })
          .returning({ id: classSections.id });
        rowId = row.id;
      }

      await tx.delete(sectionMeetings).where(eq(sectionMeetings.classSectionId, rowId));
      await tx.insert(sectionMeetings).values(values.meetings.map((meeting) => ({ classSectionId: rowId, dayOfWeek: meeting.dayOfWeek, startPeriod: meeting.startPeriod, endPeriod: meeting.endPeriod, roomId: roomIds.get(meeting.room)! })));

      await tx.delete(classSectionAudienceMajors).where(eq(classSectionAudienceMajors.classSectionId, rowId));
      if (values.audienceMajors.length > 0) {
        await tx.insert(classSectionAudienceMajors).values(values.audienceMajors.map((majorCode) => ({ classSectionId: rowId, majorId: majorIds.get(majorCode)! })));
      }

      // Nhóm thực hành và chỗ dành riêng giữ theo mã/tên để không mất sinh viên đã xếp; bỏ nhóm đang có người thì DB chặn.
      const labCodes = values.labGroups.map((group) => `${code}.${group.code}`);
      await tx
        .delete(labGroups)
        .where(and(eq(labGroups.classSectionId, rowId), labCodes.length > 0 ? notInArray(labGroups.code, labCodes) : undefined));
      for (const group of values.labGroups) {
        const labValues = { dayOfWeek: group.dayOfWeek, startPeriod: group.startPeriod, endPeriod: group.endPeriod, roomId: roomIds.get(group.room)!, capacity: group.capacity };
        await tx
          .insert(labGroups)
          .values({ ...labValues, classSectionId: rowId, code: `${code}.${group.code}` })
          .onConflictDoUpdate({ target: [labGroups.classSectionId, labGroups.code], set: labValues });
      }
      const seatLabels = values.reservedSeats.map((seat) => seat.label);
      await tx
        .delete(reservedSeats)
        .where(and(eq(reservedSeats.classSectionId, rowId), seatLabels.length > 0 ? notInArray(reservedSeats.label, seatLabels) : undefined));
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
      return rowId;
    });
  } catch (error) {
    return adminFailure(error);
  }
  revalidatePath("/administrator/class-sections");
  const section = await readClassSectionAfterWrite(sectionId);
  return section ? actionOk(section) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

const sectionIdsSchema = z.array(z.uuid()).min(1, "Chọn ít nhất một lớp").max(100);

export async function assignLecturer(sectionId: string, lecturerId: string | null): Promise<ActionResult<ClassSectionView>> {
  const viewer = await requirePermission("teaching.assign");
  if (!isUuid(sectionId) || (lecturerId !== null && !isUuid(lecturerId))) return actionError("Lớp hoặc giảng viên không còn tồn tại, tải lại trang.");
  const section = await getClassSection(sectionId);
  if (!section || !inScope(viewer, section.faculty)) return actionError("Lớp học phần không còn tồn tại hoặc thuộc khoa khác.");
  if (lecturerId) {
    // Trùng giờ dạy kiểm với lịch mới nhất của cả học kỳ, không tin danh sách ở trình duyệt.
    const clash = (await getClassSections(section.termId)).find(
      (other) =>
        other.id !== section.id &&
        other.lecturerId === lecturerId &&
        other.status !== "cancelled" &&
        allMeetings(other).some((theirs) => allMeetings(section).some((mine) => overlaps(mine, theirs))),
    );
    if (clash) return actionError(`Giảng viên đã dạy ${clash.code} cùng giờ với ${section.code}. Chọn giảng viên khác hoặc đổi lịch lớp trước.`);
  }
  try {
    await db.update(classSections).set({ lecturerId }).where(eq(classSections.id, sectionId));
  } catch (error) {
    return adminFailure(error);
  }
  revalidatePath("/administrator", "layout");
  const updated = await readClassSectionAfterWrite(sectionId);
  return updated ? actionOk(updated) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Mở thêm lớp nháp cho học phần đang đầy: cùng lịch và sĩ số với lớp gốc, chưa có giảng viên, số thứ tự kế tiếp.
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
        if (!source || !inScope(viewer, source.faculty)) throw new InputError("sectionIds", "Có lớp không còn tồn tại hoặc thuộc khoa khác.");
        const [origin] = await tx.select().from(classSections).where(eq(classSections.id, sourceId));
        const [{ next }] = await tx
          .select({ next: sql<number>`coalesce(max(${classSections.sectionNumber}), 0) + 1` })
          .from(classSections)
          .where(and(eq(classSections.termId, origin.termId), eq(classSections.courseId, origin.courseId)));
        const [created] = await tx
          .insert(classSections)
          .values({
            termId: origin.termId,
            courseId: origin.courseId,
            sectionNumber: next,
            code: `${source.courseCode}.${String(next).padStart(2, "0")}`,
            capacity: origin.capacity,
            minEnrollment: origin.minEnrollment,
            status: "draft",
            startDate: origin.startDate,
            endDate: origin.endDate,
            audienceCohorts: origin.audienceCohorts,
            audienceNote: origin.audienceNote,
          })
          .returning({ id: classSections.id });
        const meetings = await tx.select().from(sectionMeetings).where(eq(sectionMeetings.classSectionId, sourceId));
        await tx.insert(sectionMeetings).values(meetings.map(({ id: _id, classSectionId: _sectionId, ...meeting }) => ({ ...meeting, classSectionId: created.id })));
        ids.push(created.id);
      }
      return ids;
    });
  } catch (error) {
    return adminFailure(error);
  }
  revalidatePath("/administrator", "layout");
  const sections = await Promise.all(createdIds.map((id) => readClassSectionAfterWrite(id)));
  return actionOk(sections.filter((section) => section !== null));
}

export async function cancelSections(sectionIds: string[]): Promise<ActionResult<{ dropped: number }>> {
  const viewer = await requirePermission("class-sections.manage");
  const parsed = sectionIdsSchema.safeParse(sectionIds);
  if (!parsed.success) return actionError("Chọn ít nhất một lớp.");
  try {
    const dropped = await db.transaction(async (tx) => {
      let total = 0;
      for (const id of parsed.data.toSorted()) {
        const section = await getClassSection(id);
        if (!section || !inScope(viewer, section.faculty)) throw new InputError("sectionIds", "Có lớp không còn tồn tại hoặc thuộc khoa khác.");
        if (section.status === "cancelled") continue;
        total += await dropAllForCancelledSection(tx, id, viewer.name);
        await tx.update(classSections).set({ status: "cancelled" }).where(eq(classSections.id, id));
      }
      return total;
    });
    revalidatePath("/administrator", "layout");
    return actionOk({ dropped });
  } catch (error) {
    return adminFailure(error);
  }
}

// Chuyển sinh viên của lớp vừa hủy sang lớp khác cùng học phần, đến khi lớp đích hết chỗ. Sinh viên đã tự đăng ký lớp khác thì bỏ qua.
export async function moveCancelledStudents(fromId: string, toId: string): Promise<ActionResult<{ moved: number; remaining: number }>> {
  const viewer = await requirePermission("class-sections.manage");
  if (!isUuid(fromId) || !isUuid(toId)) return actionError("Lớp không còn tồn tại, tải lại trang.");
  const [from, to] = await Promise.all([getClassSection(fromId), getClassSection(toId)]);
  if (!from || !to || !inScope(viewer, to.faculty)) return actionError("Lớp không còn tồn tại hoặc thuộc khoa khác.");
  if (from.status !== "cancelled" || to.status !== "open" || from.courseCode !== to.courseCode || from.termId !== to.termId) {
    return actionError("Chỉ chuyển từ lớp đã hủy sang lớp đang mở của cùng học phần trong học kỳ.");
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [target] = await tx.select().from(classSections).where(eq(classSections.id, toId)).for("update");
      const candidates = await tx
        .selectDistinct({ studentId: registrationEvents.studentId })
        .from(registrationEvents)
        .where(
          and(
            eq(registrationEvents.classSectionId, fromId),
            eq(registrationEvents.kind, "section-cancelled"),
            sql`NOT EXISTS (SELECT 1 FROM ${enrollments} e WHERE e.student_id = ${registrationEvents.studentId} AND e.term_id = ${target.termId} AND e.course_id = ${target.courseId} AND e.status = 'enrolled')`,
          ),
        );
      const labs = await tx.select().from(labGroups).where(eq(labGroups.classSectionId, toId)).orderBy(asc(labGroups.code));
      let free = target.capacity - target.enrolledCount;
      let moved = 0;
      const movedIds: string[] = [];
      for (const { studentId } of candidates) {
        if (free <= 0) break;
        const lab = labs.toSorted((a, b) => a.enrolledCount - b.enrolledCount).find((group) => group.enrolledCount < group.capacity);
        if (labs.length > 0 && !lab) break;
        await tx.insert(enrollments).values({ studentId, classSectionId: toId, termId: target.termId, courseId: target.courseId, labGroupId: lab?.id ?? null });
        if (lab) lab.enrolledCount += 1;
        await tx.insert(registrationEvents).values({ studentId, classSectionId: toId, kind: "admin-add", actorLabel: viewer.name, channel: "Phòng Đào tạo", note: `Chuyển từ lớp đã hủy ${from.code}` });
        free -= 1;
        moved += 1;
        movedIds.push(studentId);
      }
      await notifyStudents(tx, movedIds, {
        kind: "system",
        title: `Bạn được chuyển sang lớp ${to.code}`,
        body: `Lớp ${from.code} đã hủy nên Phòng Đào tạo chuyển bạn sang lớp ${to.code} cùng học phần ${to.courseName}. Xem lịch học mới ở mục Thời khóa biểu.`,
        href: "/application/schedule",
      });
      return { moved, remaining: candidates.length - moved };
    });
    revalidatePath("/administrator", "layout");
    return actionOk(result);
  } catch (error) {
    return adminFailure(error);
  }
}

export async function savePeriod(termId: string, id: string | null, input: PeriodInput): Promise<ActionResult<RegistrationPeriodView>> {
  await requireSchoolWidePermission("registration.manage");
  if (!isUuid(termId) || (id !== null && !isUuid(id))) return actionError("Đợt đăng ký không còn tồn tại, tải lại trang.");
  const parsed = parseInput(PERIOD_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = { ...parsed.data, opensAt: new Date(parsed.data.opensAt), closesAt: new Date(parsed.data.closesAt) };
  let periodId: string;
  try {
    const [row] = id
      ? await db
          .update(registrationPeriods)
          .set(values)
          .where(and(eq(registrationPeriods.id, id), eq(registrationPeriods.termId, termId)))
          .returning({ id: registrationPeriods.id })
      : await db
          .insert(registrationPeriods)
          .values({ ...values, termId })
          .returning({ id: registrationPeriods.id });
    if (!row) return actionError("Đợt đăng ký không còn tồn tại, tải lại trang.");
    periodId = row.id;
  } catch (error) {
    return adminFailure(error);
  }
  revalidatePath("/administrator", "layout");
  revalidatePath("/application/registration");
  const period = (await getRegistrationPeriods(termId)).find((entry) => entry.id === periodId);
  return period ? actionOk(period) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Đóng sớm đợt đang mở: dời giờ đóng về hiện tại. Đợt đã đóng thì không mở lại được ở đây.
export async function closePeriod(id: string): Promise<ActionResult<RegistrationPeriodView>> {
  await requireSchoolWidePermission("registration.manage");
  if (!isUuid(id)) return actionError("Đợt đăng ký không còn tồn tại, tải lại trang.");
  const now = new Date();
  const [row] = await db
    .update(registrationPeriods)
    .set({ closesAt: now })
    .where(and(eq(registrationPeriods.id, id), lte(registrationPeriods.opensAt, now), gt(registrationPeriods.closesAt, now)))
    .returning({ termId: registrationPeriods.termId });
  if (!row) return actionError("Đợt không đang mở, không đóng được.");
  revalidatePath("/administrator", "layout");
  revalidatePath("/application/registration");
  const period = (await getRegistrationPeriods(row.termId)).find((entry) => entry.id === id);
  return period ? actionOk(period) : actionError("Đã đóng nhưng chưa đọc lại được, tải lại trang.");
}

export async function createHold(input: HoldInput): Promise<ActionResult<RegistrationHold>> {
  const viewer = await requirePermission("registration.manage");
  const parsed = parseInput(HOLD_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const student = await getStudent(parsed.data.studentId);
  if (!student || !inScope(viewer, student.faculty)) return actionError("Sinh viên không còn tồn tại hoặc thuộc khoa khác.", { studentId: "Chọn sinh viên thuộc khoa của bạn" });
  let holdId: string;
  try {
    const [row] = await db
      .insert(registrationHolds)
      .values({ ...parsed.data, createdByUserId: viewer.id, createdByLabel: viewer.name })
      .returning({ id: registrationHolds.id });
    holdId = row.id;
  } catch (error) {
    return adminFailure(error);
  }
  revalidatePath("/administrator/registration-holds");
  const hold = (await getRegistrationHolds(parsed.data.studentId)).find((entry) => entry.id === holdId);
  return hold ? actionOk(hold) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function releaseHold(id: string, note: string): Promise<ActionResult<RegistrationHold>> {
  const viewer = await requirePermission("registration.manage");
  if (!isUuid(id)) return actionError("Khóa đăng ký không còn tồn tại, tải lại trang.");
  const basis = note.trim();
  if (!basis) return actionError("Ghi căn cứ gỡ khóa, ví dụ số biên lai học phí hoặc tên giấy tờ đã nhận", { note: "Chưa ghi căn cứ" });
  const [current] = await db.select({ studentId: registrationHolds.studentId }).from(registrationHolds).where(eq(registrationHolds.id, id));
  const student = current ? await getStudent(current.studentId) : null;
  if (!student || !inScope(viewer, student.faculty)) return actionError("Khóa đăng ký không còn tồn tại hoặc thuộc khoa khác.");
  const [row] = await db
    .update(registrationHolds)
    .set({ releasedAt: new Date(), releasedByUserId: viewer.id, releasedByLabel: `${viewer.name}: ${basis.slice(0, 300)}` })
    .where(and(eq(registrationHolds.id, id), isNull(registrationHolds.releasedAt)))
    .returning({ studentId: registrationHolds.studentId });
  if (!row) return actionError("Khóa này đã được gỡ trước đó.");
  revalidatePath("/administrator/registration-holds");
  const hold = (await getRegistrationHolds(row.studentId)).find((entry) => entry.id === id);
  return hold ? actionOk(hold) : actionError("Đã gỡ nhưng chưa đọc lại được, tải lại trang.");
}

// Phòng Đào tạo đăng ký hộ: vẫn kiểm điều kiện như sinh viên, được bỏ qua điều kiện học vụ khi ghi lý do,
// nhưng sĩ số và nhóm thực hành thì DB luôn chặn.
export async function adminRegister(input: AdminRegisterInput): Promise<ActionResult<ClassSectionView>> {
  const viewer = await requirePermission("registration.manage");
  const parsed = parseInput(ADMIN_REGISTER_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { studentId, sectionId, labGroupId, reason, override } = parsed.data;
  const [student, section] = await Promise.all([getStudent(studentId), getClassSection(sectionId)]);
  if (!student || !section || section.status !== "open") return actionError("Sinh viên hoặc lớp không còn hợp lệ, tải lại trang.");
  if (!inScope(viewer, student.faculty)) return actionError("Sinh viên thuộc khoa khác, bạn không đăng ký hộ được.");
  const sections = await getClassSections(section.termId);
  const enrolled = await db
    .select({ sectionId: enrollments.classSectionId })
    .from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.termId, section.termId), eq(enrollments.status, "enrolled")));
  const registered = sections.filter((entry) => enrolled.some((row) => row.sectionId === entry.id));
  const labChoices = labGroupId ? { [sectionId]: labGroupId } : {};
  const { context } = await eligibilityOf({ student, termId: section.termId, sections, registered }, [], labChoices);
  const issues = evaluateSection(section, context).filter((issue) => issue.blocking && issue.kind !== "lab" && issue.kind !== "full" && issue.kind !== "reserved");
  if (issues.length > 0 && !override) return actionError(issues[0].message);
  if (section.labGroups.length > 0 && !section.labGroups.some((group) => group.id === labGroupId)) return actionError(`Chọn nhóm thực hành cho ${section.code}.`, { labGroupId: "Chưa chọn nhóm" });
  try {
    await db.transaction(async (tx) => {
      const seat = await claimSeat(tx, sectionId, student);
      if (typeof seat === "string") throw new InputError("sectionId", seat);
      const [course] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.code, section.courseCode));
      await tx.insert(enrollments).values({ studentId, classSectionId: sectionId, termId: section.termId, courseId: course.id, labGroupId: labGroupId ?? null, reservedSeatId: seat.reservedSeatId });
      const skipped = override && issues.length > 0 ? `. Bỏ qua kiểm tra: ${issues.map((issue) => issue.message).join(" ")}` : "";
      await tx.insert(registrationEvents).values({ studentId, classSectionId: sectionId, kind: "admin-add", actorUserId: viewer.id, actorLabel: viewer.name, channel: "Phòng Đào tạo", note: `${reason}${skipped}`.slice(0, 1000) });
    });
  } catch (error) {
    return adminFailure(error);
  }
  revalidatePath("/administrator/users/students", "layout");
  const updated = await readClassSectionAfterWrite(sectionId);
  return updated ? actionOk(updated) : actionError("Đã đăng ký nhưng chưa đọc lại được, tải lại trang.");
}

export async function adminDrop(studentId: string, sectionId: string, reason: string): Promise<ActionResult> {
  const viewer = await requirePermission("registration.manage");
  if (!isUuid(studentId) || !isUuid(sectionId)) return actionError("Sinh viên hoặc lớp không còn hợp lệ, tải lại trang.");
  const note = reason.trim();
  if (!note) return actionError("Ghi lý do hủy hộ để sinh viên và cố vấn biết", { reason: "Chưa ghi lý do" });
  const student = await getStudent(studentId);
  if (!student || !inScope(viewer, student.faculty)) return actionError("Sinh viên không còn hợp lệ hoặc thuộc khoa khác.");
  try {
    const dropped = await db.transaction(async (tx) => {
      const rows = await tx
        .update(enrollments)
        .set({ status: "dropped", droppedAt: new Date() })
        .where(and(eq(enrollments.studentId, studentId), eq(enrollments.classSectionId, sectionId), eq(enrollments.status, "enrolled")))
        .returning({ id: enrollments.id });
      if (rows.length === 0) return false;
      await tx.insert(registrationEvents).values({ studentId, classSectionId: sectionId, kind: "admin-drop", actorUserId: viewer.id, actorLabel: viewer.name, channel: "Phòng Đào tạo", note: note.slice(0, 1000) });
      const section = await sectionLabelOf(tx, sectionId);
      await notifyStudents(tx, [studentId], {
        kind: "system",
        title: `Phòng Đào tạo đã hủy đăng ký lớp ${section.code} của bạn`,
        body: `Học phần ${section.courseName}. Lý do: ${note}`,
        href: REGISTRATION_HISTORY_HREF,
      });
      return true;
    });
    if (!dropped) return actionError("Sinh viên không còn trong lớp này.");
  } catch (error) {
    return adminFailure(error);
  }
  revalidatePath("/administrator/users/students", "layout");
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
    return actionFailure(error, REGISTRATION_CONSTRAINT_MESSAGE);
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
