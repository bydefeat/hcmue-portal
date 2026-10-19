import type { Transaction } from "@/shared/libs/db.lib";
import { COURSES, PROGRAM_COURSES, PROGRAMS } from "@/modules/curriculum/curriculum.mock";
import { STUDY_PLAN_TERMS, STUDY_PLANS, type StudyPlanSeed } from "@/modules/study-plan/study-plan.mock";
import { studyPlanItems, studyPlans } from "@/modules/study-plan/study-plan.schema";
import { ADVISOR_ASSIGNMENTS } from "@/modules/users/users.mock";
import type { SeedContext } from "./context";

const ACTIVE_COURSES = new Set(COURSES.filter((course) => course.isActive).map((course) => course.code));

// Học phần của kế hoạch theo khung chương trình: học kỳ thứ n của chương trình (từ firstProgramSemester) xếp vào cột thứ n
// của kế hoạch. Bỏ học phần đã ngừng mở.
export function studyPlanCourses(plan: StudyPlanSeed) {
  const program = PROGRAMS.find((entry) => entry.majorCode === plan.majorCode && entry.cohorts.includes(plan.cohort));
  return (program ? (PROGRAM_COURSES[program.id] ?? []) : []).flatMap((entry) => {
    const term = STUDY_PLAN_TERMS[entry.semester - plan.firstProgramSemester];
    return term && ACTIVE_COURSES.has(entry.courseCode) ? [{ ...term, courseCode: entry.courseCode }] : [];
  });
}

export async function seedStudyPlan(tx: Transaction, context: SeedContext) {
  const advisorOf = new Map(ADVISOR_ASSIGNMENTS.map((assignment) => [assignment.className, assignment.advisorId]));
  await tx.insert(studyPlans).values(
    STUDY_PLANS.map((plan) => ({
      id: plan.id,
      studentId: plan.studentId,
      status: plan.status,
      studentNote: plan.studentNote,
      advisorComment: plan.advisorComment,
      submittedAt: plan.submittedAt ? new Date(plan.submittedAt) : null,
      reviewedAt: plan.reviewedAt ? new Date(plan.reviewedAt) : null,
      reviewedById: plan.reviewedAt ? (advisorOf.get(plan.className) ?? null) : null,
    })),
  );
  const items = STUDY_PLANS.flatMap((plan) =>
    studyPlanCourses(plan).map((item) => ({
      studyPlanId: plan.id,
      courseId: context.courseByCode.get(item.courseCode)!.id,
      academicYear: item.academicYear,
      semester: item.semester,
    })),
  );
  if (items.length > 0) await tx.insert(studyPlanItems).values(items);
  return { plans: STUDY_PLANS.length, items: items.length };
}
