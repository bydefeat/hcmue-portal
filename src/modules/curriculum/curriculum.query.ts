import { mockDelay } from "@/shared/libs/mock-request.lib";
import { KNOWLEDGE_BLOCK_LABEL } from "@/modules/curriculum/curriculum.constant";
import { COURSES, PROGRAM_COURSES, PROGRAMS } from "@/modules/curriculum/curriculum.mock";
import type { KnowledgeBlock, ProgramDetail, ProgramSummary } from "@/modules/curriculum/curriculum.type";

export async function getCourses() {
  await mockDelay();
  return COURSES;
}

export async function getPrograms(): Promise<ProgramSummary[]> {
  await mockDelay();
  return PROGRAMS.map((program) => ({
    ...program,
    courseCount: PROGRAM_COURSES[program.id]?.length ?? 0,
  }));
}

export async function getProgram(id: string): Promise<ProgramDetail | null> {
  await mockDelay();
  const program = PROGRAMS.find((entry) => entry.id === id);
  if (!program) return null;
  const courseByCode = new Map(COURSES.map((course) => [course.code, course]));
  const plan = PROGRAM_COURSES[id] ?? [];
  const semesterNumbers = [...new Set(plan.map((entry) => entry.semester))].toSorted((a, b) => a - b);
  const semesters = semesterNumbers.map((semester) => {
    const courses = plan
      .filter((entry) => entry.semester === semester)
      .map((entry) => courseByCode.get(entry.courseCode))
      .filter((course) => course !== undefined);
    return { semester, courses, credits: courses.reduce((sum, course) => sum + course.credits, 0) };
  });
  const allCourses = semesters.flatMap((semester) => semester.courses);
  const creditsByBlock = (Object.keys(KNOWLEDGE_BLOCK_LABEL) as KnowledgeBlock[]).map((block) => ({
    block,
    credits: allCourses.filter((course) => course.block === block).reduce((sum, course) => sum + course.credits, 0),
  }));
  return {
    ...program,
    semesters,
    plannedCredits: allCourses.reduce((sum, course) => sum + course.credits, 0),
    creditsByBlock,
  };
}
