export type ExamKind = "midterm" | "final" | "makeup";

export type ExamFormat = "written" | "multiple-choice" | "practical" | "oral" | "project";

export type ExamPaperStatus = "not-submitted" | "submitted" | "approved" | "returned";

export type ExamSessionStatus = "draft" | "published" | "done";

export type ExamSwapDecision = "accepted" | "rejected" | "withdrawn";

export type Proctor = {
  id: string;
  name: string;
  // Phòng người này coi trong ca (mã phòng).
  room: string;
};

// Một phòng của ca thi: số thí sinh xếp vào phòng và cán bộ coi phòng đó.
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
  // Ca thi bù: ca gốc (giữa kỳ hoặc cuối kỳ) mà ca này thi bù.
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
  // Số thí sinh đã xếp phòng (ca giữa kỳ, cuối kỳ: sinh viên đang học trừ người được hoãn).
  candidateCount: number;
  // Số sinh viên cần xếp: đang học lớp trừ người được hoãn (ca thi bù: số đã chọn). Lệch với candidateCount là cần xếp lại.
  expectedCandidates: number;
  proctors: Proctor[];
  status: ExamSessionStatus;
  // Đã tới giờ thi (giờ Việt Nam): không sửa ca, không nộp, duyệt đề, không đổi ca coi thi nữa.
  hasStarted: boolean;
  paperStatus: ExamPaperStatus;
  paperDeadline: string;
  paperSubmittedAt: string | null;
  // Chỉ có với giảng viên dạy lớp và Phòng Khảo thí; sinh viên, cán bộ coi thi nhận mảng rỗng.
  papers: ExamPaperFile[];
  // Lần duyệt hoặc trả lại gần nhất của Phòng Khảo thí; cùng điều kiện hiện như `papers`, chưa xét thì null.
  paperReview: ExamPaperReview | null;
  swapRequests: ExamSwapRequest[];
  // Xung đột tính trên toàn học kỳ (trùng phòng, cán bộ coi thi, sinh viên, giờ dạy của cán bộ coi thi).
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

// Đề nghị đổi ca coi thi; đang chờ thì decision null.
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

// Lịch thi nhìn từ phía sinh viên: chỉ trường công khai của ca đã công bố, kèm phòng và số báo danh của chính sinh viên.
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

// Chuyên cần của sinh viên trong một lớp: số tiết vắng trên tổng số tiết kế hoạch của lớp (nhóm thực hành của sinh viên).
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
  // Trùng phòng, trùng cán bộ coi thi: chặn hẳn; trùng sinh viên, trùng giờ dạy: lưu được khi ghi lý do.
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
  kind: ExamKind;
  studentCode: string;
  fullName: string;
  sectionCode: string;
  courseName: string;
  faculty: string;
  reason: string;
  decidedAt: string;
  // Đã có ca thi bù chứa sinh viên này.
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
