export type StudyPlanStatus = "draft" | "pending" | "approved" | "returned";

export type StudyPlanCourse = {
  code: string;
  name: string;
  credits: number;
};

export type StudyPlanTerm = {
  termName: string;
  courses: StudyPlanCourse[];
};

export type StudyPlan = {
  id: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  targetTermName: string;
  status: StudyPlanStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  totalCredits: number;
  terms: StudyPlanTerm[];
  studentNote: string;
  advisorComment: string | null;
};
