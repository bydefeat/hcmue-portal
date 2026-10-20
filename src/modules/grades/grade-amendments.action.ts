"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { auditActorOf } from "@/modules/audit/audit.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { classSections } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { GRADES_CONSTRAINT_MESSAGE } from "@/modules/grades/grades.constant";
import { decideGradeAmendment, proposeGradeAmendment } from "@/modules/grades/grade-amendments.lib";
import { amendableSheet, type AmendableSheet } from "@/modules/grades/grade-amendments.query";
import { GRADE_AMENDMENT_DECIDE_SCHEMA, GRADE_AMENDMENT_PROPOSE_SCHEMA, type GradeAmendmentDecideInput, type GradeAmendmentProposeInput } from "@/modules/grades/grades.rule";
import { gradeAmendments, gradeSheets } from "@/modules/grades/grades.schema";
import { getCurrentLecturer } from "@/modules/users/users.query";

function revalidateAmendments(classSectionId?: string) {
  revalidatePath("/administrator/grade-amendments");
  if (classSectionId) revalidatePath(`/lecturer/classes/${classSectionId}/grading`);
  revalidatePath("/application/grades");
}

async function sectionScope(classSectionId: string) {
  const [section] = await db
    .select({ lecturerId: classSections.lecturerId, faculty: faculties.name })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(eq(classSections.id, classSectionId));
  return section ?? null;
}

// Giảng viên đề nghị sửa điểm từ bảng điểm đã công bố của lớp mình dạy; Phòng Đào tạo duyệt.
export async function proposeAmendmentAsLecturer(input: GradeAmendmentProposeInput): Promise<ActionResult<{ id: string }>> {
  const lecturer = await getCurrentLecturer();
  const { user } = await requireSession();
  const parsed = parseInput(GRADE_AMENDMENT_PROPOSE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const section = await sectionScope(parsed.data.classSectionId);
  if (!section || section.lecturerId !== lecturer.id) forbidden();
  try {
    const created = await db.transaction((tx) =>
      proposeGradeAmendment(tx, { ...parsed.data, source: "grade-change", publishedOnly: true, requester: { userId: user.id, name: lecturer.displayName, role: "Giảng viên" } }),
    );
    revalidateAmendments(parsed.data.classSectionId);
    return actionOk({ id: created.id });
  } catch (error) {
    return actionFailure(error, GRADES_CONSTRAINT_MESSAGE);
  }
}

// Phòng Đào tạo nhập điểm (thi bù thay điểm I, sửa sai sót) dưới dạng đề nghị; một cán bộ khác duyệt.
export async function proposeAmendmentAsOffice(input: GradeAmendmentProposeInput): Promise<ActionResult<{ id: string }>> {
  const viewer = await requirePermission("grades.publish");
  const parsed = parseInput(GRADE_AMENDMENT_PROPOSE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const section = await sectionScope(parsed.data.classSectionId);
  if (!section || !inScope(viewer, section.faculty)) forbidden();
  try {
    const created = await db.transaction((tx) => proposeGradeAmendment(tx, { ...parsed.data, source: "manual", requester: auditActorOf(viewer) }));
    revalidateAmendments(parsed.data.classSectionId);
    return actionOk({ id: created.id });
  } catch (error) {
    return actionFailure(error, GRADES_CONSTRAINT_MESSAGE);
  }
}

// Duyệt (áp điểm, tính lại kết quả theo quy chế lúc công bố) hoặc từ chối đề nghị sửa điểm trong phạm vi khoa.
export async function decideAmendment(input: GradeAmendmentDecideInput): Promise<ActionResult<{ status: "approved" | "rejected"; resultAfter: string | null }>> {
  const viewer = await requirePermission("grades.publish");
  const parsed = parseInput(GRADE_AMENDMENT_DECIDE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const [row] = await db
    .select({ classSectionId: gradeSheets.classSectionId })
    .from(gradeAmendments)
    .innerJoin(gradeSheets, eq(gradeSheets.id, gradeAmendments.gradeSheetId))
    .where(eq(gradeAmendments.id, parsed.data.id));
  if (!row) return actionError("Đề nghị sửa điểm không còn, tải lại trang.");
  const section = await sectionScope(row.classSectionId);
  if (!section || !inScope(viewer, section.faculty)) forbidden();
  try {
    const result = await db.transaction((tx) => decideGradeAmendment(tx, { ...parsed.data, actor: auditActorOf(viewer) }));
    revalidateAmendments(row.classSectionId);
    return actionOk(result);
  } catch (error) {
    return actionFailure(error, GRADES_CONSTRAINT_MESSAGE);
  }
}

// Cột điểm và danh sách sinh viên của lớp cho form nhập điểm của Phòng Đào tạo.
export async function loadAmendableSheet(classSectionId: string): Promise<ActionResult<AmendableSheet>> {
  const viewer = await requirePermission("grades.publish");
  if (!isUuid(classSectionId)) return actionError("Lớp không hợp lệ.");
  const section = await sectionScope(classSectionId);
  if (!section || !inScope(viewer, section.faculty)) forbidden();
  const sheet = await amendableSheet(classSectionId);
  return sheet ? actionOk(sheet) : actionError("Lớp chưa chốt điểm, giảng viên sửa trực tiếp trên bảng điểm.");
}
