import { allMeetings, overlaps } from "@/modules/course-registration/course-registration.constant";
import type { ClassSection, ClassSectionView } from "@/modules/course-registration/course-registration.type";

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

export function periodsPerWeekOf(section: Pick<ClassSection, "meetings" | "labGroups">) {
  return allMeetings(section).reduce((total, meeting) => total + meeting.endPeriod - meeting.startPeriod + 1, 0);
}

export function classSizeFactor(size: number) {
  if (size > 80) return 1.3;
  if (size > 50) return 1.15;
  return 1;
}

export function sectionStandardHours(section: Pick<ClassSection, "meetings" | "labGroups" | "enrolled" | "capacity">) {
  const size = section.enrolled > 0 ? section.enrolled : Math.round(section.capacity * 0.8);
  return periodsPerWeekOf(section) * TEACHING_WEEKS * classSizeFactor(size);
}

export const DEFAULT_NORM_HOURS = 135;

export function normHoursOf(title: string, norms: Record<string, number>) {
  return norms[title] ?? DEFAULT_NORM_HOURS;
}

export function computeWorkloads(sections: ClassSectionView[], lecturers: AssignableLecturer[], norms: Record<string, number>): WorkloadRow[] {
  return lecturers.map((lecturer) => {
    const own = sections.filter((section) => section.lecturerId === lecturer.id && section.status !== "cancelled");
    const standardHours = Math.round(own.reduce((sum, section) => sum + sectionStandardHours(section), 0));
    const normHours = normHoursOf(lecturer.title, norms);
    return {
      ...lecturer,
      sections: own,
      periodsPerWeek: own.reduce((sum, section) => sum + periodsPerWeekOf(section), 0),
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
    if (allMeetings(section).some((mine) => allMeetings(other).some((theirs) => overlaps(mine, theirs)))) return other;
  }
  return null;
}
