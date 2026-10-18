import { mockDelay } from "@/shared/libs/mock-request.lib";
import { SYLLABUS_WEEKS } from "./teaching.constant";
import { CLASS_ANNOUNCEMENTS, SYLLABI } from "./teaching.mock";
import type { Syllabus } from "./teaching.type";

export async function getSyllabus(classSectionId: string, fallback: { courseCode: string; courseName: string }): Promise<Syllabus> {
  await mockDelay();
  const found = SYLLABI.find((syllabus) => syllabus.classSectionId === classSectionId);
  if (found) return found;
  return {
    classSectionId,
    courseCode: fallback.courseCode,
    courseName: fallback.courseName,
    status: "draft",
    publishedAt: null,
    updatedAt: new Date().toISOString(),
    description: "",
    outcomes: [],
    weeks: Array.from({ length: SYLLABUS_WEEKS }, (_, index) => ({ week: index + 1, topic: "", activities: "", readings: "" })),
    assessments: [],
    references: [],
  };
}

export async function getClassAnnouncements(classSectionId: string) {
  await mockDelay();
  return CLASS_ANNOUNCEMENTS.filter((announcement) => announcement.classSectionId === classSectionId).sort(
    (a, b) => Number(b.isPinned) - Number(a.isPinned) || b.publishAt.localeCompare(a.publishAt),
  );
}
