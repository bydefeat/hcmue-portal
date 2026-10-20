"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { COURSE_TYPE_LABEL, CURRICULUM_CONSTRAINT_MESSAGE, KNOWLEDGE_BLOCK_LABEL, PROGRAM_STATUS } from "@/modules/curriculum/curriculum.constant";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { auditChanges } from "@/modules/audit/audit.rule";
import { applyProgramCourseChange, deleteElectiveGroup, FrameworkError, saveElectiveGroup } from "@/modules/curriculum/curriculum.lib";
import { getCourseById, getProgram, getPrograms } from "@/modules/curriculum/curriculum.query";
import {
  COURSE_SCHEMA,
  ELECTIVE_GROUP_SCHEMA,
  PROGRAM_COURSE_CHANGE_SCHEMA,
  PROGRAM_SCHEMA,
  programStatusChangeError,
  type CourseInput,
  type ElectiveGroupInput,
  type ProgramCourseChangeInput,
  type ProgramInput,
} from "@/modules/curriculum/curriculum.rule";
import { courseRelations, courses, faculties, majors, programCohorts, programs } from "@/modules/curriculum/curriculum.schema";
import type { Course, ProgramDetail, ProgramSummary } from "@/modules/curriculum/curriculum.type";

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
  if (error instanceof FrameworkError) return actionError(error.message);
  return actionFailure(error, CURRICULUM_CONSTRAINT_MESSAGE);
}

function revalidateCurriculum() {
  revalidatePath("/administrator/courses");
  revalidatePath("/administrator/programs", "layout");
}

const relationText = (codes: string[]) => (codes.length > 0 ? codes.join(", ") : "Không có");

// Cán bộ theo khoa chỉ thêm, sửa học phần của khoa mình (cả khoa đang quản lý lẫn khoa sau khi sửa).
export async function saveCourse(id: string | null, input: CourseInput): Promise<ActionResult<Course>> {
  const viewer = await requirePermission("curriculum.manage");
  if (id !== null && !isUuid(id)) return actionError("Học phần không còn trong danh mục, tải lại trang.");
  const parsed = parseInput(COURSE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { faculty, prerequisiteCodes, corequisiteCodes, equivalentCodes, code, ...values } = parsed.data;
  if (!inScope(viewer, faculty)) return actionError("Bạn chỉ quản lý được học phần của khoa mình.", { faculty: `Chỉ chọn được ${viewer.faculty}` });
  const before = id ? await getCourseById(id) : null;
  if (id && !before) return actionError("Học phần không còn trong danh mục, tải lại trang.");
  if (before && !inScope(viewer, before.faculty)) return actionError("Học phần thuộc khoa khác, bạn chỉ sửa được học phần của khoa mình.");
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
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: before ? "update" : "create",
        entityType: "course",
        entityId: row.id,
        entityLabel: `${before?.code ?? code} ${values.name}`,
        summary: before ? "Sửa học phần" : "Thêm học phần vào danh mục",
        changes: before
          ? auditChanges([
              ["Tên học phần", before.name, values.name],
              ["Số tín chỉ", String(before.credits), String(values.credits)],
              ["Lý thuyết / thực hành", `${before.theoryCredits}/${before.practiceCredits}`, `${values.theoryCredits}/${values.practiceCredits}`],
              ["Khoa", before.faculty, faculty],
              ["Loại", COURSE_TYPE_LABEL[before.type], COURSE_TYPE_LABEL[values.type]],
              ["Khối kiến thức", KNOWLEDGE_BLOCK_LABEL[before.block], KNOWLEDGE_BLOCK_LABEL[values.block]],
              ["Đang mở", before.isActive ? "Có" : "Không", values.isActive ? "Có" : "Không"],
              ["Học phần điều kiện", before.isConditional ? "Có" : "Không", values.isConditional ? "Có" : "Không"],
              ["Tiên quyết", relationText(before.prerequisiteCodes), relationText(prerequisiteCodes)],
              ["Song hành", relationText(before.corequisiteCodes), relationText(corequisiteCodes)],
              ["Tương đương", relationText(before.equivalentCodes), relationText(equivalentCodes)],
            ])
          : [],
      });
      return row.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateCurriculum();
  const course = await getCourseById(courseId);
  return course ? actionOk(course) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Cán bộ theo khoa chỉ sửa chương trình của ngành thuộc khoa mình. Chương trình đã ngừng áp dụng không mở lại được; mỗi ngành, khóa
// chỉ một chương trình đang áp dụng (DB chặn thêm bằng trigger programs_archived_final, programs_single_active_cohort).
export async function saveProgram(id: string | null, input: ProgramInput): Promise<ActionResult<ProgramSummary>> {
  const viewer = await requirePermission("curriculum.manage");
  if (id !== null && !isUuid(id)) return actionError("Chương trình không còn trong danh mục, tải lại trang.");
  const parsed = parseInput(PROGRAM_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { majorCode, cohorts, ...values } = parsed.data;
  const [before] = id ? await getPrograms(id) : [];
  if (id && !before) return actionError("Chương trình không còn trong danh mục, tải lại trang.");
  if (before && !inScope(viewer, before.faculty)) return actionError("Chương trình thuộc khoa khác, bạn chỉ sửa được chương trình của khoa mình.");
  const statusError = before ? programStatusChangeError(before.status, values.status) : null;
  if (statusError) return actionError(statusError, { status: statusError });
  let programId: string;
  try {
    programId = await db.transaction(async (tx) => {
      const [major] = await tx.select({ id: majors.id, faculty: faculties.name }).from(majors).innerJoin(faculties, eq(faculties.id, majors.facultyId)).where(eq(majors.code, majorCode));
      if (!major) throw new InputError("majorCode", "Ngành không có trong danh mục");
      if (!inScope(viewer, major.faculty)) throw new InputError("majorCode", "Bạn chỉ chọn được ngành thuộc khoa mình");
      if (values.status === "active") {
        const clash = await tx
          .selectDistinct({ name: programs.name, cohort: programCohorts.cohort })
          .from(programs)
          .innerJoin(programCohorts, eq(programCohorts.programId, programs.id))
          .where(and(eq(programs.majorId, major.id), eq(programs.status, "active"), inArray(programCohorts.cohort, cohorts), id ? ne(programs.id, id) : undefined));
        if (clash.length > 0) {
          throw new InputError("cohorts", `Khóa ${[...new Set(clash.map((row) => row.cohort))].join(", ")} đã có chương trình đang áp dụng (${clash[0].name}); chuyển chương trình đó sang ngừng áp dụng trước.`);
        }
      }
      const [row] = id
        ? await tx.update(programs).set({ ...values, majorId: major.id }).where(eq(programs.id, id)).returning({ id: programs.id })
        : await tx.insert(programs).values({ ...values, majorId: major.id }).returning({ id: programs.id });
      if (!row) throw new InputError("name", "Chương trình không còn trong danh mục, tải lại trang.");
      await tx.delete(programCohorts).where(eq(programCohorts.programId, row.id));
      await tx.insert(programCohorts).values(cohorts.map((cohort) => ({ programId: row.id, cohort })));
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: before ? "update" : "create",
        entityType: "program",
        entityId: row.id,
        entityLabel: values.name,
        summary: before ? "Sửa thông tin chương trình đào tạo" : "Thêm chương trình đào tạo",
        changes: before
          ? auditChanges([
              ["Mã ngành", before.code, values.code],
              ["Tên chương trình", before.name, values.name],
              ["Ngành", before.majorCode, majorCode],
              ["Văn bằng", before.degree, values.degree],
              ["Tổng tín chỉ", String(before.totalCredits), String(values.totalCredits)],
              ["Thời gian đào tạo", `${before.durationYears} năm`, `${values.durationYears} năm`],
              ["Khóa áp dụng", before.cohorts.join(", "), cohorts.join(", ")],
              ["Trạng thái", PROGRAM_STATUS[before.status].label, PROGRAM_STATUS[values.status].label],
            ])
          : [],
      });
      return row.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateCurriculum();
  const [program] = await getPrograms(programId);
  return program ? actionOk(program) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Thêm, bỏ, chuyển học kỳ một học phần trong khung; trả khung mới đọc lại từ DB.
export async function changeProgramCourses(programId: string, input: ProgramCourseChangeInput): Promise<ActionResult<ProgramDetail>> {
  const viewer = await requirePermission("curriculum.manage");
  if (!isUuid(programId)) return actionError("Chương trình không còn trong danh mục, tải lại trang.");
  const parsed = parseInput(PROGRAM_COURSE_CHANGE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  try {
    await db.transaction((tx) => applyProgramCourseChange(tx, { programId, change: parsed.data, actor: auditActorOf(viewer), faculty: viewer.faculty }));
  } catch (error) {
    return failure(error);
  }
  revalidateCurriculum();
  revalidatePath("/application/curriculum");
  const program = await getProgram(programId);
  return program ? actionOk(program) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Thêm (groupId null) hoặc sửa nhóm tự chọn của khung; trả khung mới đọc lại từ DB.
export async function saveProgramElectiveGroup(programId: string, groupId: string | null, input: ElectiveGroupInput): Promise<ActionResult<ProgramDetail>> {
  const viewer = await requirePermission("curriculum.manage");
  if (!isUuid(programId) || (groupId !== null && !isUuid(groupId))) return actionError("Chương trình hoặc nhóm không còn trong danh mục, tải lại trang.");
  const parsed = parseInput(ELECTIVE_GROUP_SCHEMA, input);
  if (!parsed.ok) return parsed;
  try {
    await db.transaction((tx) => saveElectiveGroup(tx, { programId, groupId, values: parsed.data, actor: auditActorOf(viewer), faculty: viewer.faculty }));
  } catch (error) {
    return failure(error);
  }
  revalidateCurriculum();
  revalidatePath("/application/curriculum");
  const program = await getProgram(programId);
  return program ? actionOk(program) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function deleteProgramElectiveGroup(programId: string, groupId: string): Promise<ActionResult<ProgramDetail>> {
  const viewer = await requirePermission("curriculum.manage");
  if (!isUuid(programId) || !isUuid(groupId)) return actionError("Chương trình hoặc nhóm không còn trong danh mục, tải lại trang.");
  try {
    await db.transaction((tx) => deleteElectiveGroup(tx, { programId, groupId, actor: auditActorOf(viewer), faculty: viewer.faculty }));
  } catch (error) {
    return failure(error);
  }
  revalidateCurriculum();
  revalidatePath("/application/curriculum");
  const program = await getProgram(programId);
  return program ? actionOk(program) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}
