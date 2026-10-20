"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { programFor, programsOf } from "@/modules/curriculum/curriculum.lib";
import { courses, programCourses } from "@/modules/curriculum/curriculum.schema";
import { currentWarningLevel } from "@/modules/grades/grades.lib";
import { notifyLecturers, notifyStudents } from "@/modules/notifications/notifications.lib";
import { regulationAt } from "@/modules/settings/settings.lib";
import { STUDY_PLAN_CONSTRAINT_MESSAGE } from "@/modules/study-plan/study-plan.constant";
import { getStudyPlanOfStudent } from "@/modules/study-plan/study-plan.query";
import {
  planEditMode,
  STUDY_PLAN_REVIEW_SCHEMA,
  STUDY_PLAN_SCHEMA,
  termCreditLimits,
  termsOutOfRange,
  type StudyPlanInput,
  type StudyPlanReviewInput,
} from "@/modules/study-plan/study-plan.rule";
import { studyPlanItems, studyPlans } from "@/modules/study-plan/study-plan.schema";
import type { StudyPlan } from "@/modules/study-plan/study-plan.type";
import { getCurrentLecturer, getCurrentStudent } from "@/modules/users/users.query";
import { administrativeClasses, students } from "@/modules/users/users.schema";

class PlanError extends Error {}

// Học phần trong kế hoạch phải thuộc khung chương trình đang áp dụng cho ngành và khóa của sinh viên (programsOf, cùng cách chọn với
// xét tốt nghiệp và trang Chương trình đào tạo).
async function programCoursesOf(tx: Transaction, studentId: string, codes: string[]) {
  if (codes.length === 0) return new Map<string, { id: string; credits: number }>();
  const [home] = await tx
    .select({ majorId: administrativeClasses.majorId, cohort: administrativeClasses.cohort })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(eq(students.id, studentId));
  const program = home ? programFor(await programsOf(tx, [home]), home) : null;
  if (!program) throw new PlanError("Chưa có chương trình đào tạo đang áp dụng cho ngành và khóa của bạn, liên hệ Phòng Đào tạo.");
  const rows = await tx
    .select({ code: courses.code, id: courses.id, credits: courses.credits })
    .from(programCourses)
    .innerJoin(courses, eq(courses.id, programCourses.courseId))
    .where(and(eq(programCourses.programId, program.id), inArray(courses.code, codes)));
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
        // Hạn mức theo quy chế đang áp dụng: học kỳ hè theo maxSummer, đang bị cảnh báo chính thức theo maxWhenWarned.
        const [regulation, warningLevel] = await Promise.all([regulationAt(tx), currentWarningLevel(tx, student.id)]);
        const limitsOf = (termName: string) => termCreditLimits(terms.find((term) => term.termName === termName)!, regulation.credits, warningLevel > 0);
        const credits = terms.map((term) => ({ termName: term.termName, credits: term.courseCodes.reduce((sum, code) => sum + found.get(code)!.credits, 0) }));
        const [first] = termsOutOfRange(credits, limitsOf);
        if (first) {
          const limits = limitsOf(first.termName);
          throw new PlanError(`${first.termName} có ${first.credits} tín chỉ, cần ${limits.min > 0 ? `từ ${limits.min} đến ${limits.max}` : `tối đa ${limits.max}`}${warningLevel > 0 ? " (đang bị cảnh báo học vụ)" : ""}. Điều chỉnh rồi gửi lại.`);
        }
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
        // Báo cố vấn của lớp sinh hoạt; lớp chưa phân công cố vấn thì chưa có ai để báo.
        const [advisor] = await tx
          .select({ id: administrativeClasses.advisorId })
          .from(students)
          .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
          .where(eq(students.id, student.id));
        if (advisor?.id) {
          await notifyLecturers(tx, [advisor.id], {
            kind: "advising",
            title: "Kế hoạch học tập mới chờ duyệt",
            body: `${student.fullName} (${student.code}, lớp ${student.className}) vừa gửi kế hoạch học tập.`,
            href: "/lecturer/advising/study-plans",
          });
        }
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
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(studyPlans)
        .set({ status: decision, advisorComment: comment || null, reviewedAt: new Date(), reviewedById: lecturer.id })
        .where(
          and(
            eq(studyPlans.id, id),
            eq(studyPlans.status, "pending"),
            eq(studyPlans.isActive, true),
            inArray(
              studyPlans.studentId,
              tx
                .select({ id: students.id })
                .from(students)
                .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
                .where(eq(administrativeClasses.advisorId, lecturer.id)),
            ),
          ),
        )
        .returning({ studentId: studyPlans.studentId });
      if (!updated) return null;
      await notifyStudents(
        tx,
        [updated.studentId],
        decision === "approved"
          ? {
              kind: "advising",
              title: "Cố vấn đã duyệt kế hoạch học tập",
              body: comment ? `Nhận xét của ${lecturer.displayName}: ${comment}` : `${lecturer.displayName} đã duyệt. Kế hoạch này là căn cứ khi bạn đăng ký học phần.`,
              href: "/application/study-plan",
            }
          : {
              kind: "advising",
              title: "Cố vấn trả lại kế hoạch học tập, sửa rồi gửi duyệt lại",
              body: `Nhận xét của ${lecturer.displayName}: ${comment}`,
              href: "/application/study-plan",
            },
      );
      return updated;
    });
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
