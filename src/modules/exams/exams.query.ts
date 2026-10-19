import { mockDelay } from "@/shared/libs/mock-request.lib";
import { EXAM_SESSIONS } from "@/modules/exams/exams.mock";
import type { ExamSession } from "@/modules/exams/exams.type";

function byDate(a: ExamSession, b: ExamSession) {
  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
}

export async function getExamSessions(termId: string) {
  await mockDelay();
  return EXAM_SESSIONS.filter((session) => session.termId === termId).toSorted(byDate);
}

export async function getExamsForLecturer(lecturerId: string) {
  await mockDelay();
  return EXAM_SESSIONS.filter((session) => session.lecturerId === lecturerId || session.proctors.some((proctor) => proctor.id === lecturerId)).toSorted(byDate);
}

export async function getExamsForClassSections(classSectionIds: string[]) {
  await mockDelay();
  return EXAM_SESSIONS.filter((session) => classSectionIds.includes(session.classSectionId)).toSorted(byDate);
}
