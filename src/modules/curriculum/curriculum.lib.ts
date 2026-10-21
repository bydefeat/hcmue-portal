import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { db, Transaction } from "@/shared/libs/db.lib";
import { inScope } from "@/modules/access/access.constant";
import { recordAudit, type AuditActor } from "@/modules/audit/audit.lib";
import {
  electiveGroupError,
  frameworkChangeError,
  isProgramEditable,
  programSemesterLimit,
  type ElectiveRequirement,
} from "@/modules/curriculum/curriculum.rule";
import { courseRelations, courses, faculties, majors, programCohorts, programCourses, programElectiveGroups, programs } from "@/modules/curriculum/curriculum.schema";
import type { ElectiveGroupFormValues, ProgramCourseChange } from "@/modules/curriculum/curriculum.type";

type Executor = Transaction | typeof db;

export type StudentProgram = { id: string; code: string; name: string; degree: string; totalCredits: number; durationYears: number; majorId: string };

const programKey = (majorId: string, cohort: number) => `${majorId}:${cohort}`;

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

async function equivalentsByCode(executor: Executor) {
  const rows = await executor
    .select({ code: courses.code, equivalent: equivalentCourses.code })
    .from(courseRelations)
    .innerJoin(courses, eq(courses.id, courseRelations.courseId))
    .innerJoin(equivalentCourses, eq(equivalentCourses.id, courseRelations.relatedCourseId))
    .where(eq(courseRelations.kind, "equivalent"));
  const equivalentsOf = new Map<string, string[]>();
  for (const row of rows) equivalentsOf.set(row.code, [...(equivalentsOf.get(row.code) ?? []), row.equivalent]);
  return equivalentsOf;
}

async function frameworkCoursesOf(executor: Executor, programIds: string[], kind: "required" | "conditional"): Promise<Map<string, ProgramRequirement[]>> {
  const ids = [...new Set(programIds)];
  if (ids.length === 0) return new Map();
  const [rows, equivalentsOf] = await Promise.all([
    executor
      .select({ programId: programCourses.programId, code: courses.code, name: courses.name, credits: courses.credits })
      .from(programCourses)
      .innerJoin(courses, eq(courses.id, programCourses.courseId))
      .where(
        and(
          inArray(programCourses.programId, ids),
          kind === "conditional" ? eq(courses.isConditional, true) : and(eq(courses.type, "required"), eq(courses.isConditional, false)),
        ),
      ),
    equivalentsByCode(executor),
  ]);
  const result = new Map<string, ProgramRequirement[]>();
  for (const { programId, ...course } of rows.toSorted((a, b) => a.code.localeCompare(b.code))) {
    result.set(programId, [...(result.get(programId) ?? []), { ...course, equivalentCodes: equivalentsOf.get(course.code) ?? [] }]);
  }
  return result;
}

export function requiredCoursesOf(executor: Executor, programIds: string[]): Promise<Map<string, ProgramRequirement[]>> {
  return frameworkCoursesOf(executor, programIds, "required");
}

export function conditionalCoursesOf(executor: Executor, programIds: string[]): Promise<Map<string, ProgramRequirement[]>> {
  return frameworkCoursesOf(executor, programIds, "conditional");
}

export async function electiveGroupsOf(executor: Executor, programIds: string[]): Promise<Map<string, ElectiveRequirement[]>> {
  const ids = [...new Set(programIds)];
  if (ids.length === 0) return new Map();
  const [groups, members, equivalentsOf] = await Promise.all([
    executor
      .select({ id: programElectiveGroups.id, programId: programElectiveGroups.programId, name: programElectiveGroups.name, minCredits: programElectiveGroups.minCredits })
      .from(programElectiveGroups)
      .where(inArray(programElectiveGroups.programId, ids)),
    executor
      .select({ groupId: programCourses.electiveGroupId, code: courses.code, name: courses.name, credits: courses.credits })
      .from(programCourses)
      .innerJoin(courses, eq(courses.id, programCourses.courseId))
      .where(and(inArray(programCourses.programId, ids), isNotNull(programCourses.electiveGroupId))),
    equivalentsByCode(executor),
  ]);
  const result = new Map<string, ElectiveRequirement[]>();
  for (const group of groups.toSorted((a, b) => a.name.localeCompare(b.name, "vi"))) {
    const courseList = members
      .filter((member) => member.groupId === group.id)
      .map(({ groupId: _groupId, ...course }) => ({ ...course, equivalentCodes: equivalentsOf.get(course.code) ?? [] }))
      .toSorted((a, b) => a.code.localeCompare(b.code));
    result.set(group.programId, [...(result.get(group.programId) ?? []), { id: group.id, name: group.name, minCredits: group.minCredits, courses: courseList }]);
  }
  return result;
}

export class FrameworkError extends Error {}

function changeSummary(change: ProgramCourseChange, from: number | undefined) {
  if (change.kind === "add") return `Thêm ${change.courseCodes.join(", ")} vào học kỳ ${change.semester}`;
  if (change.kind === "remove") return `Bỏ ${change.courseCode} khỏi khung (học kỳ ${from})`;
  return `Chuyển ${change.courseCode} từ học kỳ ${from} sang học kỳ ${change.semester}`;
}

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

async function lockEditableProgram(tx: Transaction, programId: string, faculty: string | null) {
  const [program] = await tx
    .select({ id: programs.id, name: programs.name, status: programs.status, faculty: faculties.name })
    .from(programs)
    .innerJoin(majors, eq(majors.id, programs.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(programs.id, programId))
    .for("update", { of: programs });
  if (!program) throw new FrameworkError("Chương trình không còn trong danh mục, tải lại trang.");
  if (!inScope({ faculty }, program.faculty)) throw new FrameworkError("Chương trình thuộc khoa khác, bạn chỉ sửa được khung của khoa mình.");
  if (!isProgramEditable(program.status)) throw new FrameworkError("Chương trình đã ngừng áp dụng nên khung chỉ xem được.");
  return program;
}

const codeList = (codes: string[]) => (codes.length > 0 ? codes.toSorted().join(", ") : "Không có");

export async function saveElectiveGroup(
  tx: Transaction,
  input: { programId: string; groupId: string | null; values: ElectiveGroupFormValues; actor: AuditActor; faculty: string | null },
) {
  const program = await lockEditableProgram(tx, input.programId, input.faculty);
  const [plan, groups] = await Promise.all([
    tx
      .select({ courseCode: courses.code, groupId: programCourses.electiveGroupId, courseId: courses.id, type: courses.type, isConditional: courses.isConditional })
      .from(programCourses)
      .innerJoin(courses, eq(courses.id, programCourses.courseId))
      .where(eq(programCourses.programId, input.programId)),
    tx
      .select({ id: programElectiveGroups.id, name: programElectiveGroups.name, minCredits: programElectiveGroups.minCredits })
      .from(programElectiveGroups)
      .where(eq(programElectiveGroups.programId, input.programId)),
  ]);
  const before = input.groupId ? groups.find((group) => group.id === input.groupId) : undefined;
  if (input.groupId && !before) throw new FrameworkError("Nhóm tự chọn không còn trong chương trình, tải lại trang.");
  const catalog = new Map(plan.map((entry) => [entry.courseCode, { code: entry.courseCode, type: entry.type, isConditional: entry.isConditional }]));
  const error = electiveGroupError(plan, { groupId: input.groupId, courseCodes: input.values.courseCodes }, catalog, new Map(groups.map((group) => [group.id, group.name])));
  if (error) throw new FrameworkError(error);

  const [row] = input.groupId
    ? await tx
        .update(programElectiveGroups)
        .set({ name: input.values.name, minCredits: input.values.minCredits })
        .where(eq(programElectiveGroups.id, input.groupId))
        .returning({ id: programElectiveGroups.id })
    : await tx
        .insert(programElectiveGroups)
        .values({ programId: input.programId, name: input.values.name, minCredits: input.values.minCredits })
        .returning({ id: programElectiveGroups.id });
  const previousCodes = plan.filter((entry) => entry.groupId === row.id).map((entry) => entry.courseCode);
  const wanted = new Set(input.values.courseCodes);
  const removed = plan.filter((entry) => entry.groupId === row.id && !wanted.has(entry.courseCode)).map((entry) => entry.courseId);
  const added = plan.filter((entry) => wanted.has(entry.courseCode) && entry.groupId !== row.id).map((entry) => entry.courseId);
  if (removed.length > 0) {
    await tx.update(programCourses).set({ electiveGroupId: null }).where(and(eq(programCourses.programId, input.programId), inArray(programCourses.courseId, removed)));
  }
  if (added.length > 0) {
    await tx.update(programCourses).set({ electiveGroupId: row.id }).where(and(eq(programCourses.programId, input.programId), inArray(programCourses.courseId, added)));
  }
  await tx.update(programs).set({ updatedAt: new Date() }).where(eq(programs.id, input.programId));
  await recordAudit(tx, {
    actor: input.actor,
    action: before ? "update" : "create",
    entityType: "program",
    entityId: input.programId,
    entityLabel: program.name,
    summary: before ? `Sửa nhóm tự chọn "${input.values.name}"` : `Thêm nhóm tự chọn "${input.values.name}"`,
    changes: [
      { field: "Tên nhóm", before: before?.name ?? "", after: input.values.name },
      { field: "Tín chỉ tối thiểu", before: before ? String(before.minCredits) : "", after: String(input.values.minCredits) },
      { field: "Học phần", before: before ? codeList(previousCodes) : "", after: codeList(input.values.courseCodes) },
    ].filter((change) => change.before !== change.after),
  });
  return row.id;
}

export async function deleteElectiveGroup(tx: Transaction, input: { programId: string; groupId: string; actor: AuditActor; faculty: string | null }) {
  const program = await lockEditableProgram(tx, input.programId, input.faculty);
  const [group] = await tx
    .select({ name: programElectiveGroups.name, minCredits: programElectiveGroups.minCredits })
    .from(programElectiveGroups)
    .where(and(eq(programElectiveGroups.id, input.groupId), eq(programElectiveGroups.programId, input.programId)));
  if (!group) throw new FrameworkError("Nhóm tự chọn không còn trong chương trình, tải lại trang.");
  await tx.update(programCourses).set({ electiveGroupId: null }).where(eq(programCourses.electiveGroupId, input.groupId));
  await tx.delete(programElectiveGroups).where(eq(programElectiveGroups.id, input.groupId));
  await tx.update(programs).set({ updatedAt: new Date() }).where(eq(programs.id, input.programId));
  await recordAudit(tx, {
    actor: input.actor,
    action: "delete",
    entityType: "program",
    entityId: input.programId,
    entityLabel: program.name,
    summary: `Xóa nhóm tự chọn "${group.name}" (tối thiểu ${group.minCredits} tín chỉ)`,
  });
}
