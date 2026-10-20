import "server-only";
import { cache } from "react";
import { and, asc, count, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { KNOWLEDGE_BLOCK_LABEL } from "@/modules/curriculum/curriculum.constant";
import { courseRelations, courses, faculties, majors, programCohorts, programCourses, programElectiveGroups, programs } from "@/modules/curriculum/curriculum.schema";
import type { Course, KnowledgeBlock, Major, Program, ProgramDetail, ProgramSummary } from "@/modules/curriculum/curriculum.type";

const relatedCourses = alias(courses, "related_courses");

async function courseRows(id?: string): Promise<Course[]> {
  const [rows, relations] = await Promise.all([
    db
      .select({
        id: courses.id,
        code: courses.code,
        name: courses.name,
        credits: courses.credits,
        theoryCredits: courses.theoryCredits,
        practiceCredits: courses.practiceCredits,
        faculty: faculties.name,
        type: courses.type,
        block: courses.block,
        isActive: courses.isActive,
        isConditional: courses.isConditional,
        description: courses.description,
      })
      .from(courses)
      .innerJoin(faculties, eq(faculties.id, courses.facultyId))
      .where(id ? eq(courses.id, id) : undefined)
      .orderBy(asc(courses.code)),
    db
      .select({ courseId: courseRelations.courseId, kind: courseRelations.kind, code: relatedCourses.code })
      .from(courseRelations)
      .innerJoin(relatedCourses, eq(relatedCourses.id, courseRelations.relatedCourseId))
      .where(id ? eq(courseRelations.courseId, id) : undefined)
      .orderBy(asc(relatedCourses.code)),
  ]);
  const codesOf = (courseId: string, kind: (typeof relations)[number]["kind"]) =>
    relations.filter((relation) => relation.courseId === courseId && relation.kind === kind).map((relation) => relation.code);
  return rows.map((row) => ({
    ...row,
    prerequisiteCodes: codesOf(row.id, "prerequisite"),
    corequisiteCodes: codesOf(row.id, "corequisite"),
    equivalentCodes: codesOf(row.id, "equivalent"),
  }));
}

export async function getCourses(): Promise<Course[]> {
  await requireSession();
  return courseRows();
}

export async function getCourseById(id: string): Promise<Course | null> {
  await requireSession();
  if (!isUuid(id)) return null;
  const [course] = await courseRows(id);
  return course ?? null;
}

export async function getFacultyNames(): Promise<string[]> {
  await requireSession();
  const rows = await db.select({ name: faculties.name }).from(faculties).orderBy(asc(faculties.name));
  return rows.map((row) => row.name);
}

export async function getMajors(): Promise<Major[]> {
  await requireSession();
  return db
    .select({ code: majors.code, name: majors.name, faculty: faculties.name })
    .from(majors)
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .orderBy(asc(majors.name));
}

async function programRows(id?: string): Promise<Program[]> {
  const [rows, cohorts] = await Promise.all([
    db
      .select({
        id: programs.id,
        code: programs.code,
        name: programs.name,
        majorCode: majors.code,
        faculty: faculties.name,
        degree: programs.degree,
        totalCredits: programs.totalCredits,
        durationYears: programs.durationYears,
        status: programs.status,
        updatedAt: programs.updatedAt,
      })
      .from(programs)
      .innerJoin(majors, eq(majors.id, programs.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(id ? eq(programs.id, id) : undefined)
      .orderBy(asc(programs.name)),
    db
      .select()
      .from(programCohorts)
      .where(id ? eq(programCohorts.programId, id) : undefined)
      .orderBy(asc(programCohorts.cohort)),
  ]);
  return rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
    cohorts: cohorts.filter((entry) => entry.programId === row.id).map((entry) => entry.cohort),
  }));
}

export async function getPrograms(id?: string): Promise<ProgramSummary[]> {
  await requireSession();
  if (id !== undefined && !isUuid(id)) return [];
  const [rows, counts] = await Promise.all([
    programRows(id),
    db
      .select({ programId: programCourses.programId, total: count() })
      .from(programCourses)
      .where(id ? eq(programCourses.programId, id) : undefined)
      .groupBy(programCourses.programId),
  ]);
  const countOf = new Map(counts.map((entry) => [entry.programId, entry.total]));
  return rows.map((row) => ({ ...row, courseCount: countOf.get(row.id) ?? 0 }));
}

// Chương trình đang áp dụng cho ngành và khóa của sinh viên (program_cohorts, chỉ chương trình active), cùng cách chọn với
// programsOf trong curriculum.lib (xét tốt nghiệp, kế hoạch học tập). Không có thì null.
export const getProgramOf = cache(async (majorCode: string, cohort: number): Promise<ProgramSummary | null> => {
  await requireSession();
  const [row] = await db
    .select({ id: programs.id })
    .from(programs)
    .innerJoin(majors, eq(majors.id, programs.majorId))
    .innerJoin(programCohorts, eq(programCohorts.programId, programs.id))
    .where(and(eq(majors.code, majorCode), eq(programCohorts.cohort, cohort), eq(programs.status, "active")))
    .limit(1);
  if (!row) return null;
  const [program] = await getPrograms(row.id);
  return program ?? null;
});

export async function getProgram(id: string): Promise<ProgramDetail | null> {
  await requireSession();
  if (!isUuid(id)) return null;
  const [[program], allCourses, plan, groups] = await Promise.all([
    programRows(id),
    getCourses(),
    db
      .select({ courseId: programCourses.courseId, semester: programCourses.semester, groupId: programCourses.electiveGroupId })
      .from(programCourses)
      .where(eq(programCourses.programId, id)),
    db
      .select({ id: programElectiveGroups.id, name: programElectiveGroups.name, minCredits: programElectiveGroups.minCredits })
      .from(programElectiveGroups)
      .where(eq(programElectiveGroups.programId, id))
      .orderBy(asc(programElectiveGroups.createdAt), asc(programElectiveGroups.name)),
  ]);
  if (!program) return null;
  const courseById = new Map(allCourses.map((course) => [course.id, course]));
  const semesterNumbers = [...new Set(plan.map((entry) => entry.semester))].toSorted((a, b) => a - b);
  const semesters = semesterNumbers.map((semester) => {
    const semesterCourses = plan
      .filter((entry) => entry.semester === semester)
      .map((entry) => courseById.get(entry.courseId))
      .filter((course) => course !== undefined)
      .toSorted((a, b) => a.code.localeCompare(b.code));
    return { semester, courses: semesterCourses, credits: semesterCourses.reduce((sum, course) => sum + course.credits, 0) };
  });
  // Học phần điều kiện không tính vào tổng tín chỉ của chương trình nên đếm riêng.
  const plannedCourses = semesters.flatMap((semester) => semester.courses).filter((course) => !course.isConditional);
  const conditionalCourses = semesters.flatMap((semester) => semester.courses).filter((course) => course.isConditional);
  const creditsByBlock = (Object.keys(KNOWLEDGE_BLOCK_LABEL) as KnowledgeBlock[]).map((block) => ({
    block,
    credits: plannedCourses.filter((course) => course.block === block).reduce((sum, course) => sum + course.credits, 0),
  }));
  const electiveGroups = groups.map((group) => {
    const members = plan
      .filter((entry) => entry.groupId === group.id)
      .map((entry) => courseById.get(entry.courseId))
      .filter((course) => course !== undefined)
      .toSorted((a, b) => a.code.localeCompare(b.code));
    return { ...group, courseCodes: members.map((course) => course.code), availableCredits: members.reduce((sum, course) => sum + course.credits, 0) };
  });
  return {
    ...program,
    semesters,
    plannedCredits: plannedCourses.reduce((sum, course) => sum + course.credits, 0),
    conditionalCredits: conditionalCourses.reduce((sum, course) => sum + course.credits, 0),
    creditsByBlock,
    electiveGroups,
  };
}
