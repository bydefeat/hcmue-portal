import "server-only";
import { cache } from "react";
import { and, asc, countDistinct, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { conflictsOf, periodState } from "@/modules/course-registration/course-registration.constant";
import {
  classSectionAudienceMajors,
  classSections,
  enrollments,
  labGroups,
  registrationHolds,
  registrationPeriods,
  reservedSeatMajors,
  reservedSeats,
  sectionMeetings,
  terms,
  waitlistEntries,
} from "@/modules/course-registration/course-registration.schema";
import { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { administrativeClasses, lecturerLoadNorms, lecturers, students } from "@/modules/users/users.schema";
import type {
  ClassSection,
  ClassSectionView,
  FacultyRegistrationSummary,
  LecturerWorkload,
  RegistrationHold,
  RegistrationPeriod,
  RegistrationQueueStatus,
  RosterEntry,
  StudentEnrollment,
  Term,
} from "@/modules/course-registration/course-registration.type";

export { periodState };

const termColumns = {
  id: terms.id,
  code: terms.code,
  name: terms.name,
  shortName: terms.shortName,
  startDate: terms.startDate,
  endDate: terms.endDate,
  isCurrent: terms.isCurrent,
  isRegistrationTarget: terms.isRegistrationTarget,
};

export const getTerms = cache(async (): Promise<Term[]> => {
  await requireSession();
  return db.select(termColumns).from(terms).orderBy(asc(terms.startDate));
});

export const getCurrentTerm = cache(async (): Promise<Term> => {
  const all = await getTerms();
  const term = all.find((entry) => entry.isCurrent);
  if (!term) throw new Error("Chưa đặt học kỳ hiện tại (terms.is_current)");
  return term;
});

export const getRegistrationTargetTerm = cache(async (): Promise<Term> => {
  const all = await getTerms();
  return all.find((entry) => entry.isRegistrationTarget) ?? (await getCurrentTerm());
});

// Số sinh viên được đăng ký (đang học, thuộc khóa của đợt) và số đã đăng ký ít nhất một lớp trong học kỳ.
async function periodRows(where?: SQL): Promise<RegistrationPeriod[]> {
  const periods = await db.select().from(registrationPeriods).where(where).orderBy(asc(registrationPeriods.opensAt));
  if (periods.length === 0) return [];
  const cohorts = [...new Set(periods.flatMap((period) => period.cohorts))];
  const termIds = [...new Set(periods.map((period) => period.termId))];
  const [eligible, registered] = await Promise.all([
    db
      .select({ cohort: administrativeClasses.cohort, total: countDistinct(students.id) })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .where(and(eq(students.status, "studying"), inArray(administrativeClasses.cohort, cohorts)))
      .groupBy(administrativeClasses.cohort),
    db
      .select({ termId: enrollments.termId, cohort: administrativeClasses.cohort, total: countDistinct(enrollments.studentId) })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .where(and(eq(enrollments.status, "enrolled"), inArray(enrollments.termId, termIds)))
      .groupBy(enrollments.termId, administrativeClasses.cohort),
  ]);
  return periods.map((period) => ({
    id: period.id,
    termId: period.termId,
    name: period.name,
    cohorts: period.cohorts,
    opensAt: period.opensAt.toISOString(),
    closesAt: period.closesAt.toISOString(),
    minCredits: period.minCredits,
    maxCredits: period.maxCredits,
    eligibleStudents: eligible.filter((row) => period.cohorts.includes(row.cohort)).reduce((sum, row) => sum + row.total, 0),
    registeredStudents: registered
      .filter((row) => row.termId === period.termId && period.cohorts.includes(row.cohort))
      .reduce((sum, row) => sum + row.total, 0),
  }));
}

export async function getRegistrationPeriods(termId?: string) {
  await requireSession();
  if (termId !== undefined && !isUuid(termId)) return [];
  return (await periodRows(termId ? eq(registrationPeriods.termId, termId) : undefined)).map(periodState);
}

export async function getActiveRegistrationPeriods() {
  await requireSession();
  return (await periodRows(sql`${registrationPeriods.closesAt} > now()`)).map(periodState).filter((period) => period.state === "open" || period.state === "closing");
}

const lecturer = alias(lecturers, "section_lecturer");

// Toàn bộ lớp của một học kỳ, ghép buổi học, nhóm thực hành, chỗ dành riêng, đối tượng. Xung đột phòng và giảng viên
// tính trên cả học kỳ nên luôn tải theo học kỳ rồi lọc.
const termSections = cache(async (termId: string): Promise<ClassSectionView[]> => {
  if (!isUuid(termId)) return [];
  const rows = await db
    .select({
      id: classSections.id,
      code: classSections.code,
      termId: classSections.termId,
      courseCode: courses.code,
      courseName: courses.name,
      credits: courses.credits,
      faculty: faculties.name,
      lecturerId: classSections.lecturerId,
      lecturerTitle: lecturer.title,
      lecturerName: lecturer.fullName,
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
    .leftJoin(lecturer, eq(lecturer.id, classSections.lecturerId))
    .where(eq(classSections.termId, termId))
    .orderBy(asc(classSections.code));
  if (rows.length === 0) return [];
  const sectionIds = rows.map((row) => row.id);
  const [meetings, labs, seats, seatMajors, audienceMajors] = await Promise.all([
    db
      .select({ sectionId: sectionMeetings.classSectionId, dayOfWeek: sectionMeetings.dayOfWeek, startPeriod: sectionMeetings.startPeriod, endPeriod: sectionMeetings.endPeriod, room: rooms.code })
      .from(sectionMeetings)
      .innerJoin(rooms, eq(rooms.id, sectionMeetings.roomId))
      .where(inArray(sectionMeetings.classSectionId, sectionIds))
      .orderBy(asc(sectionMeetings.dayOfWeek), asc(sectionMeetings.startPeriod)),
    db
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
    db.select().from(reservedSeats).where(inArray(reservedSeats.classSectionId, sectionIds)).orderBy(asc(reservedSeats.id)),
    db
      .select({ seatId: reservedSeatMajors.reservedSeatId, code: majors.code })
      .from(reservedSeatMajors)
      .innerJoin(reservedSeats, eq(reservedSeats.id, reservedSeatMajors.reservedSeatId))
      .innerJoin(majors, eq(majors.id, reservedSeatMajors.majorId))
      .where(inArray(reservedSeats.classSectionId, sectionIds)),
    db
      .select({ sectionId: classSectionAudienceMajors.classSectionId, code: majors.code })
      .from(classSectionAudienceMajors)
      .innerJoin(majors, eq(majors.id, classSectionAudienceMajors.majorId))
      .where(inArray(classSectionAudienceMajors.classSectionId, sectionIds)),
  ]);
  const sections: ClassSection[] = rows.map(({ lecturerTitle, lecturerName, audienceCohorts, audienceNote, ...row }) => {
    const audienceCodes = audienceMajors.filter((entry) => entry.sectionId === row.id).map((entry) => entry.code);
    const hasAudience = audienceCodes.length > 0 || (audienceCohorts?.length ?? 0) > 0 || Boolean(audienceNote);
    return {
      ...row,
      lecturerName: lecturerName ? `${lecturerTitle} ${lecturerName}` : null,
      meetings: meetings.filter((meeting) => meeting.sectionId === row.id).map(({ sectionId: _sectionId, ...meeting }) => meeting),
      audience: hasAudience ? { majorCodes: audienceCodes, cohorts: audienceCohorts ?? [], note: audienceNote ?? "" } : null,
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
  return sections.map((section) => ({ ...section, isFull: section.enrolled >= section.capacity, conflicts: conflictsOf(section, sections) }));
});

export async function getClassSections(termId: string) {
  await requireSession();
  return termSections(termId);
}

export async function getClassSection(id: string) {
  await requireSession();
  if (!isUuid(id)) return null;
  const [row] = await db.select({ termId: classSections.termId }).from(classSections).where(eq(classSections.id, id));
  if (!row) return null;
  return (await termSections(row.termId)).find((section) => section.id === id) ?? null;
}

export async function getLecturerClassSections(lecturerId: string, termId: string) {
  await requireSession();
  return (await termSections(termId)).filter((section) => section.lecturerId === lecturerId && section.status !== "cancelled");
}

export async function getClassRoster(sectionId: string): Promise<RosterEntry[]> {
  await requireSession();
  if (!isUuid(sectionId)) return [];
  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      studentId: students.id,
      studentCode: students.code,
      fullName: students.fullName,
      className: administrativeClasses.code,
      registeredAt: enrollments.registeredAt,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(and(eq(enrollments.classSectionId, sectionId), eq(enrollments.status, "enrolled")));
  // Danh sách lớp xếp theo tên rồi họ đệm như sổ điểm danh.
  return rows
    .map((row) => ({ ...row, studentCode: formatStudentCode(row.studentCode), registeredAt: row.registeredAt.toISOString() }))
    .toSorted((a, b) => a.fullName.split(" ").at(-1)!.localeCompare(b.fullName.split(" ").at(-1)!, "vi") || a.fullName.localeCompare(b.fullName, "vi"));
}

export async function getRegistrationSummary(termId: string): Promise<FacultyRegistrationSummary[]> {
  await requireSession();
  const summary = new Map<string, FacultyRegistrationSummary>();
  for (const section of await termSections(termId)) {
    if (section.status !== "open") continue;
    const entry = summary.get(section.faculty) ?? { faculty: section.faculty, sections: 0, capacity: 0, enrolled: 0, fullSections: 0 };
    entry.sections += 1;
    entry.capacity += section.capacity;
    entry.enrolled += section.enrolled;
    if (section.enrolled >= section.capacity) entry.fullSections += 1;
    summary.set(section.faculty, entry);
  }
  return [...summary.values()].toSorted((a, b) => b.enrolled / b.capacity - a.enrolled / a.capacity);
}

export async function getStudentEnrollments(studentId: string, termId: string): Promise<StudentEnrollment[]> {
  await requireSession();
  if (!isUuid(studentId) || !isUuid(termId)) return [];
  const [rows, sections] = await Promise.all([
    db
      .select({ sectionId: enrollments.classSectionId, registeredAt: enrollments.registeredAt, labGroupId: enrollments.labGroupId })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.termId, termId), eq(enrollments.status, "enrolled")))
      .orderBy(asc(enrollments.registeredAt)),
    termSections(termId),
  ]);
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  return rows
    .map((row) => ({ section: sectionById.get(row.sectionId)!, registeredAt: row.registeredAt.toISOString(), labGroupId: row.labGroupId }))
    .filter((entry) => entry.section && entry.section.status !== "cancelled");
}

// Vị trí của sinh viên trong danh sách chờ từng lớp của học kỳ (1 là người kế tiếp được xếp).
export async function getStudentWaitlist(studentId: string, termId: string): Promise<Record<string, number>> {
  await requireSession();
  if (!isUuid(studentId) || !isUuid(termId)) return {};
  const rows = await db
    .select({ sectionId: waitlistEntries.classSectionId, studentId: waitlistEntries.studentId })
    .from(waitlistEntries)
    .innerJoin(classSections, eq(classSections.id, waitlistEntries.classSectionId))
    .where(and(eq(classSections.termId, termId), eq(waitlistEntries.status, "waiting")))
    .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id));
  const positions: Record<string, number> = {};
  const seen = new Map<string, number>();
  for (const row of rows) {
    const position = (seen.get(row.sectionId) ?? 0) + 1;
    seen.set(row.sectionId, position);
    if (row.studentId === studentId) positions[row.sectionId] = position;
  }
  return positions;
}

const TEACHING_WEEKS = 15;

// Hệ số quy đổi giờ chuẩn theo sĩ số lớp.
function classSizeFactor(enrolled: number) {
  if (enrolled > 80) return 1.3;
  if (enrolled > 50) return 1.15;
  return 1;
}

function periodsOf(section: ClassSectionView) {
  return section.meetings.reduce((total, meeting) => total + meeting.endPeriod - meeting.startPeriod + 1, 0);
}

export async function getLecturerWorkloads(termId: string): Promise<LecturerWorkload[]> {
  await requireSession();
  const [people, norms, sections] = await Promise.all([
    db
      .select({ id: lecturers.id, title: lecturers.title, fullName: lecturers.fullName, faculty: faculties.name })
      .from(lecturers)
      .innerJoin(faculties, eq(faculties.id, lecturers.facultyId))
      .orderBy(asc(lecturers.code)),
    db.select().from(lecturerLoadNorms),
    termSections(termId),
  ]);
  const normOf = new Map(norms.map((norm) => [norm.title, norm.normHours]));
  return people.map((person) => {
    const taught = sections.filter((section) => section.lecturerId === person.id && section.status !== "cancelled");
    const periodsPerWeek = taught.reduce((sum, section) => sum + periodsOf(section), 0);
    const standardHours = taught.reduce((sum, section) => sum + periodsOf(section) * TEACHING_WEEKS * classSizeFactor(section.enrolled), 0);
    return {
      lecturerId: person.id,
      lecturerName: `${person.title} ${person.fullName}`,
      faculty: person.faculty,
      title: person.title,
      sectionCodes: taught.map((section) => section.code),
      periodsPerWeek,
      teachingHours: periodsPerWeek * TEACHING_WEEKS,
      standardHours: Math.round(standardHours),
      normHours: normOf.get(person.title) ?? 135,
    };
  });
}

export async function getRegistrationHolds(studentId?: string): Promise<RegistrationHold[]> {
  await requireSession();
  if (studentId !== undefined && !isUuid(studentId)) return [];
  const rows = await db
    .select({
      id: registrationHolds.id,
      studentId: students.id,
      studentCode: students.code,
      studentName: students.fullName,
      className: administrativeClasses.code,
      faculty: faculties.name,
      kind: registrationHolds.kind,
      blocking: registrationHolds.blocking,
      reason: registrationHolds.reason,
      resolveHint: registrationHolds.resolveHint,
      createdAt: registrationHolds.createdAt,
      createdBy: registrationHolds.createdByLabel,
      releasedAt: registrationHolds.releasedAt,
      releasedBy: registrationHolds.releasedByLabel,
    })
    .from(registrationHolds)
    .innerJoin(students, eq(students.id, registrationHolds.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(studentId ? eq(registrationHolds.studentId, studentId) : undefined)
    .orderBy(desc(registrationHolds.createdAt));
  return rows.map((row) => ({
    ...row,
    studentCode: formatStudentCode(row.studentCode),
    createdAt: row.createdAt.toISOString(),
    releasedAt: row.releasedAt?.toISOString() ?? null,
  }));
}

// Số liệu hàng chờ vào trang đăng ký. Chưa có dịch vụ hàng chờ thật nên trả số cấu hình mẫu khi có đợt đang mở.
export async function getRegistrationQueueStatus(): Promise<RegistrationQueueStatus | null> {
  const active = await getActiveRegistrationPeriods();
  if (active.length === 0) return null;
  return { waiting: 342, activeSessions: 500, sessionLimit: 500, admittedPerMinute: 2400, averageWaitSeconds: 9, peakWaitingToday: 3870 };
}
