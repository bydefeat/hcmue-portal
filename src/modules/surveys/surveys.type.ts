export type SurveyQuestion = {
  id: string;
  group: string;
  text: string;
};

export type Survey = {
  id: string;
  termId: string;
  title: string;
  opensAt: string;
  closesAt: string;
  questions: SurveyQuestion[];
};

export type SectionSurveyResult = {
  classSectionId: string;
  classCode: string;
  courseName: string;
  lecturerId: string | null;
  lecturerName: string | null;
  faculty: string;
  enrolled: number;
  responses: number;
  averages: Record<string, number>;
  overall: number;
  comments: string[];
};

export type StudentSurveyTask = {
  classSectionId: string;
  classCode: string;
  courseName: string;
  lecturerName: string | null;
  submittedAt: string | null;
};
