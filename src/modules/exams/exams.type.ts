export type ExamKind = "midterm" | "final";

export type ExamFormat = "written" | "multiple-choice" | "practical" | "oral" | "project";

export type ExamPaperStatus = "not-submitted" | "submitted" | "approved" | "returned";

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
  paperSubmittedAt: string | null;
  // Chỉ có với giảng viên dạy lớp và Phòng Khảo thí; sinh viên, cán bộ coi thi nhận mảng rỗng.
  papers: ExamPaperFile[];
  // Lần duyệt hoặc trả lại gần nhất của Phòng Khảo thí; cùng điều kiện hiện như `papers`, chưa xét thì null.
  paperReview: ExamPaperReview | null;
  swapRequests: ExamSwapRequest[];
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

// Đề nghị đổi ca coi thi đang chờ Phòng Khảo thí xử lý.
export type ExamSwapRequest = {
  requesterId: string;
  requesterName: string;
  substituteId: string;
  substituteName: string;
  reason: string;
  createdAt: string;
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
  absences: number;
  sessions: number;
  ratio: number;
  overrideReason: string | null;
};

// Số buổi vắng của sinh viên trong một lớp, tính trên các buổi giảng viên đã điểm danh.
export type ExamAttendance = {
  classSectionId: string;
  absences: number;
  sessionsHeld: number;
  overrideReason: string | null;
};

export type ExamConflict = {
  examId: string;
  message: string;
};
