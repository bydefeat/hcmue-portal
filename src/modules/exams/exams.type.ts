export type ExamKind = "midterm" | "final" | "makeup";

export type ExamFormat = "written" | "multiple-choice" | "practical" | "oral" | "project";

export type ExamPaperStatus = "not-submitted" | "submitted" | "approved" | "returned";

export type ExamSessionStatus = "draft" | "published" | "done";

export type ExamSwapDecision = "accepted" | "rejected" | "withdrawn";

export type Proctor = {
  id: string;
  name: string;
  room: string;
};

export type ExamRoom = {
  id: string;
  roomId: string;
  code: string;
  examCapacity: number;
  candidates: number;
  proctors: { id: string; name: string }[];
};

export type ExamSession = {
  id: string;
  termId: string;
  kind: ExamKind;
  makeupOfKind: ExamKind | null;
  classSectionId: string;
  classCode: string;
  courseName: string;
  lecturerId: string | null;
  lecturerName: string | null;
  faculty: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  rooms: ExamRoom[];
  format: ExamFormat;
  candidateCount: number;
  expectedCandidates: number;
  proctors: Proctor[];
  status: ExamSessionStatus;
  hasStarted: boolean;
  paperStatus: ExamPaperStatus;
  paperDeadline: string;
  paperSubmittedAt: string | null;
  papers: ExamPaperFile[];
  paperReview: ExamPaperReview | null;
  swapRequests: ExamSwapRequest[];
  conflicts: ExamConflict[];
};

export type ExamPaperReview = {
  reviewerName: string | null;
  reviewedAt: string;
  returnReason: string | null;
};

export type ExamPaperFileKind = "paper" | "answer-key";

export type ExamPaperFile = {
  kind: ExamPaperFileKind;
  fileName: string;
  sizeBytes: number;
};

export type ExamSwapRequest = {
  id: string;
  requesterId: string;
  requesterName: string;
  substituteId: string;
  substituteName: string;
  reason: string;
  createdAt: string;
  decision: ExamSwapDecision | null;
  resolvedAt: string | null;
  resolveNote: string | null;
};

export type StudentExam = {
  id: string;
  kind: ExamKind;
  makeupOfKind: ExamKind | null;
  classSectionId: string;
  classCode: string;
  courseName: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  format: ExamFormat;
  status: ExamSessionStatus;
  room: string | null;
  candidateNumber: number | null;
};

export type ExamEligibilityRow = {
  key: string;
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  sectionCode: string;
  courseName: string;
  faculty: string;
  absentPeriods: number;
  plannedPeriods: number;
  ratio: number;
  overrideReason: string | null;
};

export type ExamAttendance = {
  classSectionId: string;
  absentPeriods: number;
  plannedPeriods: number;
  heldPeriods: number;
  overrideReason: string | null;
};

export type ExamConflictKind = "room" | "proctor" | "student" | "teaching";

export type ExamConflict = {
  kind: ExamConflictKind;
  isHard: boolean;
  message: string;
};

export type ExamRosterRow = {
  enrollmentId: string;
  candidateNumber: number;
  room: string;
  studentCode: string;
  fullName: string;
  className: string;
};

export type ExamDeferralRow = {
  id: string;
  enrollmentId: string;
  classSectionId: string;
  kind: ExamKind;
  studentCode: string;
  fullName: string;
  sectionCode: string;
  courseName: string;
  faculty: string;
  reason: string;
  decidedAt: string;
  hasMakeup: boolean;
};

export type ExamClassOption = {
  id: string;
  code: string;
  courseName: string;
  faculty: string;
  enrolled: number;
  hasMidterm: boolean;
  hasFinal: boolean;
};
