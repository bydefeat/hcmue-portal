import { mockDelay } from "@/shared/libs/mock-request.lib";
import { mockDate } from "@/shared/libs/mock.lib";
import { SURVEY, SURVEY_RESULTS } from "@/modules/surveys/surveys.mock";
import type { StudentSurveyTask } from "@/modules/surveys/surveys.type";

export async function getSurvey() {
  return SURVEY;
}

export async function getSurveyResults() {
  await mockDelay();
  return SURVEY_RESULTS;
}

export async function getSurveyResultsForLecturer(lecturerId: string) {
  await mockDelay();
  return SURVEY_RESULTS.filter((result) => result.lecturerId === lecturerId);
}

export async function getStudentSurveyTasks(sections: { id: string; code: string; courseName: string; lecturerName: string | null }[]): Promise<StudentSurveyTask[]> {
  await mockDelay();
  return sections.map((section, index) => ({
    classSectionId: section.id,
    classCode: section.code,
    courseName: section.courseName,
    lecturerName: section.lecturerName,
    submittedAt: index % 3 === 0 ? mockDate(-2 + index, "20:15") : null,
  }));
}
