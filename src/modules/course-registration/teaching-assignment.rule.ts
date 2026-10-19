import { overlaps } from "@/modules/course-registration/course-registration.constant";
import type { ClassSectionView } from "@/modules/course-registration/course-registration.type";

export const TEACHING_WEEKS = 15;

export type AssignableLecturer = {
  id: string;
  displayName: string;
  title: string;
  faculty: string;
  status: "active" | "on-leave";
};

export type WorkloadRow = AssignableLecturer & {
  sections: ClassSectionView[];
  periodsPerWeek: number;
  standardHours: number;
  normHours: number;
  ratio: number;
};

export type LoadState = "over" | "balanced" | "under" | "none";

function periodsOf(section: ClassSectionView) {
  return section.meetings.reduce((total, meeting) => total + meeting.endPeriod - meeting.startPeriod + 1, 0);
}

function sizeFactor(enrolled: number) {
  if (enrolled > 80) return 1.3;
  if (enrolled > 50) return 1.15;
  return 1;
}

export function normHoursOf(title: string) {
  return title.startsWith("GS") || title.startsWith("PGS") ? 120 : 135;
}

export function computeWorkloads(sections: ClassSectionView[], lecturers: AssignableLecturer[]): WorkloadRow[] {
  return lecturers.map((lecturer) => {
    const own = sections.filter((section) => section.lecturerId === lecturer.id && section.status !== "cancelled");
    const standardHours = Math.round(own.reduce((sum, section) => sum + periodsOf(section) * TEACHING_WEEKS * sizeFactor(Math.max(section.enrolled, Math.round(section.capacity * 0.8))), 0));
    const normHours = normHoursOf(lecturer.title);
    return {
      ...lecturer,
      sections: own,
      periodsPerWeek: own.reduce((sum, section) => sum + periodsOf(section), 0),
      standardHours,
      normHours,
      ratio: standardHours / normHours,
    };
  });
}

export function loadStateOf(row: Pick<WorkloadRow, "ratio" | "sections">): LoadState {
  if (row.sections.length === 0) return "none";
  if (row.ratio > 1.2) return "over";
  if (row.ratio < 0.5) return "under";
  return "balanced";
}

export function lecturerClash(section: ClassSectionView, lecturerId: string, sections: ClassSectionView[]) {
  for (const other of sections) {
    if (other.id === section.id || other.lecturerId !== lecturerId || other.status === "cancelled") continue;
    if (section.meetings.some((mine) => other.meetings.some((theirs) => overlaps(mine, theirs)))) return other;
  }
  return null;
}
