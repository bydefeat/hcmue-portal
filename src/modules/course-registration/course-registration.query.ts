import "server-only";
import { cache } from "react";
import { and, asc, countDistinct, desc, eq, gt, inArray, lte, max, notExists, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { requirePermission } from "@/modules/access/access.query";
import { requireSession } from "@/modules/authentication/authentication.query";
import { creditLimitsFor, loadSections, registrationActivityOf, registrationStudentOf, termFactsOf } from "@/modules/course-registration/course-registration.lib";
import { conflictsOf, periodState } from "@/modules/course-registration/course-registration.constant";
import { computeWorkloads, normHoursOf, periodsPerWeekOf, TEACHING_WEEKS } from "@/modules/course-registration/teaching-assignment.rule";
import { regulationAt } from "@/modules/settings/settings.lib";
import { getRegulation } from "@/modules/settings/settings.query";
import {
  classSections,
  enrollments,
  registrationEvents,
  registrationHolds,
  registrationPeriods,
  terms,
  waitlistEntries,
} from "@/modules/course-registration/course-registration.schema";
import { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { notifications } from "@/modules/notifications/notifications.schema";
import { administrativeClasses, lecturerLoadNorms, lecturers, students } from "@/modules/users/users.schema";
import type {
  UnregisteredStudent,
  ClassSectionView,
  FacultyRegistrationSummary,
  LecturerWorkload,
  RegistrationEvent,
  RegistrationHold,
  RegistrationPeriod,
  RegistrationActivity,
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

async function periodRows(where?: SQL, options: { counts: boolean } = { counts: true }): Promise<RegistrationPeriod[]> {
  const periods = await db.select().from(registrationPeriods).where(where).orderBy(asc(registrationPeriods.opensAt));
  if (periods.length === 0) return [];
  if (!options.counts) {
    return periods.map((period) => ({
      id: period.id,
      termId: period.termId,
      name: period.name,
      cohorts: period.cohorts,
      opensAt: period.opensAt.toISOString(),
      closesAt: period.closesAt.toISOString(),
      minCredits: period.minCredits,
      maxCredits: period.maxCredits,
      eligibleStudents: 0,
      registeredStudents: 0,
    }));
  }
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
  const [rows, regulation] = await Promise.all([periodRows(termId ? eq(registrationPeriods.termId, termId) : undefined), getRegulation()]);
  return rows.map((period) => periodState(period, regulation.workflow.registrationClosingSoonHours));
}

export async function getPublicRegistrationSchedule() {
  const all = await db.select(termColumns).from(terms).orderBy(asc(terms.startDate));
  const currentTerm = all.find((entry) => entry.isCurrent);
  if (!currentTerm) throw new Error("Chưa đặt học kỳ hiện tại (terms.is_current)");
  const targetTerm = all.find((entry) => entry.isRegistrationTarget) ?? currentTerm;
  const [targetRows, openRows, regulation] = await Promise.all([
    periodRows(eq(registrationPeriods.termId, targetTerm.id), { counts: false }),
    periodRows(sql`${registrationPeriods.closesAt} > now()`, { counts: false }),
    regulationAt(db),
  ]);
  const closingSoonHours = regulation.workflow.registrationClosingSoonHours;
  return {
    currentTerm,
    targetTerm,
    periods: targetRows.map((period) => periodState(period, closingSoonHours)),
    active: openRows.map((period) => periodState(period, closingSoonHours)).filter((period) => period.state === "open" || period.state === "closing"),
  };
}

export async function getActiveRegistrationPeriods() {
  await requireSession();
  const [rows, regulation] = await Promise.all([periodRows(sql`${registrationPeriods.closesAt} > now()`), getRegulation()]);
  return rows.map((period) => periodState(period, regulation.workflow.registrationClosingSoonHours)).filter((period) => period.state === "open" || period.state === "closing");
}

async function loadTermSections(termId: string): Promise<ClassSectionView[]> {
  if (!isUuid(termId)) return [];
  const sections = await loadSections(db, eq(classSections.termId, termId));
  return sections.map((section) => ({ ...section, isFull: section.enrolled >= section.capacity, conflicts: conflictsOf(section, sections) }));
}

const termSections = cache(loadTermSections);

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

export async function readClassSectionAfterWrite(id: string) {
  await requireSession();
  const [row] = await db.select({ termId: classSections.termId }).from(classSections).where(eq(classSections.id, id));
  if (!row) return null;
  return (await loadTermSections(row.termId)).find((section) => section.id === id) ?? null;
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

export async function getRegistrationEvents(studentId: string, termId: string): Promise<RegistrationEvent[]> {
  await requireSession();
  if (!isUuid(studentId) || !isUuid(termId)) return [];
  const [events, enrolled] = await Promise.all([
    db
      .select({
        id: registrationEvents.id,
        at: registrationEvents.at,
        kind: registrationEvents.kind,
        sectionId: classSections.id,
        sectionCode: classSections.code,
        courseName: courses.name,
        actor: registrationEvents.actorLabel,
        channel: registrationEvents.channel,
        note: registrationEvents.note,
      })
      .from(registrationEvents)
      .innerJoin(classSections, eq(classSections.id, registrationEvents.classSectionId))
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .where(and(eq(registrationEvents.studentId, studentId), eq(classSections.termId, termId))),
    db
      .select({
        id: enrollments.id,
        at: enrollments.registeredAt,
        sectionId: classSections.id,
        sectionCode: classSections.code,
        courseName: courses.name,
        credits: courses.credits,
        studentName: students.fullName,
      })
      .from(enrollments)
      .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.termId, termId))),
  ]);
  const logged = new Set(events.filter((event) => event.kind === "add" || event.kind === "admin-add").map((event) => event.sectionId));
  const imported: RegistrationEvent[] = enrolled
    .filter((entry) => !logged.has(entry.sectionId))
    .map((entry) => ({
      id: entry.id,
      at: entry.at.toISOString(),
      kind: "add",
      sectionCode: entry.sectionCode,
      courseName: entry.courseName,
      actor: entry.studentName,
      channel: "Cổng sinh viên",
      note: `Đăng ký ${entry.credits} tín chỉ`,
    }));
  return [...events.map(({ sectionId: _sectionId, ...event }) => ({ ...event, at: event.at.toISOString() })), ...imported].toSorted((a, b) => b.at.localeCompare(a.at));
}

export async function getLoadNorms(): Promise<Record<string, number>> {
  await requireSession();
  const rows = await db.select({ title: lecturerLoadNorms.title, normHours: lecturerLoadNorms.normHours }).from(lecturerLoadNorms);
  return Object.fromEntries(rows.map((row) => [row.title, row.normHours]));
}

export async function getLecturerWorkloads(termId: string): Promise<LecturerWorkload[]> {
  await requireSession();
  const [people, norms, sections] = await Promise.all([
    db
      .select({ id: lecturers.id, title: lecturers.title, fullName: lecturers.fullName, faculty: faculties.name, status: lecturers.status })
      .from(lecturers)
      .innerJoin(faculties, eq(faculties.id, lecturers.facultyId))
      .orderBy(asc(lecturers.code)),
    getLoadNorms(),
    termSections(termId),
  ]);
  const rows = computeWorkloads(
    sections,
    people.map((person) => ({ id: person.id, displayName: `${person.title} ${person.fullName}`, title: person.title, faculty: person.faculty, status: person.status })),
    norms,
  );
  return rows.map((row) => ({
    lecturerId: row.id,
    lecturerName: row.displayName,
    faculty: row.faculty,
    title: row.title,
    sectionCodes: row.sections.map((section) => section.code),
    periodsPerWeek: row.periodsPerWeek,
    teachingHours: row.sections.reduce((sum, section) => sum + periodsPerWeekOf(section), 0) * TEACHING_WEEKS,
    standardHours: row.standardHours,
    normHours: normHoursOf(row.title, norms),
  }));
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

export async function getRegistrationQueueStatus(termId: string): Promise<RegistrationActivity | null> {
  await requirePermission("registration.manage");
  if (!isUuid(termId)) return null;
  return registrationActivityOf(db, termId, new Date());
}

export const REGISTRATION_REMINDER_HREF = "/application/registration";

export async function getUnregisteredStudents(termId: string): Promise<UnregisteredStudent[]> {
  await requireSession();
  if (!isUuid(termId)) return [];
  const now = new Date();
  const periods = await db
    .select({ cohorts: registrationPeriods.cohorts, opensAt: registrationPeriods.opensAt })
    .from(registrationPeriods)
    .where(and(eq(registrationPeriods.termId, termId), lte(registrationPeriods.opensAt, now), gt(registrationPeriods.closesAt, now)));
  const opensAtOf = new Map<number, Date>();
  for (const period of periods) {
    for (const cohort of period.cohorts) {
      const current = opensAtOf.get(cohort);
      if (!current || period.opensAt < current) opensAtOf.set(cohort, period.opensAt);
    }
  }
  if (opensAtOf.size === 0) return [];
  const rows = await db
    .select({
      id: students.id,
      userId: students.userId,
      code: students.code,
      fullName: students.fullName,
      className: administrativeClasses.code,
      cohort: administrativeClasses.cohort,
      faculty: faculties.name,
      email: students.email,
    })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(
      and(
        eq(students.status, "studying"),
        inArray(administrativeClasses.cohort, [...opensAtOf.keys()]),
        notExists(
          db
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(and(eq(enrollments.studentId, students.id), eq(enrollments.termId, termId), eq(enrollments.status, "enrolled"))),
        ),
      ),
    )
    .orderBy(administrativeClasses.code, students.code);
  const userIds = rows.flatMap((row) => (row.userId ? [row.userId] : []));
  const reminders =
    userIds.length === 0
      ? []
      : await db
          .select({ userId: notifications.recipientUserId, at: max(notifications.createdAt) })
          .from(notifications)
          .where(and(inArray(notifications.recipientUserId, userIds), eq(notifications.kind, "deadline"), eq(notifications.href, REGISTRATION_REMINDER_HREF)))
          .groupBy(notifications.recipientUserId);
  const remindedAtOf = new Map(reminders.map((reminder) => [reminder.userId, reminder.at]));
  return rows.map(({ userId, code, ...row }) => {
    const remindedAt = userId ? remindedAtOf.get(userId) : null;
    return {
      ...row,
      code: formatStudentCode(code),
      hasAccount: userId !== null,
      remindedAt: remindedAt && remindedAt >= opensAtOf.get(row.cohort)! ? remindedAt.toISOString() : null,
    };
  });
}

export async function getTermOverview() {
  await requireSession();
  return db
    .select({
      ...termColumns,
      academicYear: terms.academicYear,
      semester: terms.semester,
      sectionCount: sql<number>`(SELECT count(*) FROM ${classSections} WHERE ${classSections.termId} = ${terms.id})`.mapWith(Number),
      periodCount: sql<number>`(SELECT count(*) FROM ${registrationPeriods} WHERE ${registrationPeriods.termId} = ${terms.id})`.mapWith(Number),
    })
    .from(terms)
    .orderBy(asc(terms.startDate));
}

export async function getCreditLimits(studentId: string, termId: string) {
  await requireSession();
  const regulation = await getRegulation();
  if (!isUuid(studentId) || !isUuid(termId)) return null;
  const [student, term] = await Promise.all([registrationStudentOf(db, studentId), termFactsOf(db, termId)]);
  if (!student || !term) return null;
  return creditLimitsFor(db, student, term, regulation, new Date());
}

export type WaitlistRow = {
  id: string;
  sectionId: string;
  position: number;
  studentId: string;
  studentCode: string;
  studentName: string;
  className: string;
  faculty: string;
  createdAt: string;
};

export async function getTermWaitlists(termId: string): Promise<WaitlistRow[]> {
  await requirePermission("registration.manage");
  if (!isUuid(termId)) return [];
  const rows = await db
    .select({
      id: waitlistEntries.id,
      sectionId: waitlistEntries.classSectionId,
      studentId: students.id,
      studentCode: students.code,
      studentName: students.fullName,
      className: administrativeClasses.code,
      faculty: faculties.name,
      createdAt: waitlistEntries.createdAt,
    })
    .from(waitlistEntries)
    .innerJoin(classSections, eq(classSections.id, waitlistEntries.classSectionId))
    .innerJoin(students, eq(students.id, waitlistEntries.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(and(eq(classSections.termId, termId), eq(waitlistEntries.status, "waiting")))
    .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id));
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const position = (seen.get(row.sectionId) ?? 0) + 1;
    seen.set(row.sectionId, position);
    return { ...row, position, studentCode: formatStudentCode(row.studentCode), createdAt: row.createdAt.toISOString() };
  });
}
