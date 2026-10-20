import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { db, Transaction } from "@/shared/libs/db.lib";
import { inScope } from "@/modules/access/access.constant";
import { recordAudit, type AuditActor } from "@/modules/audit/audit.lib";
import { frameworkChangeError, isProgramEditable, programSemesterLimit } from "@/modules/curriculum/curriculum.rule";
import { courseRelations, courses, faculties, majors, programCohorts, programCourses, programs } from "@/modules/curriculum/curriculum.schema";
import type { ProgramCourseChange } from "@/modules/curriculum/curriculum.type";

type Executor = Transaction | typeof db;

export type StudentProgram = { id: string; code: string; name: string; degree: string; totalCredits: number; durationYears: number; majorId: string };

const programKey = (majorId: string, cohort: number) => `${majorId}:${cohort}`;

// Chương trình đào tạo áp dụng cho sinh viên: chương trình đang áp dụng (active) của đúng ngành có khóa của sinh viên trong
// program_cohorts. Mỗi ngành, khóa chỉ có một chương trình đang áp dụng (trigger programs_single_active_cohort). Một nguồn cho
// xét tốt nghiệp, kế hoạch học tập và các trang của sinh viên.
export async function programsOf(executor: Executor, students: { majorId: string; cohort: number }[]): Promise<Map<string, StudentProgram>> {
  const majorIds = [...new Set(students.map((student) => student.majorId))];
  if (majorIds.length === 0) return new Map();
  const rows = await executor
    .select({
      id: programs.id,
      code: programs.code,
      name: programs.name,
      degree: programs.degree,
      totalCredits: programs.totalCredits,
      durationYears: programs.durationYears,
      majorId: programs.majorId,
      cohort: programCohorts.cohort,
    })
    .from(programs)
    .innerJoin(programCohorts, eq(programCohorts.programId, programs.id))
    .where(and(eq(programs.status, "active"), inArray(programs.majorId, majorIds)));
  return new Map(rows.map(({ cohort, ...program }) => [programKey(program.majorId, cohort), program]));
}

export function programFor(map: Map<string, StudentProgram>, student: { majorId: string; cohort: number }) {
  return map.get(programKey(student.majorId, student.cohort)) ?? null;
}

export type ProgramRequirement = { code: string; name: string; credits: number; equivalentCodes: string[] };

const equivalentCourses = alias(courses, "equivalent_courses");

// Học phần bắt buộc trong khung của từng chương trình, kèm học phần tương đương (học đạt học phần tương đương cũng được tính).
export async function requiredCoursesOf(executor: Executor, programIds: string[]): Promise<Map<string, ProgramRequirement[]>> {
  const ids = [...new Set(programIds)];
  if (ids.length === 0) return new Map();
  const [rows, equivalents] = await Promise.all([
    executor
      .select({ programId: programCourses.programId, code: courses.code, name: courses.name, credits: courses.credits })
      .from(programCourses)
      .innerJoin(courses, eq(courses.id, programCourses.courseId))
      .where(and(inArray(programCourses.programId, ids), eq(courses.type, "required"))),
    executor
      .select({ code: courses.code, equivalent: equivalentCourses.code })
      .from(courseRelations)
      .innerJoin(courses, eq(courses.id, courseRelations.courseId))
      .innerJoin(equivalentCourses, eq(equivalentCourses.id, courseRelations.relatedCourseId))
      .where(eq(courseRelations.kind, "equivalent")),
  ]);
  const equivalentsOf = new Map<string, string[]>();
  for (const row of equivalents) equivalentsOf.set(row.code, [...(equivalentsOf.get(row.code) ?? []), row.equivalent]);
  const result = new Map<string, ProgramRequirement[]>();
  for (const { programId, ...course } of rows.toSorted((a, b) => a.code.localeCompare(b.code))) {
    result.set(programId, [...(result.get(programId) ?? []), { ...course, equivalentCodes: equivalentsOf.get(course.code) ?? [] }]);
  }
  return result;
}

// Lỗi nghiệp vụ khi sửa khung: hủy giao dịch, câu báo đưa thẳng cho người dùng.
export class FrameworkError extends Error {}

function changeSummary(change: ProgramCourseChange, from: number | undefined) {
  if (change.kind === "add") return `Thêm ${change.courseCodes.join(", ")} vào học kỳ ${change.semester}`;
  if (change.kind === "remove") return `Bỏ ${change.courseCode} khỏi khung (học kỳ ${from})`;
  return `Chuyển ${change.courseCode} từ học kỳ ${from} sang học kỳ ${change.semester}`;
}

// Sửa khung chương trình trong giao dịch của nơi gọi: khóa dòng chương trình để hai người sửa cùng lúc không chen nhau,
// kiểm lại trạng thái, phạm vi khoa và ràng buộc với dữ liệu mới nhất, ghi nhật ký cùng giao dịch.
export async function applyProgramCourseChange(
  tx: Transaction,
  input: { programId: string; change: ProgramCourseChange; actor: AuditActor; faculty: string | null },
) {
  const { programId, change } = input;
  const [program] = await tx
    .select({ id: programs.id, name: programs.name, status: programs.status, durationYears: programs.durationYears, faculty: faculties.name })
    .from(programs)
    .innerJoin(majors, eq(majors.id, programs.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(programs.id, programId))
    .for("update", { of: programs });
  if (!program) throw new FrameworkError("Chương trình không còn trong danh mục, tải lại trang.");
  if (!inScope({ faculty: input.faculty }, program.faculty)) throw new FrameworkError("Chương trình thuộc khoa khác, bạn chỉ sửa được khung của khoa mình.");
  if (!isProgramEditable(program.status)) throw new FrameworkError("Chương trình đã ngừng áp dụng nên khung chỉ xem được.");

  const codes = change.kind === "add" ? change.courseCodes : [change.courseCode];
  const [plan, catalogRows] = await Promise.all([
    tx
      .select({ courseCode: courses.code, semester: programCourses.semester })
      .from(programCourses)
      .innerJoin(courses, eq(courses.id, programCourses.courseId))
      .where(eq(programCourses.programId, programId)),
    tx.select({ id: courses.id, code: courses.code, isActive: courses.isActive }).from(courses).where(inArray(courses.code, codes)),
  ]);
  const catalog = new Map(catalogRows.map((row) => [row.code, row]));
  const error = frameworkChangeError(plan, change, catalog, programSemesterLimit(program.durationYears));
  if (error) throw new FrameworkError(error);
  const from = change.kind === "add" ? undefined : plan.find((entry) => entry.courseCode === change.courseCode)?.semester;

  if (change.kind === "add") {
    await tx.insert(programCourses).values(change.courseCodes.map((code) => ({ programId, courseId: catalog.get(code)!.id, semester: change.semester })));
  } else {
    const where = and(eq(programCourses.programId, programId), eq(programCourses.courseId, catalog.get(change.courseCode)!.id));
    if (change.kind === "remove") await tx.delete(programCourses).where(where);
    else await tx.update(programCourses).set({ semester: change.semester }).where(where);
  }
  await tx.update(programs).set({ updatedAt: new Date() }).where(eq(programs.id, programId));

  const summary = changeSummary(change, from);
  await recordAudit(tx, {
    actor: input.actor,
    action: "update",
    entityType: "program",
    entityId: programId,
    entityLabel: program.name,
    summary,
    changes: codes.map((code) => ({
      field: code,
      before: from === undefined ? "" : `Học kỳ ${from}`,
      after: change.kind === "remove" ? "" : `Học kỳ ${change.semester}`,
    })),
  });
  return { summary };
}
