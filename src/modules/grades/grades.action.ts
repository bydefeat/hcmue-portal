"use server";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { requireSession } from "@/modules/authentication/authentication.query";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { DEFAULT_COMPONENTS, DEFAULT_DEADLINE_DAYS, GRADES_CONSTRAINT_MESSAGE, weightedScore } from "@/modules/grades/grades.constant";
import {
  courseGrade,
  GRADE_SCORES_SAVE_SCHEMA,
  GRADE_SHEET_RETURN_SCHEMA,
  GRADE_SHEET_SCHEMA,
  GRADE_SHEETS_SCHEMA,
  NEXT_WARNING_STATUS,
  WARNING_ADVANCE_SCHEMA,
  type GradeScoresSaveInput,
  type GradeSheetReturnInput,
} from "@/modules/grades/grades.rule";
import { academicWarnings, courseResults, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import type { GradeSheetStatus, WarningStatus } from "@/modules/grades/grades.type";
import { getCurrentLecturer } from "@/modules/users/users.query";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";

// Lỗi nghiệp vụ phát hiện trong giao dịch: hủy giao dịch và trả câu báo cho người dùng.
class GradeActionError extends Error {}

function failure(error: unknown) {
  if (error instanceof GradeActionError) return actionError(error.message);
  return actionFailure(error, GRADES_CONSTRAINT_MESSAGE);
}

const EDITABLE: GradeSheetStatus[] = ["draft", "returned"];

function revalidateGrades() {
  revalidatePath("/lecturer", "layout");
  revalidatePath("/administrator/grade-publishing");
}

// Giảng viên chỉ thao tác trên bảng điểm lớp mình dạy.
async function requireOwnSection(lecturerId: string, classSectionId: string) {
  const [section] = await db
    .select({ id: classSections.id, lecturerId: classSections.lecturerId, termEnd: terms.endDate })
    .from(classSections)
    .innerJoin(terms, eq(terms.id, classSections.termId))
    .where(eq(classSections.id, classSectionId));
  if (!section || section.lecturerId !== lecturerId) forbidden();
  return section;
}

// Khóa dòng bảng điểm trong giao dịch để lưu điểm và chốt điểm không chen nhau. Lớp chưa có bảng điểm thì tạo với cột mặc định.
async function lockSheet(tx: Transaction, section: { id: string; termEnd: string }) {
  const [existing] = await tx.select().from(gradeSheets).where(eq(gradeSheets.classSectionId, section.id)).for("update");
  if (existing) return existing;
  const deadline = dayjs(section.termEnd).add(DEFAULT_DEADLINE_DAYS, "day").hour(23).minute(59).toDate();
  const [created] = await tx.insert(gradeSheets).values({ classSectionId: section.id, deadline }).returning();
  await tx.insert(gradeComponents).values(DEFAULT_COMPONENTS.map((component, index) => ({ ...component, gradeSheetId: created.id, position: index + 1 })));
  return created;
}

export async function saveGradeScores(input: GradeScoresSaveInput): Promise<ActionResult<{ savedAt: string }>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(GRADE_SCORES_SAVE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const section = await requireOwnSection(lecturer.id, parsed.data.classSectionId);
  try {
    const savedAt = await db.transaction(async (tx) => {
      const sheet = await lockSheet(tx, section);
      if (!EDITABLE.includes(sheet.status)) throw new GradeActionError("Bảng điểm đã chốt, không sửa được nữa. Tải lại trang để xem trạng thái mới.");
      const [components, roster] = await Promise.all([
        tx.select({ id: gradeComponents.id, key: gradeComponents.key }).from(gradeComponents).where(eq(gradeComponents.gradeSheetId, sheet.id)),
        tx
          .select({ id: enrollments.id, studentId: enrollments.studentId })
          .from(enrollments)
          .where(and(eq(enrollments.classSectionId, section.id), eq(enrollments.status, "enrolled"))),
      ]);
      const componentOf = new Map(components.map((row) => [row.key, row.id]));
      const enrollmentOf = new Map(roster.map((row) => [row.studentId, row.id]));
      const cells = parsed.data.changes.map((change) => {
        const gradeComponentId = componentOf.get(change.key);
        const enrollmentId = enrollmentOf.get(change.studentId);
        if (!gradeComponentId) throw new GradeActionError("Cột điểm không còn trong bảng điểm, tải lại trang.");
        if (!enrollmentId) throw new GradeActionError("Có sinh viên không còn trong danh sách lớp, tải lại trang.");
        return { gradeComponentId, enrollmentId, score: change.score };
      });
      const filled = cells.filter((cell) => cell.score !== null).map((cell) => ({ ...cell, score: cell.score as number }));
      const cleared = cells.filter((cell) => cell.score === null);
      if (filled.length > 0) {
        await tx
          .insert(gradeScores)
          .values(filled)
          .onConflictDoUpdate({ target: [gradeScores.gradeComponentId, gradeScores.enrollmentId], set: { score: sql`excluded.score`, updatedAt: sql`now()` } });
      }
      if (cleared.length > 0) {
        await tx
          .delete(gradeScores)
          .where(or(...cleared.map((cell) => and(eq(gradeScores.gradeComponentId, cell.gradeComponentId), eq(gradeScores.enrollmentId, cell.enrollmentId)))));
      }
      const [row] = await tx.update(gradeSheets).set({ savedAt: new Date() }).where(eq(gradeSheets.id, sheet.id)).returning({ savedAt: gradeSheets.savedAt });
      return row.savedAt!.toISOString();
    });
    revalidatePath("/lecturer", "layout");
    return actionOk({ savedAt });
  } catch (error) {
    return failure(error);
  }
}

export async function lockGradeSheet(classSectionId: string): Promise<ActionResult<{ status: GradeSheetStatus; lockedAt: string }>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(GRADE_SHEET_SCHEMA, { classSectionId });
  if (!parsed.ok) return parsed;
  const section = await requireOwnSection(lecturer.id, parsed.data.classSectionId);
  try {
    const result = await db.transaction(async (tx) => {
      const sheet = await lockSheet(tx, section);
      if (!EDITABLE.includes(sheet.status)) throw new GradeActionError("Bảng điểm đã chốt trước đó.");
      const [[{ columns }], [{ students: enrolled }], [{ filled }]] = await Promise.all([
        tx.select({ columns: sql<number>`count(*)::int` }).from(gradeComponents).where(eq(gradeComponents.gradeSheetId, sheet.id)),
        tx
          .select({ students: sql<number>`count(*)::int` })
          .from(enrollments)
          .where(and(eq(enrollments.classSectionId, section.id), eq(enrollments.status, "enrolled"))),
        tx
          .select({ filled: sql<number>`count(*)::int` })
          .from(gradeScores)
          .innerJoin(gradeComponents, eq(gradeComponents.id, gradeScores.gradeComponentId))
          .innerJoin(enrollments, and(eq(enrollments.id, gradeScores.enrollmentId), eq(enrollments.status, "enrolled")))
          .where(eq(gradeComponents.gradeSheetId, sheet.id)),
      ]);
      if (enrolled === 0) throw new GradeActionError("Lớp chưa có sinh viên nên chưa chốt được.");
      const missing = columns * enrolled - filled;
      if (missing > 0) throw new GradeActionError(`Còn ${missing} điểm chưa nhập nên chưa chốt được. Nhập đủ điểm rồi chốt lại.`);
      const [row] = await tx
        .update(gradeSheets)
        .set({ status: "locked", lockedAt: new Date() })
        .where(eq(gradeSheets.id, sheet.id))
        .returning({ status: gradeSheets.status, lockedAt: gradeSheets.lockedAt });
      return { status: row.status, lockedAt: row.lockedAt!.toISOString() };
    });
    revalidateGrades();
    return actionOk(result);
  } catch (error) {
    return failure(error);
  }
}

// Bảng điểm cùng khoa của học phần, khóa dòng để duyệt, trả lại, công bố không chen nhau.
async function sheetsInScope(tx: Transaction, classSectionIds: string[], faculty: string | null, status: GradeSheetStatus) {
  const rows = await tx
    .select({ id: gradeSheets.id, classSectionId: gradeSheets.classSectionId, status: gradeSheets.status, faculty: faculties.name })
    .from(gradeSheets)
    .innerJoin(classSections, eq(classSections.id, gradeSheets.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(inArray(gradeSheets.classSectionId, classSectionIds))
    .for("update", { of: gradeSheets });
  return rows.filter((row) => row.status === status && inScope({ faculty }, row.faculty));
}

export async function approveGradeSheets(classSectionIds: string[]): Promise<ActionResult<{ classSectionIds: string[] }>> {
  const viewer = await requirePermission("grades.approve");
  const parsed = parseInput(GRADE_SHEETS_SCHEMA, { classSectionIds });
  if (!parsed.ok) return parsed;
  try {
    const approved = await db.transaction(async (tx) => {
      const sheets = await sheetsInScope(tx, parsed.data.classSectionIds, viewer.faculty, "locked");
      if (sheets.length === 0) throw new GradeActionError("Không có bảng điểm nào đang chờ duyệt trong các lớp đã chọn, tải lại trang.");
      const rows = await tx
        .update(gradeSheets)
        .set({ status: "approved", approvedAt: new Date(), approvedByUserId: viewer.id })
        .where(inArray(gradeSheets.id, sheets.map((sheet) => sheet.id)))
        .returning({ classSectionId: gradeSheets.classSectionId });
      return rows.map((row) => row.classSectionId);
    });
    revalidateGrades();
    return actionOk({ classSectionIds: approved });
  } catch (error) {
    return failure(error);
  }
}

export async function returnGradeSheet(input: GradeSheetReturnInput): Promise<ActionResult<{ classSectionId: string; returnReason: string }>> {
  const viewer = await requirePermission("grades.approve");
  const parsed = parseInput(GRADE_SHEET_RETURN_SCHEMA, input);
  if (!parsed.ok) return parsed;
  try {
    const result = await db.transaction(async (tx) => {
      const [sheet] = await sheetsInScope(tx, [parsed.data.classSectionId], viewer.faculty, "locked");
      if (!sheet) throw new GradeActionError("Bảng điểm không còn ở trạng thái chờ khoa duyệt, tải lại trang.");
      const [row] = await tx
        .update(gradeSheets)
        .set({ status: "returned", returnReason: parsed.data.reason })
        .where(eq(gradeSheets.id, sheet.id))
        .returning({ classSectionId: gradeSheets.classSectionId, returnReason: gradeSheets.returnReason });
      return { classSectionId: row.classSectionId, returnReason: row.returnReason! };
    });
    revalidateGrades();
    return actionOk(result);
  } catch (error) {
    return failure(error);
  }
}

// Công bố: điểm tổng kết từng sinh viên ghi vào course_results, nguồn của bảng điểm, GPA và CPA.
export async function publishGradeSheets(classSectionIds: string[]): Promise<ActionResult<{ classSectionIds: string[] }>> {
  const viewer = await requirePermission("grades.publish");
  const parsed = parseInput(GRADE_SHEETS_SCHEMA, { classSectionIds });
  if (!parsed.ok) return parsed;
  try {
    const published = await db.transaction(async (tx) => {
      const sheets = await sheetsInScope(tx, parsed.data.classSectionIds, viewer.faculty, "approved");
      if (sheets.length === 0) throw new GradeActionError("Không có bảng điểm nào đã được khoa duyệt trong các lớp đã chọn, tải lại trang.");
      const sheetIds = sheets.map((sheet) => sheet.id);
      const [components, roster, scores] = await Promise.all([
        tx.select().from(gradeComponents).where(inArray(gradeComponents.gradeSheetId, sheetIds)),
        tx
          .select({ id: enrollments.id, studentId: enrollments.studentId, courseId: enrollments.courseId, termId: enrollments.termId, classSectionId: enrollments.classSectionId })
          .from(enrollments)
          .where(and(inArray(enrollments.classSectionId, sheets.map((sheet) => sheet.classSectionId)), eq(enrollments.status, "enrolled"))),
        tx
          .select({ componentId: gradeScores.gradeComponentId, enrollmentId: gradeScores.enrollmentId, score: gradeScores.score })
          .from(gradeScores)
          .innerJoin(gradeComponents, eq(gradeComponents.id, gradeScores.gradeComponentId))
          .where(inArray(gradeComponents.gradeSheetId, sheetIds)),
      ]);
      const scoreOf = new Map(scores.map((row) => [`${row.componentId}:${row.enrollmentId}`, row.score]));
      const recordedAt = new Date();
      const results = sheets.flatMap((sheet) => {
        const columns = components.filter((component) => component.gradeSheetId === sheet.id);
        return roster
          .filter((entry) => entry.classSectionId === sheet.classSectionId)
          .map((entry) => {
            const row = Object.fromEntries(columns.map((column) => [column.key, scoreOf.get(`${column.id}:${entry.id}`) ?? null]));
            const total = weightedScore(columns, row);
            if (total === null) throw new GradeActionError("Có bảng điểm còn ô trống, trả lại cho giảng viên nhập đủ trước khi công bố.");
            return { studentId: entry.studentId, courseId: entry.courseId, termId: entry.termId, enrollmentId: entry.id, source: "class" as const, ...courseGrade(total), recordedAt };
          });
      });
      if (results.length > 0) {
        await tx
          .insert(courseResults)
          .values(results)
          .onConflictDoUpdate({
            target: courseResults.enrollmentId,
            set: { score10: sql`excluded.score10`, letter: sql`excluded.letter`, point4: sql`excluded.point4`, recordedAt: sql`excluded.recorded_at` },
          });
      }
      const rows = await tx
        .update(gradeSheets)
        .set({ status: "published", publishedAt: recordedAt, publishedByUserId: viewer.id })
        .where(inArray(gradeSheets.id, sheetIds))
        .returning({ classSectionId: gradeSheets.classSectionId });
      return rows.map((row) => row.classSectionId);
    });
    revalidateGrades();
    revalidatePath("/application", "layout");
    return actionOk({ classSectionIds: published });
  } catch (error) {
    return failure(error);
  }
}

// Cố vấn xử lý cảnh báo của sinh viên lớp mình; Phòng Đào tạo, khoa xử lý trong phạm vi được phân quyền.
export async function advanceAcademicWarning(id: string, from: WarningStatus): Promise<ActionResult<{ id: string; status: WarningStatus }>> {
  const session = await requireSession();
  const parsed = parseInput(WARNING_ADVANCE_SCHEMA, { id, from });
  if (!parsed.ok) return parsed;
  const [warning] = await db
    .select({ id: academicWarnings.id, advisorId: administrativeClasses.advisorId, faculty: faculties.name })
    .from(academicWarnings)
    .innerJoin(students, eq(students.id, academicWarnings.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(academicWarnings.id, parsed.data.id));
  if (!warning) return actionError("Cảnh báo không còn trong danh sách, tải lại trang.");
  const [lecturer] = session.roles.includes("lecturer")
    ? await db.select({ id: lecturers.id }).from(lecturers).where(eq(lecturers.userId, session.user.id))
    : [];
  if (!lecturer || lecturer.id !== warning.advisorId) {
    const viewer = await requirePermission("reports.view");
    if (!inScope(viewer, warning.faculty)) forbidden();
  }
  const next = NEXT_WARNING_STATUS[parsed.data.from]!;
  try {
    const [row] = await db
      .update(academicWarnings)
      .set({ status: next })
      .where(and(eq(academicWarnings.id, warning.id), eq(academicWarnings.status, parsed.data.from)))
      .returning({ id: academicWarnings.id, status: academicWarnings.status });
    if (!row) return actionError("Cảnh báo đã được xử lý ở bước này, tải lại trang để xem trạng thái mới.");
    revalidatePath("/lecturer", "layout");
    revalidatePath("/administrator/reports/academic-warnings");
    revalidatePath("/administrator");
    return actionOk(row);
  } catch (error) {
    return failure(error);
  }
}
