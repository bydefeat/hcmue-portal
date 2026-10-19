"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requirePermission } from "@/modules/access/access.query";
import { CURRICULUM_CONSTRAINT_MESSAGE } from "@/modules/curriculum/curriculum.constant";
import { getCourseById, getPrograms } from "@/modules/curriculum/curriculum.query";
import { COURSE_SCHEMA, PROGRAM_SCHEMA, type CourseInput, type ProgramInput } from "@/modules/curriculum/curriculum.rule";
import { courseRelations, courses, faculties, majors, programCohorts, programs } from "@/modules/curriculum/curriculum.schema";
import type { Course, ProgramSummary } from "@/modules/curriculum/curriculum.type";

class InputError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

async function facultyIdOf(tx: Transaction, name: string) {
  const [faculty] = await tx.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, name));
  if (!faculty) throw new InputError("faculty", "Khoa không có trong danh mục");
  return faculty.id;
}

async function replaceRelations(tx: Transaction, courseId: string, values: Pick<Course, "prerequisiteCodes" | "corequisiteCodes" | "equivalentCodes">) {
  const groups = [
    ["prerequisite", "prerequisiteCodes", values.prerequisiteCodes],
    ["corequisite", "corequisiteCodes", values.corequisiteCodes],
    ["equivalent", "equivalentCodes", values.equivalentCodes],
  ] as const;
  const codes = [...new Set(groups.flatMap(([, , list]) => list))];
  const found = codes.length > 0 ? await tx.select({ id: courses.id, code: courses.code }).from(courses).where(inArray(courses.code, codes)) : [];
  const idOf = new Map(found.map((row) => [row.code, row.id]));
  for (const [, field, list] of groups) {
    const missing = list.filter((code) => !idOf.has(code));
    if (missing.length > 0) throw new InputError(field, `Không có học phần ${missing.join(", ")} trong danh mục`);
  }
  await tx.delete(courseRelations).where(eq(courseRelations.courseId, courseId));
  const rows = groups.flatMap(([kind, , list]) => list.map((code) => ({ courseId, relatedCourseId: idOf.get(code)!, kind })));
  if (rows.length > 0) await tx.insert(courseRelations).values(rows);
}

function failure(error: unknown) {
  if (error instanceof InputError) return actionError(error.message, { [error.field]: error.message });
  return actionFailure(error, CURRICULUM_CONSTRAINT_MESSAGE);
}

function revalidateCurriculum() {
  revalidatePath("/administrator/courses");
  revalidatePath("/administrator/programs", "layout");
}

export async function saveCourse(id: string | null, input: CourseInput): Promise<ActionResult<Course>> {
  await requirePermission("curriculum.manage");
  if (id !== null && !isUuid(id)) return actionError("Học phần không còn trong danh mục, tải lại trang.");
  const parsed = parseInput(COURSE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { faculty, prerequisiteCodes, corequisiteCodes, equivalentCodes, code, ...values } = parsed.data;
  let courseId: string;
  try {
    courseId = await db.transaction(async (tx) => {
      const facultyId = await facultyIdOf(tx, faculty);
      // Mã học phần không đổi sau khi tạo vì đã gắn với điểm, đăng ký và chương trình.
      const [row] = id
        ? await tx.update(courses).set({ ...values, facultyId }).where(eq(courses.id, id)).returning({ id: courses.id })
        : await tx.insert(courses).values({ ...values, code, facultyId }).returning({ id: courses.id });
      if (!row) throw new InputError("code", "Học phần không còn trong danh mục, tải lại trang.");
      await replaceRelations(tx, row.id, { prerequisiteCodes, corequisiteCodes, equivalentCodes });
      return row.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateCurriculum();
  const course = await getCourseById(courseId);
  return course ? actionOk(course) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function saveProgram(id: string | null, input: ProgramInput): Promise<ActionResult<ProgramSummary>> {
  await requirePermission("curriculum.manage");
  if (id !== null && !isUuid(id)) return actionError("Chương trình không còn trong danh mục, tải lại trang.");
  const parsed = parseInput(PROGRAM_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { majorCode, cohorts, ...values } = parsed.data;
  let programId: string;
  try {
    programId = await db.transaction(async (tx) => {
      const [major] = await tx.select({ id: majors.id }).from(majors).where(eq(majors.code, majorCode));
      if (!major) throw new InputError("majorCode", "Ngành không có trong danh mục");
      const [row] = id
        ? await tx.update(programs).set({ ...values, majorId: major.id }).where(eq(programs.id, id)).returning({ id: programs.id })
        : await tx.insert(programs).values({ ...values, majorId: major.id }).returning({ id: programs.id });
      if (!row) throw new InputError("name", "Chương trình không còn trong danh mục, tải lại trang.");
      await tx.delete(programCohorts).where(eq(programCohorts.programId, row.id));
      await tx.insert(programCohorts).values(cohorts.map((cohort) => ({ programId: row.id, cohort })));
      return row.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateCurriculum();
  const [program] = await getPrograms(programId);
  return program ? actionOk(program) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}
