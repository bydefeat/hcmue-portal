import type { Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { createRandom, mockId, mockTermId } from "@/shared/libs/mock.lib";
import { CLASS_SECTIONS, FACULTY_MAJOR_INDEX, REGISTRATION_HOLDS, REGISTRATION_PERIODS, rosterIndices, TERMS } from "@/modules/course-registration/course-registration.mock";
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
import { PAST_TERMS } from "@/modules/grades/grades.mock";
import { STUDENTS } from "@/modules/users/users.mock";
import { overlaps } from "@/modules/course-registration/course-registration.constant";
import type { ClassMeeting } from "@/modules/course-registration/course-registration.type";
import { by, type SeedContext } from "./context";

const TERM_KEY = /^hk([1-3])-(\d{4})$/;

// Khóa của mọi học kỳ có trong dữ liệu mẫu: bảng điểm từ 2022 và đăng ký học phần 2025-2027.
const TERM_KEYS = ["hk1-2022", "hk2-2022", "hk1-2023", "hk2-2023", "hk1-2024", "hk2-2024", "hk1-2025", "hk2-2025", "hk3-2025", "hk1-2026", "hk2-2026"];

// Học kỳ của bảng điểm (từ 2022) và của đăng ký học phần dùng chung một bảng terms. Học kỳ cũ không có ngày trong dữ liệu mẫu
// thì lấy lịch thường lệ: học kỳ 1 từ tháng 9 đến giữa tháng 1, học kỳ 2 từ giữa tháng 2 đến cuối tháng 6.
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

  // Danh sách lớp lấy theo cùng thứ tự chọn của dữ liệu mẫu, bỏ sinh viên không còn đang học và sinh viên đã có lớp khác
  // của cùng học phần trong học kỳ (DB chặn bằng enrollments_active_per_course_term).
  const taken = new Set<string>();
  const busy = new Map<string, ClassMeeting[]>();
  const clashes = (key: string, meetings: ClassMeeting[]) => (busy.get(key) ?? []).some((theirs) => meetings.some((mine) => overlaps(mine, theirs)));
  const rows: (typeof enrollments.$inferInsert)[] = [];
  for (const section of CLASS_SECTIONS) {
    if (section.status !== "open" || section.enrolled === 0) continue;
    const term = TERMS.find((entry) => entry.id === section.termId)!;
    const random = createRandom(section.capacity * 31 + section.enrolled);
    const courseId = context.courseByCode.get(section.courseCode)!.id;
    const labLoad = section.labGroups.map(() => 0);
    let count = 0;
    for (const index of rosterIndices(section.id, STUDENTS.length, FACULTY_MAJOR_INDEX[section.faculty] ?? 0)) {
      if (count >= section.enrolled) break;
      const student = STUDENTS[index];
      const key = `${student.id}:${section.termId}:${section.courseCode}`;
      const slotKey = `${student.id}:${section.termId}`;
      // Không xếp sinh viên vào hai lớp trùng giờ trong cùng học kỳ.
      if (student.status !== "studying" || taken.has(key) || clashes(slotKey, section.meetings)) continue;
      let labGroupId: string | null = null;
      if (section.labGroups.length > 0) {
        // Chia vào nhóm thực hành đang ít người nhất còn chỗ.
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
      busy.set(slotKey, [...(busy.get(slotKey) ?? []), ...section.meetings, ...(labMeeting ? [labMeeting] : [])]);
      count += 1;
      rows.push({
        id: mockId(`enrollment:${section.id}:${student.id}`),
        studentId: student.id,
        classSectionId: section.id,
        termId: section.termId,
        courseId,
        labGroupId,
        registeredAt: dayjs(term.startDate)
          .subtract(30, "day")
          .add(Math.floor(random() * 6 * 24), "hour")
          .toDate(),
      });
    }
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

  return { terms: insertedTerms.length, sections: CLASS_SECTIONS.length, enrollments: rows.length };
}
