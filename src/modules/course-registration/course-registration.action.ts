"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import {
  basketProblems,
  creditCapOf,
  evaluateSection,
  REGISTER_SCHEMA,
  sectionCredits,
  type EligibilityContext,
  type RegisterInput,
} from "@/modules/course-registration/course-registration.rule";
import { REGISTRATION_CONSTRAINT_MESSAGE } from "@/modules/course-registration/course-registration.constant";
import { getClassSections, getCurrentTerm, getRegistrationTargetTerm } from "@/modules/course-registration/course-registration.query";
import {
  classSections,
  enrollments,
  registrationEvents,
  registrationHolds,
  registrationPeriods,
  reservedSeatMajors,
  reservedSeats,
  waitlistEntries,
} from "@/modules/course-registration/course-registration.schema";
import { courseRelations, courses, majors } from "@/modules/curriculum/curriculum.schema";
import { academicWarnings, courseResults } from "@/modules/grades/grades.schema";
import { regulations } from "@/modules/settings/settings.schema";
import { getCurrentStudent } from "@/modules/users/users.query";
import type { ClassSectionView } from "@/modules/course-registration/course-registration.type";
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
  const [student, term] = await Promise.all([getCurrentStudent(), getRegistrationTargetTerm()]);
  const now = new Date();
  const [[period], [hold], sections, rows] = await Promise.all([
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
    getClassSections(term.id),
    db
      .select({ sectionId: enrollments.classSectionId })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, student.id), eq(enrollments.termId, term.id), eq(enrollments.status, "enrolled"))),
  ]);
  if (!period) return `Ngoài thời gian đăng ký của khóa ${student.cohort}.`;
  if (hold) return `Tài khoản đang bị khóa đăng ký: ${hold.reason}`;
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
