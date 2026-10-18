import { mockDelay } from "@/shared/libs/mock-request.lib";
import { STUDY_PLANS } from "./study-plan.mock";

export async function getStudyPlans(studentIds?: string[]) {
  await mockDelay();
  if (!studentIds) return STUDY_PLANS;
  const wanted = new Set(studentIds);
  return STUDY_PLANS.filter((plan) => wanted.has(plan.studentId));
}

export async function getStudyPlanOfStudent(studentId: string) {
  return STUDY_PLANS.find((plan) => plan.studentId === studentId) ?? null;
}
