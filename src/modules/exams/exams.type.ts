export type ExamKind = "midterm" | "final";

export type ExamFormat = "written" | "multiple-choice" | "practical" | "oral" | "project";

export type ExamPaperStatus = "not-submitted" | "submitted" | "approved";

export type ExamSessionStatus = "draft" | "published" | "done";

export type Proctor = {
  id: string;
  name: string;
};

export type ExamSession = {
  id: string;
  termId: string;
  kind: ExamKind;
  classSectionId: string;
  classCode: string;
  courseName: string;
  lecturerId: string | null;
  lecturerName: string | null;
  faculty: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  room: string;
  format: ExamFormat;
  candidateCount: number;
  proctors: Proctor[];
  status: ExamSessionStatus;
  paperStatus: ExamPaperStatus;
  paperDeadline: string;
};

export type ExamConflict = {
  examId: string;
  message: string;
};
