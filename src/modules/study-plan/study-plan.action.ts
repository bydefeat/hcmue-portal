"use server";

import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { courses, programCohorts, programCourses, programs } from "@/modules/curriculum/curriculum.schema";
import { regulations } from "@/modules/settings/settings.schema";
import { STUDY_PLAN_CONSTRAINT_MESSAGE, STUDY_PLAN_CREDIT_LIMIT } from "@/modules/study-plan/study-plan.constant";
import { getStudyPlanOfStudent } from "@/modules/study-plan/study-plan.query";
import {
  planEditMode,
  STUDY_PLAN_REVIEW_SCHEMA,
  STUDY_PLAN_SCHEMA,
  termsOutOfRange,
  type StudyPlanInput,
  type StudyPlanReviewInput,
} from "@/modules/study-plan/study-plan.rule";
import { studyPlanItems, studyPlans } from "@/modules/study-plan/study-plan.schema";
import type { StudyPlan } from "@/modules/study-plan/study-plan.type";
import { getCurrentLecturer, getCurrentStudent } from "@/modules/users/users.query";
import { administrativeClasses, students } from "@/modules/users/users.schema";

class PlanError extends Error {}

// Hạn mức tín chỉ mỗi học kỳ theo quy chế đang áp dụng; chưa có quy chế trong DB thì dùng mức mặc định.
async function creditLimits(tx: Transaction) {
  const [regulation] = await tx
    .select({ rules: regulations.rules })
    .from(regulations)
    .where(lte(regulations.effectiveFrom, new Date().toISOString().slice(0, 10)))
    .orderBy(desc(regulations.effectiveFrom))
    .limit(1);
  const credits = regulation?.rules.credits;
  return credits ? { min: credits.minPerTerm, max: credits.maxPerTerm } : STUDY_PLAN_CREDIT_LIMIT;
}

// Học phần trong kế hoạch phải thuộc khung chương trình đào tạo áp dụng cho ngành và khóa của sinh viên.
async function programCoursesOf(tx: Transaction, studentId: string, codes: string[]) {
  if (codes.length === 0) return new Map<string, { id: string; credits: number }>();
  const rows = await tx
    .selectDistinct({ code: courses.code, id: courses.id, credits: courses.credits })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(programs, eq(programs.majorId, administrativeClasses.majorId))
    .innerJoin(programCohorts, and(eq(programCohorts.programId, programs.id), eq(programCohorts.cohort, administrativeClasses.cohort)))
    .innerJoin(programCourses, eq(programCourses.programId, programs.id))
    .innerJoin(courses, eq(courses.id, programCourses.courseId))
    .where(and(eq(students.id, studentId), inArray(courses.code, codes)));
  const found = new Map(rows.map(({ code, ...course }) => [code, course]));
  const missing = codes.filter((code) => !found.has(code));
  if (missing.length > 0) throw new PlanError(`Học phần ${missing.join(", ")} không thuộc chương trình đào tạo của bạn.`);
  return found;
}

async function writePlan(input: StudyPlanInput, submit: boolean): Promise<ActionResult<StudyPlan>> {
  const student = await getCurrentStudent();
  const parsed = parseInput(STUDY_PLAN_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { terms, studentNote } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: studyPlans.id, status: studyPlans.status })
        .from(studyPlans)
        .where(and(eq(studyPlans.studentId, student.id), eq(studyPlans.isActive, true)))
        .for("update");
      const mode = planEditMode(current?.status ?? null);
      if (mode === "locked") throw new PlanError("Kế hoạch đang chờ cố vấn duyệt nên chưa sửa được. Khi cố vấn duyệt hoặc trả lại, bạn sửa tiếp.");
      const found = await programCoursesOf(
        tx,
        student.id,
        terms.flatMap((term) => term.courseCodes),
      );
      if (submit) {
        const limits = await creditLimits(tx);
        const credits = terms.map((term) => ({ termName: term.termName, credits: term.courseCodes.reduce((sum, code) => sum + found.get(code)!.credits, 0) }));
        const [first] = termsOutOfRange(credits, limits);
        if (first) throw new PlanError(`${first.termName} có ${first.credits} tín chỉ, cần từ ${limits.min} đến ${limits.max}. Điều chỉnh rồi gửi lại.`);
      }
      let planId: string;
      if (mode === "update") {
        planId = current!.id;
        await tx.update(studyPlans).set({ studentNote }).where(eq(studyPlans.id, planId));
        await tx.delete(studyPlanItems).where(eq(studyPlanItems.studyPlanId, planId));
      } else {
        // Kế hoạch đã duyệt giữ nguyên làm lịch sử, bản sửa là kế hoạch nháp mới.
        if (current) await tx.update(studyPlans).set({ isActive: false }).where(eq(studyPlans.id, current.id));
        const [row] = await tx.insert(studyPlans).values({ studentId: student.id, studentNote }).returning({ id: studyPlans.id });
        planId = row.id;
      }
      const items = terms.flatMap(({ academicYear, semester, courseCodes }) => courseCodes.map((code) => ({ studyPlanId: planId, courseId: found.get(code)!.id, academicYear, semester })));
      if (items.length > 0) await tx.insert(studyPlanItems).values(items);
      if (submit) {
        await tx
          .update(studyPlans)
          .set({ status: "pending", submittedAt: new Date(), reviewedAt: null, reviewedById: null, advisorComment: null })
          .where(eq(studyPlans.id, planId));
      }
    });
  } catch (error) {
    if (error instanceof PlanError) return actionError(error.message);
    return actionFailure(error, STUDY_PLAN_CONSTRAINT_MESSAGE);
  }
  revalidatePath("/application/study-plan");
  revalidatePath("/lecturer/advising", "layout");
  const plan = await getStudyPlanOfStudent(student.id);
  return plan ? actionOk(plan) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function saveStudyPlan(input: StudyPlanInput): Promise<ActionResult<StudyPlan>> {
  return writePlan(input, false);
}

export async function submitStudyPlan(input: StudyPlanInput): Promise<ActionResult<StudyPlan>> {
  return writePlan(input, true);
}

// Cố vấn chỉ xét kế hoạch đang chờ duyệt của sinh viên thuộc lớp sinh hoạt mình được phân công.
export async function reviewStudyPlan(input: StudyPlanReviewInput): Promise<ActionResult<StudyPlan>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(STUDY_PLAN_REVIEW_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { id, decision, comment } = parsed.data;
  let studentId: string;
  try {
    const [plan] = await db
      .select({ studentId: studyPlans.studentId, status: studyPlans.status, isActive: studyPlans.isActive, advisorId: administrativeClasses.advisorId })
      .from(studyPlans)
      .innerJoin(students, eq(students.id, studyPlans.studentId))
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .where(eq(studyPlans.id, id));
    if (!plan || !plan.isActive) return actionError("Kế hoạch không còn hiệu lực, sinh viên đã sửa thành bản mới. Tải lại trang.");
    if (plan.advisorId !== lecturer.id) return actionError("Sinh viên này không thuộc lớp bạn cố vấn nên không duyệt được.");
    const [row] = await db
      .update(studyPlans)
      .set({ status: decision, advisorComment: comment || null, reviewedAt: new Date(), reviewedById: lecturer.id })
      .where(
        and(
          eq(studyPlans.id, id),
          eq(studyPlans.status, "pending"),
          eq(studyPlans.isActive, true),
          inArray(
            studyPlans.studentId,
            db
              .select({ id: students.id })
              .from(students)
              .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
              .where(eq(administrativeClasses.advisorId, lecturer.id)),
          ),
        ),
      )
      .returning({ studentId: studyPlans.studentId });
    if (!row) return actionError("Kế hoạch không còn ở trạng thái chờ duyệt. Tải lại trang để xem trạng thái mới.");
    studentId = row.studentId;
  } catch (error) {
    return actionFailure(error, STUDY_PLAN_CONSTRAINT_MESSAGE);
  }
  revalidatePath("/lecturer/advising", "layout");
  revalidatePath("/lecturer");
  revalidatePath("/application/study-plan");
  const plan = await getStudyPlanOfStudent(studentId);
  return plan ? actionOk(plan) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}
