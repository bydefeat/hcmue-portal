import { periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, hoursUntil } from "@/shared/libs/date.lib";
import { createRandom, mockDelay, mockStudentIdentity } from "@/shared/libs/mock.lib";
import { CLOSING_SOON_HOURS } from "./course-registration.constant";
import {
  CLASS_SECTIONS,
  FACULTY_MAJOR_INDEX,
  REGISTRATION_PERIODS,
  rosterIndices,
  TERMS,
} from "./course-registration.mock";
import type {
  ClassConflict,
  ClassMeeting,
  ClassSection,
  ClassSectionView,
  FacultyRegistrationSummary,
  RegistrationPeriod,
  RegistrationPeriodView,
  RosterEntry,
} from "./course-registration.type";

function overlaps(a: ClassMeeting, b: ClassMeeting) {
  return a.dayOfWeek === b.dayOfWeek && a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod;
}

function conflictsOf(section: ClassSection, siblings: ClassSection[]): ClassConflict[] {
  if (section.status === "cancelled") return [];
  const conflicts: ClassConflict[] = [];
  for (const other of siblings) {
    if (other.id === section.id || other.status === "cancelled") continue;
    for (const mine of section.meetings) {
      for (const theirs of other.meetings) {
        if (!overlaps(mine, theirs)) continue;
        const when = `${weekdayLabel(mine.dayOfWeek)}, ${periodLabel(theirs.startPeriod, theirs.endPeriod)}`;
        if (mine.room === theirs.room) {
          conflicts.push({ kind: "room", withCode: other.code, message: `Trùng phòng ${mine.room} với ${other.code} (${when})` });
        }
        if (section.lecturerId && section.lecturerId === other.lecturerId) {
          conflicts.push({ kind: "lecturer", withCode: other.code, message: `Giảng viên đã dạy ${other.code} cùng giờ (${when})` });
        }
      }
    }
  }
  return conflicts;
}

function toView(section: ClassSection): ClassSectionView {
  const siblings = CLASS_SECTIONS.filter((entry) => entry.termId === section.termId);
  return { ...section, isFull: section.enrolled >= section.capacity, conflicts: conflictsOf(section, siblings) };
}

export function periodState(period: RegistrationPeriod): RegistrationPeriodView {
  const now = dayjs();
  const hoursLeft = hoursUntil(period.closesAt);
  if (now.isBefore(period.opensAt)) return { ...period, state: "upcoming", hoursLeft };
  if (now.isAfter(period.closesAt)) return { ...period, state: "closed", hoursLeft };
  return { ...period, state: hoursLeft <= CLOSING_SOON_HOURS ? "closing" : "open", hoursLeft };
}

export async function getTerms() {
  await mockDelay();
  return TERMS;
}

export async function getCurrentTerm() {
  return TERMS.find((term) => term.isCurrent)!;
}

export async function getRegistrationTargetTerm() {
  return TERMS.find((term) => term.isRegistrationTarget)!;
}

export async function getRegistrationPeriods(termId?: string) {
  await mockDelay();
  return REGISTRATION_PERIODS.filter((period) => !termId || period.termId === termId).map(periodState);
}

export async function getActiveRegistrationPeriods() {
  return REGISTRATION_PERIODS.map(periodState).filter((period) => period.state === "open" || period.state === "closing");
}

export async function getClassSections(termId: string) {
  await mockDelay();
  return CLASS_SECTIONS.filter((section) => section.termId === termId).map(toView);
}

export async function getClassSection(id: string) {
  const section = CLASS_SECTIONS.find((entry) => entry.id === id);
  return section ? toView(section) : null;
}

export async function getLecturerClassSections(lecturerId: string, termId: string) {
  await mockDelay();
  return CLASS_SECTIONS.filter((section) => section.lecturerId === lecturerId && section.termId === termId && section.status !== "cancelled").map(toView);
}

export async function getClassRoster(sectionId: string): Promise<RosterEntry[]> {
  await mockDelay();
  const section = CLASS_SECTIONS.find((entry) => entry.id === sectionId);
  if (!section) return [];
  const term = TERMS.find((entry) => entry.id === section.termId)!;
  const random = createRandom(section.enrolled * 13 + section.capacity);
  return rosterIndices(section.id, section.enrolled, FACULTY_MAJOR_INDEX[section.faculty] ?? 0)
    .map((index) => {
      const student = mockStudentIdentity(index);
      return {
        enrollmentId: `${section.id}-${student.id}`,
        studentId: student.id,
        studentCode: student.code,
        fullName: student.fullName,
        className: student.className,
        registeredAt: dayjs(term.startDate).subtract(30, "day").add(Math.floor(random() * 6 * 24), "hour").toISOString(),
      };
    })
    .sort((a, b) => a.fullName.split(" ").at(-1)!.localeCompare(b.fullName.split(" ").at(-1)!, "vi") || a.fullName.localeCompare(b.fullName, "vi"));
}

export async function getRegistrationSummary(termId: string): Promise<FacultyRegistrationSummary[]> {
  await mockDelay();
  const summary = new Map<string, FacultyRegistrationSummary>();
  for (const section of CLASS_SECTIONS) {
    if (section.termId !== termId || section.status !== "open") continue;
    const entry = summary.get(section.faculty) ?? { faculty: section.faculty, sections: 0, capacity: 0, enrolled: 0, fullSections: 0 };
    entry.sections += 1;
    entry.capacity += section.capacity;
    entry.enrolled += section.enrolled;
    if (section.enrolled >= section.capacity) entry.fullSections += 1;
    summary.set(section.faculty, entry);
  }
  return [...summary.values()].sort((a, b) => b.enrolled / b.capacity - a.enrolled / a.capacity);
}
