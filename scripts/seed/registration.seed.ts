import type { Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { createRandom, mockId, mockTermId } from "@/shared/libs/mock.lib";
import { alias } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { courseRelations, courses } from "@/modules/curriculum/curriculum.schema";
import { IMPROVABLE_GRADES } from "@/modules/course-registration/course-registration.rule";
import { CLASS_SECTIONS, CURRENT_STUDENT_PLAN, FACULTY_MAJOR_INDEX, REGISTRATION_HOLDS, REGISTRATION_PERIODS, rosterIndices, TERMS } from "@/modules/course-registration/course-registration.mock";
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
} from "@/modules/course-registration/course-registration.schema";
import { mockTranscriptTerms, PAST_TERMS } from "@/modules/grades/grades.mock";
import { CURRENT_STUDENT_ID, STUDENTS } from "@/modules/users/users.mock";
import { overlaps } from "@/modules/course-registration/course-registration.constant";
import type { ClassMeeting } from "@/modules/course-registration/course-registration.type";
import { by, type SeedContext } from "./context";

const TERM_KEY = /^hk([1-3])-(\d{4})$/;

const relatedCourses = alias(courses, "related_courses");

const TERM_KEYS = ["hk1-2022", "hk2-2022", "hk1-2023", "hk2-2023", "hk1-2024", "hk2-2024", "hk1-2025", "hk2-2025", "hk3-2025", "hk1-2026", "hk2-2026"];

function termRows() {
  const known = new Map(TERMS.map((term) => [term.id, term]));
  return TERM_KEYS.map((key) => {
    const [, semesterText, yearText] = TERM_KEY.exec(key)!;
    const semester = Number(semesterText);
    const year = Number(yearText);
    const id = mockTermId(key);
    const term = known.get(id);
    const name = term?.name ?? PAST_TERMS.find((entry) => entry.id === id)!.name;
    return {
      key,
      id,
      code: `${year}-${year + 1}.${semester}`,
      name,
      shortName: term?.shortName ?? `HK${semester} ${year}-${year + 1}`,
      academicYear: year,
      semester,
      startDate: term?.startDate ?? (semester === 1 ? `${year}-09-05` : `${year + 1}-02-15`),
      endDate: term?.endDate ?? (semester === 1 ? `${year + 1}-01-15` : `${year + 1}-06-25`),
      isCurrent: term?.isCurrent ?? false,
      isRegistrationTarget: term?.isRegistrationTarget ?? false,
    };
  });
}

function periodOf(termId: string, cohort: number) {
  return REGISTRATION_PERIODS.filter((period) => period.termId === termId && period.cohorts.includes(cohort) && dayjs(period.opensAt).isBefore(dayjs())).toSorted((a, b) => a.opensAt.localeCompare(b.opensAt))[0];
}

export async function seedRegistration(tx: Transaction, context: SeedContext) {
  const termValues = termRows();
  const insertedTerms = await tx
    .insert(terms)
    .values(termValues.map(({ key: _key, ...term }) => term))
    .returning();
  const keyOf = new Map(termValues.map((term) => [term.id, term.key]));
  context.termByKey = by(insertedTerms, (row) => keyOf.get(row.id)!);

  await tx.insert(registrationPeriods).values(
    REGISTRATION_PERIODS.map((period) => ({
      id: period.id,
      termId: period.termId,
      name: period.name,
      cohorts: period.cohorts,
      opensAt: new Date(period.opensAt),
      closesAt: new Date(period.closesAt),
      minCredits: period.minCredits,
      maxCredits: period.maxCredits,
    })),
  );

  await tx.insert(classSections).values(
    CLASS_SECTIONS.map((section) => ({
      id: section.id,
      termId: section.termId,
      courseId: context.courseByCode.get(section.courseCode)!.id,
      sectionNumber: Number(section.code.split(".")[1]),
      code: section.code,
      lecturerId: section.lecturerId,
      capacity: section.capacity,
      minEnrollment: section.minEnrollment,
      status: section.status,
      startDate: section.startDate,
      endDate: section.endDate,
      audienceCohorts: section.audience && section.audience.cohorts.length > 0 ? section.audience.cohorts : null,
      audienceNote: section.audience?.note ?? null,
    })),
  );
  const audienceMajors = CLASS_SECTIONS.flatMap((section) =>
    (section.audience?.majorCodes ?? []).map((code) => ({ classSectionId: section.id, majorId: context.majorByCode.get(code)!.id })),
  );
  if (audienceMajors.length > 0) await tx.insert(classSectionAudienceMajors).values(audienceMajors);
  await tx.insert(sectionMeetings).values(
    CLASS_SECTIONS.flatMap((section) =>
      section.meetings.map((meeting) => ({
        classSectionId: section.id,
        dayOfWeek: meeting.dayOfWeek,
        startPeriod: meeting.startPeriod,
        endPeriod: meeting.endPeriod,
        roomId: context.roomByCode.get(meeting.room)!.id,
      })),
    ),
  );
  const labs = CLASS_SECTIONS.flatMap((section) =>
    section.labGroups.map((lab) => ({
      id: lab.id,
      classSectionId: section.id,
      code: lab.code,
      dayOfWeek: lab.meeting.dayOfWeek,
      startPeriod: lab.meeting.startPeriod,
      endPeriod: lab.meeting.endPeriod,
      roomId: context.roomByCode.get(lab.meeting.room)!.id,
      capacity: lab.capacity,
    })),
  );
  if (labs.length > 0) await tx.insert(labGroups).values(labs);
  const seats = CLASS_SECTIONS.flatMap((section) =>
    section.reservedSeats.map((seat, index) => ({ id: mockId(`reserved:${section.id}:${index}`), classSectionId: section.id, label: seat.label, seats: seat.seats, cohorts: seat.cohorts, majorCodes: seat.majorCodes })),
  );
  if (seats.length > 0) {
    await tx.insert(reservedSeats).values(seats.map(({ majorCodes: _majorCodes, ...seat }) => seat));
    const seatMajors = seats.flatMap((seat) => seat.majorCodes.map((code) => ({ reservedSeatId: seat.id, majorId: context.majorByCode.get(code)!.id })));
    if (seatMajors.length > 0) await tx.insert(reservedSeatMajors).values(seatMajors);
  }

  const relationRows = await tx
    .select({ course: courses.code, kind: courseRelations.kind, related: relatedCourses.code })
    .from(courseRelations)
    .innerJoin(courses, eq(courses.id, courseRelations.courseId))
    .innerJoin(relatedCourses, eq(relatedCourses.id, courseRelations.relatedCourseId));
  const relationsOf = (kind: "prerequisite" | "corequisite" | "equivalent", code: string) => relationRows.filter((row) => row.kind === kind && row.course === code).map((row) => row.related);
  const lastGrades = STUDENTS.map((_, index) => {
    const last: Record<string, string> = {};
    for (const term of mockTranscriptTerms(index)) if (!term.isInProgress) for (const course of term.courses) if (course.letter) last[course.courseCode] = course.letter;
    return last;
  });
  const passed = (index: number, code: string) =>
    [code, ...relationsOf("equivalent", code)].some((entry) => lastGrades[index][entry] !== undefined && lastGrades[index][entry] !== "F");
  const currentTermId = TERMS.find((term) => term.isCurrent)!.id;

  const taken = new Set<string>();
  const courseCodesOf = new Map<string, Set<string>>();
  const busy = new Map<string, ClassMeeting[]>();
  const clashes = (key: string, meetings: ClassMeeting[]) => (busy.get(key) ?? []).some((theirs) => meetings.some((mine) => overlaps(mine, theirs)));
  const rows: (typeof enrollments.$inferInsert)[] = [];
  const seated = new Map<string, number>();
  for (const section of CLASS_SECTIONS) {
    if (section.status !== "open" || section.enrolled === 0) continue;
    const random = createRandom(section.capacity * 31 + section.enrolled);
    const courseId = context.courseByCode.get(section.courseCode)!.id;
    const labLoad = section.labGroups.map(() => 0);
    let count = 0;
    const termKey = keyOf.get(section.termId)!;
    const currentIndex = STUDENTS.findIndex((student) => student.id === CURRENT_STUDENT_ID);
    const order = rosterIndices(section.id, STUDENTS.length, FACULTY_MAJOR_INDEX[section.faculty] ?? 0);
    const roster = CURRENT_STUDENT_PLAN[termKey]?.includes(section.code) ? [currentIndex, ...order.filter((index) => index !== currentIndex)] : order.filter((index) => index !== currentIndex || !CURRENT_STUDENT_PLAN[termKey]);
    for (const index of roster) {
      if (count >= section.enrolled) break;
      const student = STUDENTS[index];
      const key = `${student.id}:${section.termId}:${section.courseCode}`;
      const slotKey = `${student.id}:${section.termId}`;
      const termCourses = courseCodesOf.get(slotKey) ?? new Set<string>();
      if (student.status !== "studying" || taken.has(key) || clashes(slotKey, section.meetings)) continue;
      const audience = section.audience;
      if (audience && ((audience.majorCodes.length > 0 && !audience.majorCodes.includes(student.majorCode)) || (audience.cohorts.length > 0 && !audience.cohorts.includes(student.cohort)))) continue;
      if (relationsOf("prerequisite", section.courseCode).some((code) => !passed(index, code))) continue;
      if (relationsOf("corequisite", section.courseCode).some((code) => !passed(index, code) && !termCourses.has(code))) continue;
      const own = lastGrades[index][section.courseCode];
      if (own && !IMPROVABLE_GRADES.includes(own) && own !== "F") continue;
      if (section.termId !== currentTermId && courseCodesOf.get(`${student.id}:${currentTermId}`)?.has(section.courseCode)) continue;
      const period = periodOf(section.termId, student.cohort);
      if (!period) continue;
      let labGroupId: string | null = null;
      if (section.labGroups.length > 0) {
        const open = section.labGroups.map((group, position) => position).filter((position) => labLoad[position] < section.labGroups[position].capacity);
        if (open.length === 0) break;
        const position = open.reduce((best, slot) => (labLoad[slot] < labLoad[best] ? slot : best));
        labLoad[position] += 1;
        labGroupId = section.labGroups[position].id;
      }
      const labMeeting = section.labGroups.find((group) => group.id === labGroupId)?.meeting;
      if (labMeeting && clashes(slotKey, [labMeeting])) {
        labLoad[section.labGroups.findIndex((group) => group.id === labGroupId)] -= 1;
        continue;
      }
      taken.add(key);
      termCourses.add(section.courseCode);
      courseCodesOf.set(slotKey, termCourses);
      busy.set(slotKey, [...(busy.get(slotKey) ?? []), ...section.meetings, ...(labMeeting ? [labMeeting] : [])]);
      count += 1;
      const opensAt = dayjs(period.opensAt);
      const closes = dayjs(period.closesAt);
      const until = closes.isBefore(dayjs().subtract(1, "hour")) ? closes : dayjs().subtract(1, "hour");
      const span = Math.max(1, until.diff(opensAt, "minute"));
      rows.push({
        id: mockId(`enrollment:${section.id}:${student.id}`),
        studentId: student.id,
        classSectionId: section.id,
        termId: section.termId,
        courseId,
        labGroupId,
        registeredAt: opensAt.add(Math.floor(random() * span), "minute").toDate(),
      });
    }
    seated.set(section.id, count);
  }
  for (let start = 0; start < rows.length; start += 500) await tx.insert(enrollments).values(rows.slice(start, start + 500));

  await tx.insert(registrationHolds).values(
    REGISTRATION_HOLDS.map((hold) => ({
      id: hold.id,
      studentId: hold.studentId,
      kind: hold.kind,
      blocking: hold.blocking,
      reason: hold.reason,
      resolveHint: hold.resolveHint,
      createdAt: new Date(hold.createdAt),
      createdByLabel: hold.createdBy,
    })),
  );

  return { terms: insertedTerms.length, sections: CLASS_SECTIONS.length, enrollments: rows.length, seated };
}
