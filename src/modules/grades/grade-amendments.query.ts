import "server-only";
import { forbidden } from "next/navigation";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { requireSession } from "@/modules/authentication/authentication.query";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { gradeAmendments, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import type { GradeAmendment, GradeAmendmentStatus } from "@/modules/grades/grades.type";
import { academicRequests } from "@/modules/requests/requests.schema";
import { lecturers, students } from "@/modules/users/users.schema";

const COLUMNS = {
  id: gradeAmendments.id,
  classSectionId: gradeSheets.classSectionId,
  classCode: classSections.code,
  courseName: courses.name,
  termName: terms.name,
  faculty: faculties.name,
  studentId: gradeAmendments.studentId,
  studentCode: students.code,
  fullName: students.fullName,
  componentLabel: gradeAmendments.componentLabel,
  oldScore: gradeAmendments.oldScore,
  newScore: gradeAmendments.newScore,
  reason: gradeAmendments.reason,
  source: gradeAmendments.source,
  requestCode: academicRequests.code,
  status: gradeAmendments.status,
  requestedByUserId: gradeAmendments.requestedByUserId,
  requestedByName: gradeAmendments.requestedByName,
  requestedAt: gradeAmendments.requestedAt,
  decidedByName: gradeAmendments.decidedByName,
  decidedAt: gradeAmendments.decidedAt,
  decisionNote: gradeAmendments.decisionNote,
  resultBefore: gradeAmendments.resultBefore,
  resultAfter: gradeAmendments.resultAfter,
};

async function amendmentRows(where: SQL | undefined, viewerUserId: string, limit = 500): Promise<GradeAmendment[]> {
  const rows = await db
    .select(COLUMNS)
    .from(gradeAmendments)
    .innerJoin(gradeSheets, eq(gradeSheets.id, gradeAmendments.gradeSheetId))
    .innerJoin(classSections, eq(classSections.id, gradeSheets.classSectionId))
    .innerJoin(terms, eq(terms.id, classSections.termId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .innerJoin(students, eq(students.id, gradeAmendments.studentId))
    .leftJoin(academicRequests, eq(academicRequests.id, gradeAmendments.requestId))
    .where(where)
    .orderBy(desc(gradeAmendments.requestedAt))
    .limit(limit);
  return rows.map(({ requestedByUserId, ...row }) => ({
    ...row,
    studentCode: formatStudentCode(row.studentCode),
    requestedAt: row.requestedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    isOwn: requestedByUserId === viewerUserId,
  }));
}

// Trang Sửa điểm của Phòng Đào tạo (quyền công bố điểm), trong phạm vi khoa của vai trò: đề nghị chờ duyệt và lịch sử gần đây.
export async function getGradeAmendments(status?: GradeAmendmentStatus): Promise<GradeAmendment[]> {
  const viewer = await requirePermission("grades.publish");
  const rows = await amendmentRows(status ? eq(gradeAmendments.status, status) : undefined, viewer.id);
  return rows.filter((row) => inScope(viewer, row.faculty));
}

// Lịch sử sửa điểm của một lớp: giảng viên dạy lớp hoặc cán bộ (trang nhập điểm, bảng điểm).
export async function getSectionAmendments(classSectionId: string): Promise<GradeAmendment[]> {
  const session = await requireSession();
  if (!isUuid(classSectionId)) return [];
  if (!session.roles.includes("admin")) {
    const [section] = await db
      .select({ userId: lecturers.userId })
      .from(classSections)
      .innerJoin(lecturers, eq(lecturers.id, classSections.lecturerId))
      .where(eq(classSections.id, classSectionId));
    if (section?.userId !== session.user.id) forbidden();
  }
  return amendmentRows(eq(gradeSheets.classSectionId, classSectionId), session.user.id);
}

export type AmendableSection = { classSectionId: string; label: string; faculty: string };

// Lớp có bảng điểm đã công bố trong phạm vi khoa, để Phòng Đào tạo nhập điểm thi bù, sửa điểm tay.
export async function getAmendableSections(): Promise<AmendableSection[]> {
  const viewer = await requirePermission("grades.publish");
  const rows = await db
    .select({ classSectionId: classSections.id, code: classSections.code, courseName: courses.name, termName: terms.shortName, faculty: faculties.name })
    .from(gradeSheets)
    .innerJoin(classSections, eq(classSections.id, gradeSheets.classSectionId))
    .innerJoin(terms, eq(terms.id, classSections.termId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(eq(gradeSheets.status, "published"))
    .orderBy(desc(terms.startDate), asc(classSections.code));
  return rows.filter((row) => inScope(viewer, row.faculty)).map((row) => ({ classSectionId: row.classSectionId, label: `${row.code} ${row.courseName} (${row.termName})`, faculty: row.faculty }));
}

export type AmendableSheet = {
  components: { key: string; label: string }[];
  students: { studentId: string; studentCode: string; fullName: string; scores: Record<string, number | null> }[];
};

// Cột điểm, sinh viên đang học và điểm hiện tại của một bảng điểm đã chốt trở đi (form đề nghị sửa điểm). Nơi gọi kiểm phạm vi lớp.
export async function amendableSheet(classSectionId: string): Promise<AmendableSheet | null> {
  await requireSession();
  if (!isUuid(classSectionId)) return null;
  const [sheet] = await db.select({ id: gradeSheets.id, status: gradeSheets.status }).from(gradeSheets).where(eq(gradeSheets.classSectionId, classSectionId));
  if (!sheet || sheet.status === "draft" || sheet.status === "returned") return null;
  const [components, roster] = await Promise.all([
    db.select({ id: gradeComponents.id, key: gradeComponents.key, label: gradeComponents.label }).from(gradeComponents).where(eq(gradeComponents.gradeSheetId, sheet.id)).orderBy(asc(gradeComponents.position)),
    db
      .select({ enrollmentId: enrollments.id, studentId: students.id, code: students.code, fullName: students.fullName })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(eq(enrollments.classSectionId, classSectionId), eq(enrollments.status, "enrolled")))
      .orderBy(asc(students.code)),
  ]);
  const scores =
    roster.length === 0
      ? []
      : await db
          .select({ componentId: gradeScores.gradeComponentId, enrollmentId: gradeScores.enrollmentId, score: gradeScores.score })
          .from(gradeScores)
          .where(inArray(gradeScores.enrollmentId, roster.map((row) => row.enrollmentId)));
  const scoreOf = new Map(scores.map((row) => [`${row.componentId}:${row.enrollmentId}`, row.score]));
  return {
    components: components.map(({ key, label }) => ({ key, label })),
    students: roster.map((row) => ({
      studentId: row.studentId,
      studentCode: formatStudentCode(row.code),
      fullName: row.fullName,
      scores: Object.fromEntries(components.map((component) => [component.key, scoreOf.get(`${component.id}:${row.enrollmentId}`) ?? null])),
    })),
  };
}
