import "server-only";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { notifyLecturers } from "@/modules/notifications/notifications.lib";
import {
  academicWarningOf,
  buildTranscript,
  computeStanding,
  isWarningTerm,
  latestWarningTerm,
  planComponentChanges,
  planWarningSync,
  type ComputedWarning,
  type TranscriptTermInput,
} from "@/modules/grades/grades.rule";
import { academicWarnings, courseResults, gradeComponents, gradeScores } from "@/modules/grades/grades.schema";
import type { LetterGrade } from "@/modules/grades/grades.type";
import { administrativeClasses, students } from "@/modules/users/users.schema";

// Lỗi nghiệp vụ phát hiện trong giao dịch: hủy giao dịch và trả câu báo cho người dùng.
export class GradeActionError extends Error {}

type Executor = Transaction | typeof db;

// Danh sách lớp (sinh viên đang học) dùng cho xuất và nhập tệp bảng điểm, xếp theo tên như danh sách lớp trên trang nhập điểm.
export async function sectionRoster(executor: Executor, classSectionId: string) {
  const rows = await executor
    .select({ studentId: students.id, code: students.code, fullName: students.fullName })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.classSectionId, classSectionId), eq(enrollments.status, "enrolled")));
  return rows
    .map((row) => ({ studentId: row.studentId, studentCode: formatStudentCode(row.code), fullName: row.fullName }))
    .toSorted((a, b) => a.fullName.split(" ").at(-1)!.localeCompare(b.fullName.split(" ").at(-1)!, "vi") || a.fullName.localeCompare(b.fullName, "vi"));
}

// Thay bộ cột điểm của một bảng điểm còn sửa được. Cột giữ lại giữ key nên điểm đã nhập còn nguyên; cột bỏ mất luôn điểm
// (nơi gọi phải xác nhận trước). Thứ tự cột có unique không hoãn được nên dời cột giữ ra xa trước rồi mới đặt vị trí cuối.
// Tổng trọng số kiểm ở trigger grade_components_weights_total_100 lúc commit.
export async function replaceGradeComponents(
  tx: Transaction,
  input: { gradeSheetId: string; components: { key: string | null; label: string; weight: number }[]; confirmDropScores: boolean },
) {
  const existing = await tx
    .select({ id: gradeComponents.id, key: gradeComponents.key, label: gradeComponents.label, weight: gradeComponents.weight, position: gradeComponents.position })
    .from(gradeComponents)
    .where(eq(gradeComponents.gradeSheetId, input.gradeSheetId))
    .orderBy(asc(gradeComponents.position));
  const plan = planComponentChanges(existing, input.components);
  if (plan.unknown.length > 0) throw new GradeActionError("Có cột điểm không còn trong bảng điểm, tải lại trang rồi sửa lại.");

  if (plan.removed.length > 0) {
    const scored = await tx
      .select({ id: gradeScores.gradeComponentId, total: sql<number>`count(*)::int` })
      .from(gradeScores)
      .where(inArray(gradeScores.gradeComponentId, plan.removed.map((component) => component.id)))
      .groupBy(gradeScores.gradeComponentId);
    if (scored.length > 0 && !input.confirmDropScores) {
      const labelOf = new Map(existing.map((component) => [component.id, component.label]));
      const detail = scored.map((row) => `${labelOf.get(row.id)} (${row.total} điểm)`).join(", ");
      throw new GradeActionError(`Cột ${detail} đã có điểm. Xác nhận xóa cột thì điểm của cột đó cũng bị xóa.`);
    }
    await tx.delete(gradeComponents).where(inArray(gradeComponents.id, plan.removed.map((component) => component.id)));
  }
  const offset = 100;
  for (const component of plan.kept) {
    await tx
      .update(gradeComponents)
      .set({ label: component.label, weight: component.weight, position: offset + component.position })
      .where(eq(gradeComponents.id, component.id));
  }
  if (plan.created.length > 0) {
    await tx.insert(gradeComponents).values(plan.created.map((component) => ({ ...component, gradeSheetId: input.gradeSheetId })));
  }
  for (const component of plan.kept) {
    await tx.update(gradeComponents).set({ position: component.position }).where(eq(gradeComponents.id, component.id));
  }
  const before = existing.map((component) => `${component.label} ${component.weight}%`).join(", ");
  const after = input.components.map((component) => `${component.label} ${component.weight}%`).join(", ");
  return { before, after, removed: plan.removed.length, created: plan.created.length };
}

export type WarningSyncResult = {
  termId: string;
  termName: string;
  students: number;
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
  handled: number;
  advisorsNotified: number;
};

// Tính cảnh báo học vụ sau một học kỳ đã kết thúc từ course_results (mọi kỳ đến hết học kỳ đó), cho sinh viên có kết quả
// trong học kỳ và chưa tốt nghiệp. Chạy lại được: unique (sinh viên, học kỳ) và khóa theo học kỳ để hai lần chạy cùng lúc
// không chen nhau; cảnh báo đã gửi thông báo hoặc đã gặp sinh viên giữ nguyên. Cố vấn nhận thông báo khi lớp có cảnh báo mới.
export async function syncAcademicWarnings(tx: Transaction, termId: string, options: { notify?: boolean; today?: string } = {}): Promise<WarningSyncResult> {
  const today = options.today ?? dayjs().format("YYYY-MM-DD");
  const [term] = await tx.select({ id: terms.id, name: terms.name, semester: terms.semester, startDate: terms.startDate, endDate: terms.endDate }).from(terms).where(eq(terms.id, termId));
  if (!term) throw new GradeActionError("Học kỳ không còn trong danh mục, tải lại trang.");
  if (!isWarningTerm(term, today)) {
    throw new GradeActionError(term.semester === 3 ? "Học kỳ hè không xét cảnh báo học vụ riêng." : `${term.name} chưa kết thúc nên chưa xét cảnh báo được.`);
  }
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`academic-warnings:${term.id}`}))`);

  const cohort = await tx
    .selectDistinct({ studentId: courseResults.studentId, className: administrativeClasses.code, advisorId: administrativeClasses.advisorId })
    .from(courseResults)
    .innerJoin(students, eq(students.id, courseResults.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(and(eq(courseResults.termId, term.id), ne(students.status, "graduated")));
  const ids = cohort.map((row) => row.studentId);

  const computed: ComputedWarning[] = [];
  if (ids.length > 0) {
    const rows = await tx
      .select({
        studentId: courseResults.studentId,
        termId: courseResults.termId,
        termName: terms.name,
        courseCode: courses.code,
        courseName: courses.name,
        credits: courses.credits,
        score10: courseResults.score10,
        letter: courseResults.letter,
        point4: courseResults.point4,
      })
      .from(courseResults)
      .innerJoin(courses, eq(courses.id, courseResults.courseId))
      .innerJoin(terms, eq(terms.id, courseResults.termId))
      .where(and(inArray(courseResults.studentId, ids), lte(terms.startDate, term.startDate)))
      .orderBy(asc(terms.startDate), asc(courseResults.recordedAt), asc(courses.code));
    const byStudent = new Map<string, Map<string, TranscriptTermInput>>();
    for (const { studentId, termId: rowTermId, termName, ...course } of rows) {
      const byTerm = byStudent.get(studentId) ?? new Map<string, TranscriptTermInput>();
      byStudent.set(studentId, byTerm);
      const entry = byTerm.get(rowTermId) ?? { termId: rowTermId, termName, isInProgress: false, courses: [] };
      byTerm.set(rowTermId, entry);
      entry.courses.push({ ...course, letter: course.letter as LetterGrade | null });
    }
    for (const id of ids) {
      const warning = academicWarningOf(computeStanding(id, buildTranscript([...(byStudent.get(id)?.values() ?? [])])));
      if (warning) computed.push({ ...warning, studentId: id });
    }
  }

  const stored = await tx
    .select({
      id: academicWarnings.id,
      studentId: academicWarnings.studentId,
      status: academicWarnings.status,
      level: academicWarnings.level,
      termGpa4: academicWarnings.termGpa4,
      cpa4: academicWarnings.cpa4,
      failedCredits: academicWarnings.failedCredits,
      reasons: academicWarnings.reasons,
    })
    .from(academicWarnings)
    .where(eq(academicWarnings.termId, term.id))
    .for("update");
  const plan = planWarningSync(stored, computed);

  const created =
    plan.create.length > 0
      ? await tx
          .insert(academicWarnings)
          .values(plan.create.map((warning) => ({ ...warning, termId: term.id })))
          .onConflictDoNothing({ target: [academicWarnings.studentId, academicWarnings.termId] })
          .returning({ studentId: academicWarnings.studentId, level: academicWarnings.level })
      : [];
  for (const { id, studentId: _studentId, ...warning } of plan.update) {
    await tx.update(academicWarnings).set(warning).where(and(eq(academicWarnings.id, id), eq(academicWarnings.status, "new")));
  }
  if (plan.remove.length > 0) {
    await tx.delete(academicWarnings).where(and(inArray(academicWarnings.id, plan.remove), eq(academicWarnings.status, "new")));
  }

  let advisorsNotified = 0;
  if (options.notify !== false && created.length > 0) {
    const classOf = new Map(cohort.map((row) => [row.studentId, row]));
    const byClass = new Map<string, { advisorId: string; levels: number[] }>();
    for (const warning of created) {
      const home = classOf.get(warning.studentId);
      if (!home?.advisorId) continue;
      const entry = byClass.get(home.className) ?? { advisorId: home.advisorId, levels: [] };
      entry.levels.push(warning.level);
      byClass.set(home.className, entry);
    }
    for (const [className, { advisorId, levels }] of byClass) {
      const counts = [3, 2, 1].map((level) => [level, levels.filter((value) => value === level).length] as const).filter(([, total]) => total > 0);
      const notified = await notifyLecturers(tx, [advisorId], {
        kind: "advising",
        title: `Lớp ${className} có ${levels.length} sinh viên bị cảnh báo học vụ ${term.name.toLowerCase()}`,
        body: `${counts.map(([level, total]) => `${total} sinh viên mức ${level}`).join(", ")}. Xem danh sách và gửi thông báo cho sinh viên ở mục Cảnh báo học vụ.`,
        href: "/lecturer/advising/academic-warnings",
      });
      advisorsNotified += notified.length;
    }
  }

  return {
    termId: term.id,
    termName: term.name,
    students: ids.length,
    created: created.length,
    updated: plan.update.length,
    removed: plan.remove.length,
    unchanged: plan.unchanged,
    handled: plan.handled,
    advisorsNotified,
  };
}

// Tác vụ định kỳ: xét cảnh báo cho học kỳ chính vừa kết thúc. Gọi nhiều lần trong ngày cũng không sinh trùng.
export async function runAcademicWarningsJob(): Promise<Record<string, number>> {
  const today = dayjs().format("YYYY-MM-DD");
  const term = latestWarningTerm(await db.select({ id: terms.id, semester: terms.semester, endDate: terms.endDate }).from(terms), today);
  if (!term) return { students: 0, created: 0, updated: 0, removed: 0, unchanged: 0, handled: 0, advisorsNotified: 0 };
  const { termId: _termId, termName: _termName, ...counts } = await db.transaction((tx) => syncAcademicWarnings(tx, term.id, { today }));
  return counts;
}
