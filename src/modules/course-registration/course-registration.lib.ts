import "server-only";
import { and, asc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { InputError } from "@/shared/libs/action.lib";
import type { db, Transaction } from "@/shared/libs/db.lib";
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
import { conflictsOf, HOLD_KIND_LABEL, overlaps } from "@/modules/course-registration/course-registration.constant";
import {
  applicablePeriod,
  basketProblems,
  chosenMeetings,
  corequisiteDependents,
  creditLimitsOf,
  dropCreditProblem,
  evaluateSection,
  inProgressCodesFor,
  sectionCredits,
  type CreditLimits,
  type CreditRules,
  type EligibilityContext,
  type RegistrationIssueKind,
} from "@/modules/course-registration/course-registration.rule";
import type { ClassSection, RegistrationActivity } from "@/modules/course-registration/course-registration.type";
import { courseRelations, courses, faculties, majors, programCohorts, programs } from "@/modules/curriculum/curriculum.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { currentWarningLevel } from "@/modules/grades/grades.lib";
import { courseResults } from "@/modules/grades/grades.schema";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import { syncClassSessions } from "@/modules/schedule/schedule.lib";
import { invoiceStandingOf, syncTermInvoice } from "@/modules/tuition/tuition.lib";
import { tuitionBlockOf } from "@/modules/tuition/tuition.rule";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import type { StudentStatus } from "@/modules/users/users.type";

type Executor = Transaction | typeof db;

// Lượt sinh viên tự đăng ký, hủy, đổi nhóm (không tính thao tác hàng loạt của Phòng Đào tạo như hủy lớp, chuyển lớp).
const STUDENT_EVENT_KINDS = ["add", "drop", "swap"] as const;

// Nhịp đăng ký thật của một học kỳ tính từ nhật ký registration_events: 1 phút và 15 phút gần nhất, tổng trong ngày (giờ Việt Nam)
// và phút đông nhất trong ngày. Không kiểm quyền: chỉ gọi từ query đã kiểm (getRegistrationQueueStatus) hoặc test.
export async function registrationActivityOf(executor: Executor, termId: string, at: Date): Promise<RegistrationActivity> {
  const now = at.toISOString();
  const dayStart = sql`(date_trunc('day', ${now}::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
  const scope = and(eq(classSections.termId, termId), inArray(registrationEvents.kind, [...STUDENT_EVENT_KINDS]), sql`${registrationEvents.at} >= ${dayStart}`, sql`${registrationEvents.at} <= ${now}::timestamptz`);
  const [[totals], [peak]] = await Promise.all([
    executor
      .select({
        lastMinute: sql<number>`count(*) FILTER (WHERE ${registrationEvents.at} > ${now}::timestamptz - interval '1 minute')`.mapWith(Number),
        last15Minutes: sql<number>`count(*) FILTER (WHERE ${registrationEvents.at} > ${now}::timestamptz - interval '15 minutes')`.mapWith(Number),
        studentsLast15Minutes: sql<number>`count(DISTINCT ${registrationEvents.studentId}) FILTER (WHERE ${registrationEvents.at} > ${now}::timestamptz - interval '15 minutes')`.mapWith(Number),
        today: sql<number>`count(*)`.mapWith(Number),
      })
      .from(registrationEvents)
      .innerJoin(classSections, eq(classSections.id, registrationEvents.classSectionId))
      .where(scope),
    executor
      .select({ minute: sql<Date>`date_trunc('minute', ${registrationEvents.at})`.mapWith((value: string | Date) => new Date(value)), count: sql<number>`count(*)`.mapWith(Number) })
      .from(registrationEvents)
      .innerJoin(classSections, eq(classSections.id, registrationEvents.classSectionId))
      .where(scope)
      .groupBy(sql`1`)
      .orderBy(sql`2 DESC`, sql`1 DESC`)
      .limit(1),
  ]);
  return {
    lastMinute: totals?.lastMinute ?? 0,
    last15Minutes: totals?.last15Minutes ?? 0,
    studentsLast15Minutes: totals?.studentsLast15Minutes ?? 0,
    today: totals?.today ?? 0,
    peakPerMinute: peak?.count ?? 0,
    peakAt: peak ? peak.minute.toISOString() : null,
  };
}

const sectionLecturer = alias(lecturers, "section_lecturer");

// Lớp học phần ghép buổi học, nhóm thực hành, chỗ dành riêng, đối tượng. Trang quản trị tải cả học kỳ (để tính xung đột),
// thao tác đăng ký chỉ tải các lớp liên quan tới sinh viên.
export async function loadSections(executor: Executor, where: SQL): Promise<ClassSection[]> {
  const rows = await executor
    .select({
      id: classSections.id,
      code: classSections.code,
      termId: classSections.termId,
      courseCode: courses.code,
      courseName: courses.name,
      credits: courses.credits,
      faculty: faculties.name,
      lecturerId: classSections.lecturerId,
      lecturerTitle: sectionLecturer.title,
      lecturerName: sectionLecturer.fullName,
      capacity: classSections.capacity,
      enrolled: classSections.enrolledCount,
      status: classSections.status,
      startDate: classSections.startDate,
      endDate: classSections.endDate,
      minEnrollment: classSections.minEnrollment,
      audienceCohorts: classSections.audienceCohorts,
      audienceNote: classSections.audienceNote,
    })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .leftJoin(sectionLecturer, eq(sectionLecturer.id, classSections.lecturerId))
    .where(where)
    .orderBy(asc(classSections.code));
  if (rows.length === 0) return [];
  const sectionIds = rows.map((row) => row.id);
  const [meetings, labs, seats, seatMajors, audienceMajors] = await Promise.all([
    executor
      .select({ sectionId: sectionMeetings.classSectionId, dayOfWeek: sectionMeetings.dayOfWeek, startPeriod: sectionMeetings.startPeriod, endPeriod: sectionMeetings.endPeriod, room: rooms.code })
      .from(sectionMeetings)
      .innerJoin(rooms, eq(rooms.id, sectionMeetings.roomId))
      .where(inArray(sectionMeetings.classSectionId, sectionIds))
      .orderBy(asc(sectionMeetings.dayOfWeek), asc(sectionMeetings.startPeriod)),
    executor
      .select({
        id: labGroups.id,
        sectionId: labGroups.classSectionId,
        code: labGroups.code,
        dayOfWeek: labGroups.dayOfWeek,
        startPeriod: labGroups.startPeriod,
        endPeriod: labGroups.endPeriod,
        room: rooms.code,
        capacity: labGroups.capacity,
        enrolled: labGroups.enrolledCount,
      })
      .from(labGroups)
      .innerJoin(rooms, eq(rooms.id, labGroups.roomId))
      .where(inArray(labGroups.classSectionId, sectionIds))
      .orderBy(asc(labGroups.code)),
    executor.select().from(reservedSeats).where(inArray(reservedSeats.classSectionId, sectionIds)).orderBy(asc(reservedSeats.id)),
    executor
      .select({ seatId: reservedSeatMajors.reservedSeatId, code: majors.code })
      .from(reservedSeatMajors)
      .innerJoin(reservedSeats, eq(reservedSeats.id, reservedSeatMajors.reservedSeatId))
      .innerJoin(majors, eq(majors.id, reservedSeatMajors.majorId))
      .where(inArray(reservedSeats.classSectionId, sectionIds)),
    executor
      .select({ sectionId: classSectionAudienceMajors.classSectionId, code: majors.code, name: majors.name })
      .from(classSectionAudienceMajors)
      .innerJoin(majors, eq(majors.id, classSectionAudienceMajors.majorId))
      .where(inArray(classSectionAudienceMajors.classSectionId, sectionIds))
      .orderBy(asc(majors.code)),
  ]);
  return rows.map(({ lecturerTitle, lecturerName, audienceCohorts, audienceNote, ...row }) => {
    const audienceOf = audienceMajors.filter((entry) => entry.sectionId === row.id);
    const audienceCodes = audienceOf.map((entry) => entry.code);
    const hasAudience = audienceCodes.length > 0 || (audienceCohorts?.length ?? 0) > 0 || Boolean(audienceNote);
    return {
      ...row,
      lecturerName: lecturerName ? `${lecturerTitle} ${lecturerName}` : null,
      meetings: meetings.filter((meeting) => meeting.sectionId === row.id).map(({ sectionId: _sectionId, ...meeting }) => meeting),
      audience: hasAudience ? { majorCodes: audienceCodes, majorNames: audienceOf.map((entry) => entry.name), cohorts: audienceCohorts ?? [], note: audienceNote ?? "" } : null,
      reservedSeats: seats
        .filter((seat) => seat.classSectionId === row.id)
        .map((seat) => ({
          label: seat.label,
          seats: seat.seats,
          taken: seat.takenCount,
          cohorts: seat.cohorts,
          majorCodes: seatMajors.filter((entry) => entry.seatId === seat.id).map((entry) => entry.code),
        })),
      labGroups: labs
        .filter((lab) => lab.sectionId === row.id)
        .map((lab) => ({
          id: lab.id,
          code: lab.code,
          meeting: { dayOfWeek: lab.dayOfWeek, startPeriod: lab.startPeriod, endPeriod: lab.endPeriod, room: lab.room },
          capacity: lab.capacity,
          enrolled: lab.enrolled,
        })),
    };
  });
}

export type RegistrationStudentFacts = {
  id: string;
  code: string;
  fullName: string;
  majorCode: string;
  cohort: number;
  faculty: string;
  status: StudentStatus;
};

export async function registrationStudentOf(executor: Executor, studentId: string): Promise<RegistrationStudentFacts | null> {
  const [row] = await executor
    .select({
      id: students.id,
      code: students.code,
      fullName: students.fullName,
      majorCode: majors.code,
      cohort: administrativeClasses.cohort,
      faculty: faculties.name,
      status: students.status,
    })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(students.id, studentId));
  return row ?? null;
}

export type TermFacts = { id: string; code: string; name: string; shortName: string; semester: number; startDate: string; isCurrent: boolean };

const TERM_FACTS = { id: terms.id, code: terms.code, name: terms.name, shortName: terms.shortName, semester: terms.semester, startDate: terms.startDate, isCurrent: terms.isCurrent };

export async function termFactsOf(executor: Executor, termId: string): Promise<TermFacts | null> {
  const [row] = await executor.select(TERM_FACTS).from(terms).where(eq(terms.id, termId));
  return row ?? null;
}

export async function currentTermOf(executor: Executor): Promise<TermFacts> {
  const [row] = await executor.select(TERM_FACTS).from(terms).where(eq(terms.isCurrent, true));
  if (!row) throw new Error("Chưa đặt học kỳ hiện tại (terms.is_current)");
  return row;
}

// Một sinh viên trong một học kỳ chỉ có một thao tác đăng ký chạy tại một thời điểm: kiểm hạn mức, trùng lịch, song hành rồi ghi
// nằm trong cùng một khóa, hai yêu cầu song song (hai tab, bấm hai lần) không cùng lọt qua phép kiểm.
export async function lockRegistration(tx: Transaction, studentId: string, termId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`registration:${studentId}:${termId}`}, 0))`);
}

async function tryLockRegistration(tx: Transaction, studentId: string, termId: string) {
  const [row] = await tx.execute<{ locked: boolean }>(sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`registration:${studentId}:${termId}`}, 0)) AS locked`);
  return row?.locked === true;
}

// Điểm lần học cuối mỗi học phần (theo thời gian học kỳ) và số tín chỉ còn thiếu so với chương trình của ngành, khóa.
async function gradeFactsOf(executor: Executor, student: RegistrationStudentFacts) {
  const [results, [program]] = await Promise.all([
    executor
      .select({ code: courses.code, credits: courses.credits, letter: courseResults.letter, isConditional: courses.isConditional })
      .from(courseResults)
      .innerJoin(courses, eq(courses.id, courseResults.courseId))
      .innerJoin(terms, eq(terms.id, courseResults.termId))
      .where(and(eq(courseResults.studentId, student.id), sql`${courseResults.letter} IS NOT NULL`))
      .orderBy(asc(terms.startDate)),
    executor
      .select({ totalCredits: programs.totalCredits })
      .from(programs)
      .innerJoin(majors, eq(majors.id, programs.majorId))
      .innerJoin(programCohorts, and(eq(programCohorts.programId, programs.id), eq(programCohorts.cohort, student.cohort)))
      .where(eq(majors.code, student.majorCode))
      .limit(1),
  ]);
  const last: Record<string, string> = {};
  const credits = new Map<string, number>();
  for (const result of results) {
    last[result.code] = result.letter!;
    // Học phần điều kiện không tính tín chỉ tích lũy của chương trình (vẫn tính "đã học đạt" cho tiên quyết).
    credits.set(result.code, result.isConditional ? 0 : result.credits);
  }
  const earned = Object.entries(last)
    .filter(([, letter]) => letter !== "F")
    .reduce((sum, [code]) => sum + (credits.get(code) ?? 0), 0);
  return { lastGrades: last, remainingCredits: program ? Math.max(0, program.totalCredits - earned) : null };
}

const relatedCourses = alias(courses, "related_courses");

// Quan hệ tiên quyết, song hành, tương đương chỉ của các học phần liên quan (không tải cả danh mục mỗi lần đăng ký):
// quan hệ của chính các học phần đó, và học phần tương đương của các học phần tiên quyết, song hành của chúng.
async function relationsOf(executor: Executor, courseCodes: string[]) {
  const result = { prerequisites: {} as Record<string, string[]>, corequisites: {} as Record<string, string[]>, equivalents: {} as Record<string, string[]>, courseNames: {} as Record<string, string> };
  if (courseCodes.length === 0) return result;
  const select = (where: SQL | undefined) =>
    executor
      .select({ courseCode: courses.code, kind: courseRelations.kind, relatedCode: relatedCourses.code, relatedName: relatedCourses.name })
      .from(courseRelations)
      .innerJoin(courses, eq(courses.id, courseRelations.courseId))
      .innerJoin(relatedCourses, eq(relatedCourses.id, courseRelations.relatedCourseId))
      .where(where);
  const direct = await select(inArray(courses.code, courseCodes));
  const relatedCodes = [...new Set(direct.filter((row) => row.kind !== "equivalent").map((row) => row.relatedCode))].filter((code) => !courseCodes.includes(code));
  const indirect = relatedCodes.length > 0 ? await select(and(inArray(courses.code, relatedCodes), eq(courseRelations.kind, "equivalent"))) : [];
  for (const row of [...direct, ...indirect]) {
    const key = row.kind === "prerequisite" ? "prerequisites" : row.kind === "corequisite" ? "corequisites" : "equivalents";
    (result[key][row.courseCode] ??= []).push(row.relatedCode);
    result.courseNames[row.relatedCode] = row.relatedName;
  }
  return result;
}

export type RegistrationRules = { credits: CreditRules };

export type StudentTermState = {
  student: RegistrationStudentFacts;
  term: TermFacts;
  // Lớp đang đăng ký trong học kỳ và nhóm thực hành đã chọn.
  registered: ClassSection[];
  labChoices: Record<string, string>;
};

export async function studentTermStateOf(executor: Executor, student: RegistrationStudentFacts, term: TermFacts): Promise<StudentTermState> {
  const rows = await executor
    .select({ sectionId: enrollments.classSectionId, labGroupId: enrollments.labGroupId })
    .from(enrollments)
    .where(and(eq(enrollments.studentId, student.id), eq(enrollments.termId, term.id), eq(enrollments.status, "enrolled")));
  const registered = rows.length > 0 ? await loadSections(executor, inArray(classSections.id, rows.map((row) => row.sectionId))) : [];
  const labChoices = Object.fromEntries(rows.flatMap((row) => (row.labGroupId ? [[row.sectionId, row.labGroupId]] : [])));
  return { student, term, registered: registered.filter((section) => section.status !== "cancelled"), labChoices };
}

// Đợt đăng ký áp dụng cho khóa của sinh viên trong học kỳ (đang mở > sắp mở > vừa đóng), cùng hàm với giao diện.
export async function periodOf(executor: Executor, termId: string, cohort: number, now: Date) {
  const rows = await executor
    .select({ id: registrationPeriods.id, name: registrationPeriods.name, cohorts: registrationPeriods.cohorts, opensAt: registrationPeriods.opensAt, closesAt: registrationPeriods.closesAt, minCredits: registrationPeriods.minCredits, maxCredits: registrationPeriods.maxCredits })
    .from(registrationPeriods)
    .where(eq(registrationPeriods.termId, termId));
  const period = applicablePeriod(
    rows.map((row) => ({ ...row, opensAt: row.opensAt.toISOString(), closesAt: row.closesAt.toISOString() })),
    cohort,
    now,
  );
  if (!period) return null;
  const isOpen = new Date(period.opensAt) <= now && now < new Date(period.closesAt);
  return { ...period, isOpen };
}

// Hạn mức tín chỉ của sinh viên trong học kỳ cho trang đăng ký: cùng nguồn và cùng hàm với lúc server kiểm.
export async function creditLimitsFor(executor: Executor, student: RegistrationStudentFacts, term: TermFacts, rules: RegistrationRules, now: Date) {
  const [period, warningLevel, grades] = await Promise.all([periodOf(executor, term.id, student.cohort, now), currentWarningLevel(executor, student.id), gradeFactsOf(executor, student)]);
  return { limits: creditLimitsOf({ rules: rules.credits, semester: term.semester, warningLevel, period, remainingCredits: grades.remainingCredits }), warningLevel };
}

export type EligibilityBundle = { context: Omit<EligibilityContext, "planned" | "labChoices">; limits: CreditLimits };

// Dữ liệu để kiểm điều kiện học vụ của một sinh viên với một nhóm lớp: điểm lần học cuối, quan hệ học phần, học phần đang học,
// hạn mức tín chỉ (quy chế đang áp dụng, đợt, cảnh báo đã ban hành, số tín chỉ còn lại của chương trình).
export async function eligibilityOf(
  executor: Executor,
  state: StudentTermState,
  sections: ClassSection[],
  rules: RegistrationRules,
  period: { minCredits: number | null; maxCredits: number | null } | null,
): Promise<EligibilityBundle> {
  const { student, term } = state;
  const codes = [...new Set([...state.registered, ...sections].map((section) => section.courseCode))];
  const current = term.isCurrent ? term : await currentTermOf(executor);
  const [grades, relations, warningLevel, inProgress] = await Promise.all([
    gradeFactsOf(executor, student),
    relationsOf(executor, codes),
    currentWarningLevel(executor, student.id),
    term.id === current.id
      ? []
      : executor
          .select({ code: courses.code })
          .from(enrollments)
          .innerJoin(courses, eq(courses.id, enrollments.courseId))
          .where(and(eq(enrollments.studentId, student.id), eq(enrollments.termId, current.id), eq(enrollments.status, "enrolled"))),
  ]);
  const limits = creditLimitsOf({ rules: rules.credits, semester: term.semester, warningLevel, period, remainingCredits: grades.remainingCredits });
  const courseNames = { ...relations.courseNames, ...Object.fromEntries([...state.registered, ...sections].map((section) => [section.courseCode, section.courseName])) };
  return {
    context: {
      passedGrades: grades.lastGrades,
      prerequisites: relations.prerequisites,
      corequisites: relations.corequisites,
      equivalents: relations.equivalents,
      courseNames,
      maxCredits: limits.max,
      creditCapNote: limits.note,
      inProgressCodes: inProgressCodesFor(term.id, current.id, inProgress.map((row) => row.code)),
      student: { majorCode: student.majorCode, cohort: student.cohort },
    },
    limits,
  };
}

// Khóa đăng ký đang chặn sinh viên: khóa do cán bộ đặt (mọi loại) và học phí học kỳ hiện tại đã chốt, quá hạn, còn nợ.
export async function registrationBlockOf(executor: Executor, studentId: string) {
  const current = await currentTermOf(executor);
  const [[hold], invoice] = await Promise.all([
    executor
      .select({ kind: registrationHolds.kind, reason: registrationHolds.reason })
      .from(registrationHolds)
      .where(and(eq(registrationHolds.studentId, studentId), eq(registrationHolds.blocking, true), isNull(registrationHolds.releasedAt)))
      .orderBy(asc(registrationHolds.createdAt))
      .limit(1),
    invoiceStandingOf(executor, studentId, current.id),
  ]);
  if (hold) return `Tài khoản đang bị khóa đăng ký (${HOLD_KIND_LABEL[hold.kind]}): ${hold.reason}`;
  const tuition = tuitionBlockOf(invoice, current.shortName);
  if (tuition?.blocking) return `${tuition.reason}. ${tuition.resolveHint}`;
  return null;
}

// Chỗ còn cho sinh viên này sau khi trừ chỗ dành riêng cho đối tượng khác; nếu sinh viên thuộc một nhóm dành riêng còn chỗ thì dùng chỗ đó.
async function claimSeat(tx: Transaction, sectionId: string, student: RegistrationStudentFacts) {
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
  if (section.enrolled >= section.capacity) return { error: `Lớp ${section.code} đã đủ ${section.enrolled}/${section.capacity} chỗ.`, kind: "full" as const };
  const fits = (seat: (typeof seats)[number]) =>
    (seat.majorCodes.length === 0 || seat.majorCodes.includes(student.majorCode)) && (seat.cohorts.length === 0 || seat.cohorts.includes(student.cohort));
  const own = seats.find((seat) => fits(seat) && seat.taken < seat.seats);
  if (own) return { reservedSeatId: own.id };
  const heldForOthers = seats.filter((seat) => !fits(seat)).reduce((sum, seat) => sum + Math.max(0, seat.seats - seat.taken), 0);
  if (section.capacity - section.enrolled - heldForOthers <= 0) return { error: `Lớp ${section.code} đã hết chỗ cho đối tượng của bạn (còn lại là chỗ dành riêng).`, kind: "reserved" as const };
  return { reservedSeatId: null };
}

export type RegistrationActor = { userId: string | null; label: string; channel: string };

type EventKind = "add" | "admin-add" | "waitlist-promoted" | "swap";

// Kiểm điều kiện rồi ghi đăng ký cho các lớp mới, trong transaction đã giữ khóa đăng ký của sinh viên. Lỗi nghiệp vụ ném InputError
// để cả transaction rollback (lớp đã ghi trước đó trong cùng lần cũng bỏ). `skip` là loại điều kiện được bỏ qua (Phòng Đào tạo
// đăng ký hộ có ghi lý do); sĩ số, nhóm thực hành, trùng lịch, trùng học phần không bao giờ bỏ qua.
export async function insertEnrollments(
  tx: Transaction,
  params: {
    state: StudentTermState;
    adds: ClassSection[];
    labChoices: Record<string, string>;
    eligibility: EligibilityBundle;
    skip?: RegistrationIssueKind[];
    requireMinimum?: boolean;
    eventKind: EventKind;
    actor: RegistrationActor;
    note?: string;
  },
) {
  const { state, adds, eligibility, actor, eventKind } = params;
  const skip = new Set<RegistrationIssueKind>([...(params.skip ?? []), "full", "reserved"]);
  const labChoices = { ...state.labChoices, ...params.labChoices };
  const context: EligibilityContext = { ...eligibility.context, planned: [], labChoices };
  const basket = [...state.registered, ...adds];
  for (const section of adds) {
    if (section.termId !== state.term.id) throw new InputError(`Lớp ${section.code} không thuộc ${state.term.name}.`);
    if (section.status !== "open") throw new InputError(`Lớp ${section.code} không còn mở đăng ký, tải lại trang.`);
    if (state.registered.some((entry) => entry.id === section.id)) throw new InputError(`Đã đăng ký lớp ${section.code} rồi, tải lại trang.`);
    const others = basket.filter((entry) => entry.id !== section.id);
    const issue = evaluateSection(section, { ...context, planned: others }).find((entry) => entry.blocking && !skip.has(entry.kind));
    if (issue) throw new InputError(`${section.code}: ${issue.message}`);
    if (section.labGroups.length > 0) {
      const lab = section.labGroups.find((group) => group.id === labChoices[section.id]);
      if (!lab) throw new InputError(`Chưa chọn nhóm thực hành cho ${section.code}.`);
      if (lab.enrolled >= lab.capacity) throw new InputError(`Nhóm thực hành ${lab.code} đã đủ chỗ, chọn nhóm khác.`);
    }
  }
  const [problem] = basketProblems(basket, { ...context }).filter((entry) => !skip.has(entry.issue.kind) || entry.issue.kind === "conflict" || entry.issue.kind === "duplicate");
  if (problem) throw new InputError(`${problem.section.code}: ${problem.issue.message}`);
  if (params.requireMinimum) {
    const total = sectionCredits(basket);
    if (total < eligibility.limits.min) throw new InputError(`Cần đăng ký tối thiểu ${eligibility.limits.min} tín chỉ trong học kỳ (đang chọn ${total}).`);
  }
  // Khóa lớp theo thứ tự id để hai sinh viên đăng ký cùng nhóm lớp không chờ vòng nhau.
  for (const section of adds.toSorted((a, b) => a.id.localeCompare(b.id))) {
    const seat = await claimSeat(tx, section.id, state.student);
    if ("error" in seat) throw new InputError(seat.error!);
    const [course] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.code, section.courseCode));
    await tx.insert(enrollments).values({
      studentId: state.student.id,
      classSectionId: section.id,
      termId: state.term.id,
      courseId: course.id,
      labGroupId: labChoices[section.id] ?? null,
      reservedSeatId: seat.reservedSeatId,
    });
    await tx.insert(registrationEvents).values({
      studentId: state.student.id,
      classSectionId: section.id,
      kind: eventKind,
      actorUserId: actor.userId,
      actorLabel: actor.label,
      channel: actor.channel,
      note: (params.note ?? "").slice(0, 1000),
    });
    await tx
      .update(waitlistEntries)
      .set({ status: eventKind === "waitlist-promoted" ? "promoted" : "cancelled", resolvedAt: new Date() })
      .where(and(eq(waitlistEntries.studentId, state.student.id), eq(waitlistEntries.classSectionId, section.id), eq(waitlistEntries.status, "waiting")));
  }
}

// Rút sinh viên khỏi một lớp (tự hủy, Phòng Đào tạo hủy hộ, rời lớp cũ khi đổi lớp). Trả về false nếu sinh viên không còn trong lớp.
async function removeEnrollment(
  tx: Transaction,
  params: { studentId: string; sectionId: string; termId: string; eventKind: "drop" | "admin-drop" | null; actor: RegistrationActor; note?: string },
) {
  const rows = await tx
    .update(enrollments)
    .set({ status: "dropped", droppedAt: new Date() })
    .where(and(eq(enrollments.studentId, params.studentId), eq(enrollments.classSectionId, params.sectionId), eq(enrollments.termId, params.termId), eq(enrollments.status, "enrolled")))
    .returning({ id: enrollments.id });
  if (rows.length === 0) return false;
  if (params.eventKind) {
    await tx.insert(registrationEvents).values({
      studentId: params.studentId,
      classSectionId: params.sectionId,
      kind: params.eventKind,
      actorUserId: params.actor.userId,
      actorLabel: params.actor.label,
      channel: params.actor.channel,
      note: (params.note ?? "").slice(0, 1000),
    });
  }
  return true;
}

export const REGISTRATION_HISTORY_HREF = "/application/registration/history";

export function historyHref(termId: string) {
  return `${REGISTRATION_HISTORY_HREF}?term=${termId}`;
}

async function loadStudentTerm(tx: Executor, studentId: string, termId: string) {
  const [student, term] = await Promise.all([registrationStudentOf(tx, studentId), termFactsOf(tx, termId)]);
  if (!student || !term) throw new InputError("Sinh viên hoặc học kỳ không còn tồn tại, tải lại trang.");
  return { student, term };
}

// Sinh viên tự thao tác (đăng ký, hủy, đổi lớp, vào danh sách chờ): đang học, trong đợt đăng ký đang mở của khóa, không bị khóa.
async function selfServiceState(tx: Transaction, studentId: string, termId: string, now: Date) {
  await lockRegistration(tx, studentId, termId);
  const { student, term } = await loadStudentTerm(tx, studentId, termId);
  if (student.status !== "studying") throw new InputError("Bạn không ở tình trạng đang học nên chưa thực hiện được thao tác này. Liên hệ Phòng Đào tạo nếu cần hỗ trợ.");
  const period = await periodOf(tx, termId, student.cohort, now);
  if (!period?.isOpen) throw new InputError(`Ngoài thời gian đăng ký của khóa ${student.cohort}.`);
  const block = await registrationBlockOf(tx, studentId);
  if (block) throw new InputError(block);
  return { state: await studentTermStateOf(tx, student, term), period };
}

async function sectionsByIds(executor: Executor, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await loadSections(executor, inArray(classSections.id, ids));
  return ids.map((id) => {
    const section = rows.find((row) => row.id === id);
    if (!section) throw new InputError("Có lớp không còn tồn tại, tải lại trang.");
    return section;
  });
}

const STUDENT_PORTAL = "Cổng sinh viên";

// Sinh viên đăng ký các lớp đã chọn. Mọi điều kiện kiểm lại trong transaction, sau khóa của sinh viên, với dữ liệu mới nhất.
export async function registerForStudent(
  tx: Transaction,
  params: { studentId: string; termId: string; sectionIds: string[]; labChoices: Record<string, string>; rules: RegistrationRules; now: Date },
) {
  const { state, period } = await selfServiceState(tx, params.studentId, params.termId, params.now);
  const adds = await sectionsByIds(tx, params.sectionIds);
  const eligibility = await eligibilityOf(tx, state, adds, params.rules, period);
  await insertEnrollments(tx, {
    state,
    adds,
    labChoices: params.labChoices,
    eligibility,
    requireMinimum: true,
    eventKind: "add",
    actor: { userId: null, label: state.student.fullName, channel: STUDENT_PORTAL },
  });
  await syncTermInvoice(tx, state.student.id, state.term.id, `đăng ký ${adds.map((section) => section.code).join(", ")}`);
  return [...state.registered, ...adds].map((section) => section.id);
}

// Kiểm khi bỏ một lớp ra khỏi các lớp đang học: song hành và tối thiểu tín chỉ, cùng tiêu chí với lúc đăng ký.
export function dropProblem(state: StudentTermState, section: ClassSection, eligibility: EligibilityBundle) {
  const remaining = state.registered.filter((entry) => entry.id !== section.id);
  const passed = (code: string) => {
    const letter = eligibility.context.passedGrades[code];
    return Boolean(letter && letter !== "F");
  };
  const dependents = corequisiteDependents(section.courseCode, remaining.map((entry) => entry.courseCode), eligibility.context.corequisites ?? {}, passed);
  if (dependents.length > 0) {
    const labels = remaining.filter((entry) => dependents.includes(entry.courseCode)).map((entry) => entry.code);
    return `${section.courseCode} là học phần song hành bắt buộc của ${labels.join(", ")}. Hủy ${labels.join(", ")} trước hoặc cùng lúc.`;
  }
  return dropCreditProblem(sectionCredits(remaining), eligibility.limits);
}

export async function dropForStudent(tx: Transaction, params: { studentId: string; termId: string; sectionId: string; rules: RegistrationRules; now: Date }) {
  const { state, period } = await selfServiceState(tx, params.studentId, params.termId, params.now);
  const section = state.registered.find((entry) => entry.id === params.sectionId);
  if (!section) throw new InputError("Bạn không còn trong lớp này, tải lại trang.");
  const eligibility = await eligibilityOf(tx, state, [], params.rules, period);
  const problem = dropProblem(state, section, eligibility);
  if (problem) throw new InputError(problem);
  await removeEnrollment(tx, { studentId: state.student.id, sectionId: section.id, termId: state.term.id, eventKind: "drop", actor: { userId: null, label: state.student.fullName, channel: STUDENT_PORTAL } });
  await syncTermInvoice(tx, state.student.id, state.term.id, `hủy ${section.code}`);
  const promoted = await promoteWaitlist(tx, section.id, params.rules, params.now);
  return { registeredIds: state.registered.filter((entry) => entry.id !== section.id).map((entry) => entry.id), promoted };
}

// Đổi sang lớp khác cùng học phần hoặc đổi nhóm thực hành trong một bước: rời chỗ cũ và nhận chỗ mới trong cùng transaction,
// không được chỗ mới (hết chỗ, trùng lịch) thì rollback, vẫn giữ chỗ cũ.
export async function swapForStudent(
  tx: Transaction,
  params: { studentId: string; termId: string; fromSectionId: string; toSectionId: string; labGroupId: string | null; rules: RegistrationRules; now: Date },
) {
  const { state, period } = await selfServiceState(tx, params.studentId, params.termId, params.now);
  const from = state.registered.find((entry) => entry.id === params.fromSectionId);
  if (!from) throw new InputError("Bạn không còn trong lớp cũ, tải lại trang.");
  const [to] = await sectionsByIds(tx, [params.toSectionId]);
  const sameSection = to.id === from.id;
  if (to.courseCode !== from.courseCode) throw new InputError("Chỉ đổi sang lớp khác của cùng học phần.");
  if (sameSection && (!params.labGroupId || params.labGroupId === state.labChoices[from.id])) throw new InputError("Chọn nhóm thực hành khác nhóm đang học.");
  const actor = { userId: null, label: state.student.fullName, channel: STUDENT_PORTAL };
  await removeEnrollment(tx, { studentId: state.student.id, sectionId: from.id, termId: state.term.id, eventKind: null, actor });
  // Đọc lại lớp đích sau khi rời lớp cũ: đổi nhóm trong cùng lớp thì chỗ vừa trả được tính.
  const [target] = await sectionsByIds(tx, [to.id]);
  const remaining = { ...state, registered: state.registered.filter((entry) => entry.id !== from.id), labChoices: Object.fromEntries(Object.entries(state.labChoices).filter(([id]) => id !== from.id)) };
  const eligibility = await eligibilityOf(tx, remaining, [target], params.rules, period);
  await insertEnrollments(tx, {
    state: remaining,
    adds: [target],
    labChoices: params.labGroupId ? { [target.id]: params.labGroupId } : {},
    eligibility,
    eventKind: "swap",
    actor,
    note: sameSection
      ? `Đổi nhóm thực hành ${from.labGroups.find((group) => group.id === state.labChoices[from.id])?.code ?? ""} sang ${target.labGroups.find((group) => group.id === params.labGroupId)?.code ?? ""}`
      : `Đổi từ lớp ${from.code} sang ${target.code}`,
  });
  await syncTermInvoice(tx, state.student.id, state.term.id, `đổi ${from.code} sang ${target.code}`);
  const promoted = await promoteWaitlist(tx, from.id, params.rules, params.now);
  return { registeredIds: [...remaining.registered.map((entry) => entry.id), target.id], promoted };
}

// Vào danh sách chờ chỉ khi lớp không còn chỗ cho sinh viên (đầy hoặc phần còn lại là chỗ dành riêng) và sinh viên đủ mọi điều kiện khác.
export async function joinWaitlistForStudent(tx: Transaction, params: { studentId: string; termId: string; sectionId: string; rules: RegistrationRules; now: Date }) {
  const { state, period } = await selfServiceState(tx, params.studentId, params.termId, params.now);
  const [section] = await sectionsByIds(tx, [params.sectionId]);
  if (section.termId !== state.term.id || section.status !== "open") throw new InputError("Lớp không còn mở đăng ký.");
  const eligibility = await eligibilityOf(tx, state, [section], params.rules, period);
  const issues = evaluateSection(section, { ...eligibility.context, planned: state.registered, labChoices: state.labChoices }).filter((issue) => issue.blocking);
  const seatIssue = issues.find((issue) => issue.kind === "full" || issue.kind === "reserved" || issue.kind === "lab");
  const other = issues.find((issue) => issue.kind !== "full" && issue.kind !== "reserved" && issue.kind !== "lab");
  if (other) throw new InputError(`${section.code}: ${other.message}`);
  if (!seatIssue) throw new InputError(`Lớp ${section.code} còn chỗ cho bạn, chọn lớp và bấm Đăng ký thay vì vào danh sách chờ.`);
  await tx.insert(waitlistEntries).values({ studentId: state.student.id, classSectionId: section.id });
  await tx.insert(registrationEvents).values({ studentId: state.student.id, classSectionId: section.id, kind: "waitlist", actorLabel: state.student.fullName, channel: STUDENT_PORTAL });
  const [{ position }] = await tx
    .select({ position: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.classSectionId, section.id), eq(waitlistEntries.status, "waiting")));
  return position;
}

const SYSTEM_ACTOR: RegistrationActor = { userId: null, label: "Hệ thống", channel: "Danh sách chờ" };

// Lớp vừa có chỗ (sinh viên hủy, đổi lớp, Phòng Đào tạo hủy hộ hoặc tăng sĩ số): xếp lần lượt người đầu danh sách chờ đủ điều kiện
// (đang học, không bị khóa, không trùng lịch, trong hạn mức, đúng đối tượng, còn chỗ cho đối tượng của mình). Người không đủ điều kiện
// hoặc đang có thao tác đăng ký khác thì bỏ qua lượt này, vẫn giữ vị trí chờ. Chạy trong transaction của thao tác làm trống chỗ.
export async function promoteWaitlist(tx: Transaction, sectionId: string, rules: RegistrationRules, now: Date) {
  const promoted: string[] = [];
  const tried = new Set<string>();
  for (;;) {
    const [section] = await tx
      .select({ capacity: classSections.capacity, enrolled: classSections.enrolledCount, status: classSections.status, termId: classSections.termId, code: classSections.code, courseName: courses.name })
      .from(classSections)
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .where(eq(classSections.id, sectionId))
      .for("update", { of: classSections });
    if (!section || section.status !== "open" || section.enrolled >= section.capacity) break;
    const queue = await tx
      .select({ id: waitlistEntries.id, studentId: waitlistEntries.studentId })
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.classSectionId, sectionId), eq(waitlistEntries.status, "waiting")))
      .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id));
    const next = queue.filter((entry) => !tried.has(entry.id));
    let placed = false;
    for (const entry of next) {
      tried.add(entry.id);
      const ok = await tx
        .transaction(async (savepoint) => {
          if (!(await tryLockRegistration(savepoint, entry.studentId, section.termId))) return false;
          const { student, term } = await loadStudentTerm(savepoint, entry.studentId, section.termId);
          if (student.status !== "studying" || (await registrationBlockOf(savepoint, student.id))) return false;
          const state = await studentTermStateOf(savepoint, student, term);
          const [target] = await sectionsByIds(savepoint, [sectionId]);
          const busy = state.registered.flatMap((registeredSection) => chosenMeetings(registeredSection, state.labChoices));
          const lab = target.labGroups.find((group) => group.enrolled < group.capacity && !busy.some((meeting) => overlaps(meeting, group.meeting)));
          if (target.labGroups.length > 0 && !lab) return false;
          const period = await periodOf(savepoint, term.id, student.cohort, now);
          const eligibility = await eligibilityOf(savepoint, state, [target], rules, period);
          await insertEnrollments(savepoint, { state, adds: [target], labChoices: lab ? { [target.id]: lab.id } : {}, eligibility, eventKind: "waitlist-promoted", actor: SYSTEM_ACTOR });
          await syncTermInvoice(savepoint, student.id, term.id, `xếp vào ${target.code} từ danh sách chờ`);
          return true;
        })
        .catch((error: unknown) => {
          if (error instanceof InputError) return false;
          throw error;
        });
      if (ok) {
        promoted.push(entry.studentId);
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }
  if (promoted.length > 0) {
    const [section] = await tx
      .select({ code: classSections.code, termId: classSections.termId, courseName: courses.name })
      .from(classSections)
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .where(eq(classSections.id, sectionId));
    await notifyStudents(tx, promoted, {
      kind: "system",
      title: `Bạn được xếp vào lớp ${section.code}`,
      body: `Lớp ${section.code} (${section.courseName}) vừa có chỗ, hệ thống đã xếp bạn từ danh sách chờ. Lớp đã có trong thời khóa biểu; không muốn học thì hủy trong đợt đăng ký.`,
      href: historyHref(section.termId),
    });
  }
  return promoted;
}

// Phòng Đào tạo đăng ký hộ: sinh viên phải đang học; được bỏ qua điều kiện học vụ và khóa đăng ký khi ghi lý do (override),
// còn sĩ số, chỗ dành riêng, nhóm thực hành, trùng lịch luôn chặn. Sinh viên được báo trên cổng.
export async function adminRegisterStudent(
  tx: Transaction,
  params: { studentId: string; sectionId: string; labGroupId: string | null; reason: string; override: boolean; actor: RegistrationActor; rules: RegistrationRules; now: Date },
) {
  const [target] = await sectionsByIds(tx, [params.sectionId]);
  await lockRegistration(tx, params.studentId, target.termId);
  const { student, term } = await loadStudentTerm(tx, params.studentId, target.termId);
  if (student.status !== "studying") throw new InputError("Sinh viên không ở tình trạng đang học, không đăng ký hộ được.");
  const block = await registrationBlockOf(tx, student.id);
  if (block && !params.override) throw new InputError(`${block}. Chọn "Bỏ qua điều kiện học vụ" và ghi lý do nếu vẫn đăng ký hộ.`);
  const state = await studentTermStateOf(tx, student, term);
  const period = await periodOf(tx, term.id, student.cohort, params.now);
  const eligibility = await eligibilityOf(tx, state, [target], params.rules, period);
  const academic: RegistrationIssueKind[] = ["audience", "prerequisite", "corequisite", "credits", "passed", "in-progress", "hold"];
  const skipped = params.override
    ? [
        ...(block ? [block] : []),
        ...evaluateSection(target, { ...eligibility.context, planned: state.registered, labChoices: state.labChoices })
          .filter((issue) => issue.blocking && academic.includes(issue.kind))
          .map((issue) => issue.message),
      ]
    : [];
  await insertEnrollments(tx, {
    state,
    adds: [target],
    labChoices: params.labGroupId ? { [target.id]: params.labGroupId } : {},
    eligibility,
    skip: params.override ? academic : [],
    eventKind: "admin-add",
    actor: params.actor,
    note: `${params.reason}${skipped.length > 0 ? `. Bỏ qua: ${skipped.join(" ")}` : ""}`,
  });
  await syncTermInvoice(tx, student.id, term.id, `Phòng Đào tạo đăng ký hộ ${target.code}`);
  await notifyStudents(tx, [student.id], {
    kind: "system",
    title: `Phòng Đào tạo đã đăng ký lớp ${target.code} cho bạn`,
    body: `Học phần ${target.courseName}. Lý do: ${params.reason}`,
    href: historyHref(term.id),
  });
  return target;
}

export async function adminDropStudent(
  tx: Transaction,
  params: { studentId: string; sectionId: string; reason: string; actor: RegistrationActor; rules: RegistrationRules; now: Date },
) {
  const [section] = await sectionsByIds(tx, [params.sectionId]);
  await lockRegistration(tx, params.studentId, section.termId);
  const removed = await removeEnrollment(tx, { studentId: params.studentId, sectionId: section.id, termId: section.termId, eventKind: "admin-drop", actor: params.actor, note: params.reason });
  if (!removed) throw new InputError("Sinh viên không còn trong lớp này.");
  await syncTermInvoice(tx, params.studentId, section.termId, `Phòng Đào tạo hủy hộ ${section.code}`);
  await notifyStudents(tx, [params.studentId], {
    kind: "system",
    title: `Phòng Đào tạo đã hủy đăng ký lớp ${section.code} của bạn`,
    body: `Học phần ${section.courseName}. Lý do: ${params.reason}`,
    href: historyHref(section.termId),
  });
  return promoteWaitlist(tx, section.id, params.rules, params.now);
}

// Hủy lớp (từ form sửa lớp hoặc hủy hàng loạt): rút mọi sinh viên, hủy danh sách chờ, bỏ buổi học tương lai, cập nhật học phí,
// báo sinh viên. Một đường duy nhất cho mọi nơi hủy lớp.
export async function cancelSection(tx: Transaction, sectionId: string, actor: RegistrationActor) {
  const [section] = await tx
    .select({ code: classSections.code, termId: classSections.termId, status: classSections.status, courseName: courses.name })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .where(eq(classSections.id, sectionId))
    .for("update", { of: classSections });
  if (!section || section.status === "cancelled") return { dropped: 0, waitlisted: 0 };
  const dropped = await tx
    .update(enrollments)
    .set({ status: "dropped", droppedAt: new Date() })
    .where(and(eq(enrollments.classSectionId, sectionId), eq(enrollments.status, "enrolled")))
    .returning({ studentId: enrollments.studentId });
  const waitlisted = await tx
    .update(waitlistEntries)
    .set({ status: "cancelled", resolvedAt: new Date() })
    .where(and(eq(waitlistEntries.classSectionId, sectionId), eq(waitlistEntries.status, "waiting")))
    .returning({ studentId: waitlistEntries.studentId });
  await tx.update(classSections).set({ status: "cancelled" }).where(eq(classSections.id, sectionId));
  await syncClassSessions(tx, sectionId);
  if (dropped.length > 0) {
    await tx
      .insert(registrationEvents)
      .values(dropped.map((row) => ({ studentId: row.studentId, classSectionId: sectionId, kind: "section-cancelled" as const, actorUserId: actor.userId, actorLabel: actor.label, channel: actor.channel })));
    for (const row of dropped) await syncTermInvoice(tx, row.studentId, section.termId, `lớp ${section.code} bị hủy`);
    await notifyStudents(
      tx,
      dropped.map((row) => row.studentId),
      {
        kind: "system",
        title: `Lớp ${section.code} bị hủy`,
        body: `Phòng Đào tạo đã hủy lớp ${section.code} (${section.courseName}), bạn không còn trong lớp này. Đăng ký lớp khác cùng học phần trong đợt điều chỉnh hoặc chờ Phòng Đào tạo chuyển lớp.`,
        href: historyHref(section.termId),
      },
    );
  }
  if (waitlisted.length > 0) {
    await notifyStudents(
      tx,
      waitlisted.map((row) => row.studentId),
      { kind: "system", title: `Lớp ${section.code} bị hủy`, body: `Lớp ${section.code} (${section.courseName}) đã hủy nên danh sách chờ của lớp cũng hủy. Chọn lớp khác cùng học phần.`, href: "/application/registration" },
    );
  }
  return { dropped: dropped.length, waitlisted: waitlisted.length };
}

// Chuyển sinh viên của lớp đã hủy sang lớp đang mở cùng học phần. Mỗi sinh viên kiểm như đăng ký (đang học, trùng lịch, hạn mức,
// đối tượng, chỗ dành riêng); ai không đủ thì bỏ qua và trả lý do để Phòng Đào tạo xử lý riêng. Không xét khóa đăng ký: sinh viên
// mất lớp vì nhà trường hủy, không phải tự đăng ký.
export async function moveStudents(tx: Transaction, params: { fromId: string; toId: string; actor: RegistrationActor; rules: RegistrationRules; now: Date }) {
  const [from, to] = await sectionsByIds(tx, [params.fromId, params.toId]);
  if (from.status !== "cancelled" || to.status !== "open" || from.courseCode !== to.courseCode || from.termId !== to.termId) {
    throw new InputError("Chỉ chuyển từ lớp đã hủy sang lớp đang mở của cùng học phần trong học kỳ.");
  }
  const candidates = await tx
    .selectDistinct({ studentId: registrationEvents.studentId })
    .from(registrationEvents)
    .where(and(eq(registrationEvents.classSectionId, from.id), eq(registrationEvents.kind, "section-cancelled")));
  const moved: string[] = [];
  const skipped: { studentId: string; reason: string }[] = [];
  for (const { studentId } of candidates) {
    const result = await tx
      .transaction(async (savepoint) => {
        await lockRegistration(savepoint, studentId, to.termId);
        const { student, term } = await loadStudentTerm(savepoint, studentId, to.termId);
        if (student.status !== "studying") throw new InputError("không ở tình trạng đang học");
        const state = await studentTermStateOf(savepoint, student, term);
        // Đã tự đăng ký lớp khác của học phần thì thôi.
        if (state.registered.some((entry) => entry.courseCode === to.courseCode)) return "already";
        const [target] = await sectionsByIds(savepoint, [to.id]);
        const busy = state.registered.flatMap((entry) => chosenMeetings(entry, state.labChoices));
        const lab = target.labGroups
          .toSorted((a, b) => a.enrolled - b.enrolled)
          .find((group) => group.enrolled < group.capacity && !busy.some((meeting) => overlaps(meeting, group.meeting)));
        if (target.labGroups.length > 0 && !lab) throw new InputError("không còn nhóm thực hành phù hợp");
        const period = await periodOf(savepoint, term.id, student.cohort, params.now);
        const eligibility = await eligibilityOf(savepoint, state, [target], params.rules, period);
        await insertEnrollments(savepoint, {
          state,
          adds: [target],
          labChoices: lab ? { [target.id]: lab.id } : {},
          eligibility,
          skip: ["hold"],
          eventKind: "admin-add",
          actor: params.actor,
          note: `Chuyển từ lớp đã hủy ${from.code}`,
        });
        await syncTermInvoice(savepoint, student.id, term.id, `chuyển từ ${from.code} sang ${target.code}`);
        return "moved";
      })
      .catch((error: unknown) => {
        if (error instanceof InputError) return error.message;
        throw error;
      });
    if (result === "moved") moved.push(studentId);
    else if (result !== "already") skipped.push({ studentId, reason: result });
  }
  await notifyStudents(tx, moved, {
    kind: "system",
    title: `Bạn được chuyển sang lớp ${to.code}`,
    body: `Lớp ${from.code} đã hủy nên Phòng Đào tạo chuyển bạn sang lớp ${to.code} cùng học phần ${to.courseName}. Xem lịch học mới ở mục Thời khóa biểu.`,
    href: "/application/schedule",
  });
  return { moved: moved.length, skipped };
}

export type RoomFacts = { id: string; code: string; capacity: number; status: "active" | "maintenance"; note: string; campus: string };

// Phòng phải đang dùng được và đủ chỗ (phòng lý thuyết cho cả lớp, phòng thực hành cho từng nhóm); lịch không trùng phòng, không
// trùng giờ giảng viên với lớp khác trong cả học kỳ (mọi khoa, kể cả lớp nháp), cùng tiêu chí với conflictsOf của giao diện.
export async function scheduleProblemOf(
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

// Đặt học kỳ hiện tại hoặc học kỳ nhận đăng ký: mỗi loại chỉ một học kỳ (unique index), bỏ cờ ở học kỳ cũ rồi đặt cho học kỳ mới
// trong cùng transaction.
export async function switchTermFlag(tx: Transaction, termId: string, flag: "current" | "registration-target") {
  const column = flag === "current" ? terms.isCurrent : terms.isRegistrationTarget;
  const [target] = await tx.select({ id: terms.id, name: terms.name }).from(terms).where(eq(terms.id, termId)).for("update");
  if (!target) throw new InputError("Học kỳ không còn tồn tại, tải lại trang.");
  const [previous] = await tx.select({ id: terms.id, name: terms.name }).from(terms).where(eq(column, true)).for("update");
  if (previous?.id === termId) throw new InputError(`${target.name} đã là ${flag === "current" ? "học kỳ hiện tại" : "học kỳ nhận đăng ký"}.`);
  if (previous) await tx.update(terms).set(flag === "current" ? { isCurrent: false } : { isRegistrationTarget: false }).where(eq(terms.id, previous.id));
  await tx.update(terms).set(flag === "current" ? { isCurrent: true } : { isRegistrationTarget: true }).where(eq(terms.id, termId));
  return { target, previous: previous ?? null };
}
