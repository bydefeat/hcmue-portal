import { mockDelay } from "@/shared/libs/mock-request.lib";
import { mockGraduationExtras } from "@/modules/graduation/graduation.mock";

export async function getGraduationExtras(studentIds: string[]) {
  await mockDelay();
  return studentIds.map(mockGraduationExtras);
}
