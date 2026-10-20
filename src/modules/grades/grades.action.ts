"use server";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { PDF_MIME } from "@/shared/libs/pdf.lib";
import { bytesToBase64 } from "@/shared/libs/spreadsheet.lib";
import { can, inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { notifyLecturers, notifyStudents } from "@/modules/notifications/notifications.lib";
import { DEFAULT_COMPONENTS, DEFAULT_DEADLINE_DAYS, GRADE_SHEET_STATE, GRADES_CONSTRAINT_MESSAGE, weightedScore } from "@/modules/grades/grades.constant";
import { gradeSheetWorkbook, readWorkbookMatrix, XLSX_MIME } from "@/modules/grades/grades.excel";
import { GradeActionError, replaceGradeComponents, sectionRoster, syncAcademicWarnings, type WarningSyncResult } from "@/modules/grades/grades.lib";
import { gradeSheetPdf, transcriptPdf } from "@/modules/grades/grades.pdf";
import { getGradeSheet, getStudentStandings, getTranscript } from "@/modules/grades/grades.query";
import {
  ACADEMIC_WARNING_GENERATE_SCHEMA,
  courseGrade,
  GRADE_COMPONENTS_SAVE_SCHEMA,
  GRADE_IMPORT_MAX_BYTES,
  GRADE_SCORES_SAVE_SCHEMA,
  GRADE_SHEET_RETURN_SCHEMA,
  GRADE_SHEET_SCHEMA,
  GRADE_SHEETS_SCHEMA,
  NEXT_WARNING_STATUS,
  parseScoreMatrix,
  WARNING_ADVANCE_SCHEMA,
  type GradeComponentsSaveInput,
  type GradeScoresSaveInput,
  type ScoreChange,
  type GradeSheetReturnInput,
} from "@/modules/grades/grades.rule";
import { academicWarnings, courseResults, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import type { GradeComponent, GradeSheetStatus, WarningStatus } from "@/modules/grades/grades.type";
import { getCurrentLecturer, getCurrentStudent, getStudent } from "@/modules/users/users.query";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { assessmentMismatches } from "@/modules/teaching/teaching.rule";
import { syllabi, syllabusAssessments } from "@/modules/teaching/teaching.schema";

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
    .select({ id: classSections.id, code: classSections.code, courseName: courses.name, lecturerId: classSections.lecturerId, termName: terms.name, termEnd: terms.endDate })
    .from(classSections)
    .innerJoin(terms, eq(terms.id, classSections.termId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
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

// Bảng điểm khác đề cương đã công bố mà chưa ghi lý do khi chốt.
class SyllabusMismatchError extends Error {}

// Chốt điểm. Bảng điểm phải khớp cách tính điểm của đề cương đã công bố (cột, trọng số); khác thì chặn, trừ khi giảng viên ghi lý
// do (lý do vào nhật ký thao tác để khoa thấy khi duyệt).
export async function lockGradeSheet(classSectionId: string, options: { syllabusReason?: string | null } = {}): Promise<ActionResult<{ status: GradeSheetStatus; lockedAt: string }>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(GRADE_SHEET_SCHEMA, { classSectionId });
  if (!parsed.ok) return parsed;
  const section = await requireOwnSection(lecturer.id, parsed.data.classSectionId);
  const syllabusReason = typeof options.syllabusReason === "string" ? options.syllabusReason.trim().slice(0, 300) : "";
  try {
    const result = await db.transaction(async (tx) => {
      const sheet = await lockSheet(tx, section);
      if (!EDITABLE.includes(sheet.status)) throw new GradeActionError("Bảng điểm đã chốt trước đó.");
      const [published, sheetColumns] = await Promise.all([
        tx
          .select({ key: syllabusAssessments.key, label: syllabusAssessments.label, weight: syllabusAssessments.weight })
          .from(syllabusAssessments)
          .innerJoin(syllabi, eq(syllabi.id, syllabusAssessments.syllabusId))
          .where(and(eq(syllabi.classSectionId, section.id), eq(syllabi.status, "published"))),
        tx.select({ key: gradeComponents.key, label: gradeComponents.label, weight: gradeComponents.weight }).from(gradeComponents).where(eq(gradeComponents.gradeSheetId, sheet.id)),
      ]);
      const mismatches = published.length > 0 ? assessmentMismatches(published, sheetColumns, false) : [];
      if (mismatches.length > 0 && !syllabusReason) throw new SyllabusMismatchError(`Bảng điểm khác đề cương đã công bố: ${mismatches.join(" ")} Sửa cột điểm theo đề cương hoặc ghi lý do khi chốt.`);
      if (mismatches.length > 0) {
        const { user } = await requireSession();
        await recordAudit(tx, {
          actor: { userId: user.id, name: lecturer.displayName, role: "Giảng viên" },
          action: "lock",
          entityType: "grade-sheet",
          entityId: sheet.id,
          entityLabel: `${section.code} ${section.courseName}`,
          summary: `Chốt điểm ${section.code} dù khác đề cương đã công bố (${mismatches.join(" ")}). Lý do: ${syllabusReason}`,
        });
      }
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
    if (error instanceof SyllabusMismatchError) return actionError(error.message, { syllabusReason: error.message });
    return failure(error);
  }
}

// Bảng điểm cùng khoa của học phần, khóa dòng để duyệt, trả lại, công bố không chen nhau.
async function sheetsInScope(tx: Transaction, classSectionIds: string[], faculty: string | null, status: GradeSheetStatus) {
  const rows = await tx
    .select({
      id: gradeSheets.id,
      classSectionId: gradeSheets.classSectionId,
      status: gradeSheets.status,
      faculty: faculties.name,
      code: classSections.code,
      courseName: courses.name,
      lecturerId: classSections.lecturerId,
    })
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
      if (sheet.lecturerId) {
        await notifyLecturers(tx, [sheet.lecturerId], {
          kind: "grade",
          title: `Bảng điểm ${sheet.code} bị khoa trả lại, sửa rồi chốt lại để khoa duyệt`,
          body: `${sheet.courseName}. Lý do: ${parsed.data.reason}`,
          href: `/lecturer/classes/${sheet.classSectionId}/grading`,
        });
      }
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
      // Mỗi lớp một thông báo cho sinh viên có điểm tổng kết vừa công bố.
      for (const sheet of sheets) {
        await notifyStudents(
          tx,
          roster.filter((entry) => entry.classSectionId === sheet.classSectionId).map((entry) => entry.studentId),
          {
            kind: "grade",
            title: `Đã có điểm ${sheet.courseName}`,
            body: `Phòng Đào tạo đã công bố điểm tổng kết lớp ${sheet.code}. Xem điểm và điểm trung bình tích lũy ở mục Kết quả học tập.`,
            href: "/application/grades",
            createdAt: recordedAt,
          },
        );
      }
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
    .select({
      id: academicWarnings.id,
      studentId: academicWarnings.studentId,
      level: academicWarnings.level,
      reasons: academicWarnings.reasons,
      termName: terms.name,
      advisorId: administrativeClasses.advisorId,
      faculty: faculties.name,
    })
    .from(academicWarnings)
    .innerJoin(terms, eq(terms.id, academicWarnings.termId))
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
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(academicWarnings)
        .set({ status: next })
        .where(and(eq(academicWarnings.id, warning.id), eq(academicWarnings.status, parsed.data.from)))
        .returning({ id: academicWarnings.id, status: academicWarnings.status });
      // Bước "gửi thông báo": báo sinh viên trên cổng (chưa có dịch vụ email).
      if (updated?.status === "notified") {
        await notifyStudents(tx, [warning.studentId], {
          kind: "grade",
          title: `Bạn bị cảnh báo học vụ mức ${warning.level} ${warning.termName.toLowerCase()}`,
          body: `${warning.reasons.join("; ")}. Liên hệ cố vấn học tập để lập kế hoạch cải thiện kết quả.`,
          href: "/application/grades",
        });
      }
      return updated;
    });
    if (!row) return actionError("Cảnh báo đã được xử lý ở bước này, tải lại trang để xem trạng thái mới.");
    revalidatePath("/lecturer", "layout");
    revalidatePath("/administrator/reports/academic-warnings");
    revalidatePath("/administrator");
    return actionOk(row);
  } catch (error) {
    return failure(error);
  }
}

// Giảng viên sửa cột điểm khi bảng điểm còn nháp hoặc bị trả lại. Lớp chưa có bảng điểm thì tạo bảng (cột mặc định) rồi thay cột.
export async function saveGradeComponents(input: GradeComponentsSaveInput): Promise<ActionResult<{ components: GradeComponent[] }>> {
  const lecturer = await getCurrentLecturer();
  const session = await requireSession();
  const parsed = parseInput(GRADE_COMPONENTS_SAVE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const section = await requireOwnSection(lecturer.id, parsed.data.classSectionId);
  try {
    const components = await db.transaction(async (tx) => {
      const sheet = await lockSheet(tx, section);
      if (!EDITABLE.includes(sheet.status)) throw new GradeActionError("Bảng điểm đã chốt, không đổi được cột điểm. Tải lại trang để xem trạng thái mới.");
      const change = await replaceGradeComponents(tx, { gradeSheetId: sheet.id, components: parsed.data.components, confirmDropScores: parsed.data.confirmDropScores });
      await recordAudit(tx, {
        actor: { userId: session.user.id, name: lecturer.displayName, role: "Giảng viên" },
        action: "update",
        entityType: "grade-sheet",
        entityId: sheet.id,
        entityLabel: `${section.code} ${section.courseName}`,
        summary: `Sửa cột điểm lớp ${section.code}`,
        changes: [{ field: "Cột điểm", before: change.before, after: change.after }],
      });
      return tx
        .select({ key: gradeComponents.key, label: gradeComponents.label, weight: gradeComponents.weight })
        .from(gradeComponents)
        .where(eq(gradeComponents.gradeSheetId, sheet.id))
        .orderBy(gradeComponents.position);
    });
    revalidatePath("/lecturer", "layout");
    return actionOk({ components });
  } catch (error) {
    return failure(error);
  }
}

// Xuất bảng điểm đã lưu ra .xlsx (nội dung base64). Nơi gọi lưu nháp trước để tệp có điểm mới nhất.
export async function exportGradeSheetExcel(classSectionId: string): Promise<ActionResult<{ fileName: string; base64: string; mimeType: string }>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(GRADE_SHEET_SCHEMA, { classSectionId });
  if (!parsed.ok) return parsed;
  const section = await requireOwnSection(lecturer.id, parsed.data.classSectionId);
  const [sheet, roster] = await Promise.all([getGradeSheet(section.id), sectionRoster(db, section.id)]);
  if (!sheet) return actionError("Lớp học phần không còn, tải lại trang.");
  const buffer = await gradeSheetWorkbook({
    classCode: section.code,
    courseName: section.courseName,
    components: sheet.components,
    students: roster,
    scores: sheet.scores,
    locked: !EDITABLE.includes(sheet.status),
  });
  return actionOk({ fileName: `bang-diem-${section.code}.xlsx`, base64: buffer.toString("base64"), mimeType: XLSX_MIME });
}

type PdfFile = { fileName: string; base64: string; mimeType: string };

// Bảng điểm lớp bản PDF để in, ký nộp khoa: chỉ khi đã chốt (điểm không còn đổi), chỉ lớp giảng viên dạy.
export async function exportGradeSheetPdf(classSectionId: string): Promise<ActionResult<PdfFile>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(GRADE_SHEET_SCHEMA, { classSectionId });
  if (!parsed.ok) return parsed;
  const section = await requireOwnSection(lecturer.id, parsed.data.classSectionId);
  const [sheet, roster] = await Promise.all([getGradeSheet(section.id), sectionRoster(db, section.id)]);
  if (!sheet) return actionError("Lớp học phần không còn, tải lại trang.");
  if (EDITABLE.includes(sheet.status)) return actionError("Bảng điểm chưa chốt. Chốt điểm rồi mới tải được bản PDF để in.");
  const bytes = await gradeSheetPdf({
    classCode: section.code,
    courseName: section.courseName,
    termName: section.termName,
    lecturerName: lecturer.fullName,
    statusLabel: GRADE_SHEET_STATE[sheet.state].label,
    lockedAt: sheet.lockedAt,
    components: sheet.components,
    students: roster,
    scores: sheet.scores,
  });
  return actionOk({ fileName: `bang-diem-${section.code}.pdf`, base64: bytesToBase64(bytes), mimeType: PDF_MIME });
}

async function transcriptFile(student: { id: string; code: string; fullName: string; dateOfBirth: string; className: string; majorName: string; faculty: string; cohort: number }) {
  const [transcript, [standing]] = await Promise.all([getTranscript(student.id), getStudentStandings([student.id])]);
  const bytes = await transcriptPdf(student, transcript, standing);
  return { fileName: `bang-diem-${student.code.replace(/\./g, "")}.pdf`, base64: bytesToBase64(bytes), mimeType: PDF_MIME };
}

// Sinh viên tải bảng điểm của chính mình (không nhận mã sinh viên từ trình duyệt).
export async function downloadOwnTranscriptPdf(): Promise<ActionResult<PdfFile>> {
  const student = await getCurrentStudent();
  return actionOk(await transcriptFile(student));
}

// Cán bộ có quyền xem sinh viên tải bảng điểm của sinh viên trong phạm vi khoa mình.
export async function downloadStudentTranscriptPdf(studentId: string): Promise<ActionResult<PdfFile>> {
  const viewer = await requirePermission("students.view");
  const student = isUuid(studentId) ? await getStudent(studentId) : null;
  if (!student) return actionError("Không tìm thấy sinh viên, tải lại trang.");
  if (!inScope(viewer, student.faculty)) forbidden();
  return actionOk(await transcriptFile(student));
}

// Đọc tệp .xlsx theo mẫu đã xuất, trả các ô điểm để bảng nhập điểm điền và lưu nháp như khi gõ tay.
export async function readGradeSheetExcel(formData: FormData): Promise<ActionResult<{ changes: ScoreChange[]; errors: string[] }>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(GRADE_SHEET_SCHEMA, { classSectionId: formData.get("classSectionId") });
  if (!parsed.ok) return parsed;
  const section = await requireOwnSection(lecturer.id, parsed.data.classSectionId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return actionError("Chưa chọn tệp.");
  if (file.size > GRADE_IMPORT_MAX_BYTES) return actionError("Tệp lớn hơn 900 KB, kiểm tra lại đúng tệp bảng điểm chưa.");
  if (!file.name.toLowerCase().endsWith(".xlsx")) return actionError("Chỉ nhận tệp .xlsx hoặc .csv theo mẫu đã xuất.");
  const [sheet, roster] = await Promise.all([getGradeSheet(section.id), sectionRoster(db, section.id)]);
  if (!sheet) return actionError("Lớp học phần không còn, tải lại trang.");
  let matrix: string[][];
  try {
    matrix = await readWorkbookMatrix(await file.arrayBuffer());
  } catch {
    return actionError("Không đọc được tệp Excel. Mở tệp bằng Excel, lưu lại dạng .xlsx rồi thử lại.");
  }
  return actionOk(parseScoreMatrix(matrix, sheet.components, roster));
}

// Phòng Đào tạo (phạm vi toàn trường) sinh cảnh báo học vụ cho một học kỳ đã kết thúc; chạy lại không sinh trùng.
export async function generateAcademicWarnings(termId: string): Promise<ActionResult<WarningSyncResult>> {
  const viewer = await requirePermission("reports.view");
  if (!can(viewer, "grades.publish") || viewer.faculty !== null) forbidden();
  const parsed = parseInput(ACADEMIC_WARNING_GENERATE_SCHEMA, { termId });
  if (!parsed.ok) return parsed;
  try {
    const result = await db.transaction(async (tx) => {
      const synced = await syncAcademicWarnings(tx, parsed.data.termId);
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "create",
        entityType: "report",
        entityId: synced.termId,
        entityLabel: `Cảnh báo học vụ ${synced.termName}`,
        summary: `Sinh cảnh báo học vụ: ${synced.created} mới, ${synced.updated} cập nhật, ${synced.removed} bỏ`,
      });
      return synced;
    });
    revalidatePath("/administrator/reports/academic-warnings");
    revalidatePath("/administrator");
    revalidatePath("/lecturer", "layout");
    return actionOk(result);
  } catch (error) {
    return failure(error);
  }
}
