export type GradeComponent = {
  key: string;
  label: string;
  weight: number;
};

export type GradeSheetStatus = "draft" | "locked" | "approved" | "published" | "returned";

export type ScoreRow = Record<string, number | null>;

export type GradeSheet = {
  classSectionId: string;
  components: GradeComponent[];
  status: GradeSheetStatus;
  deadline: string;
  lockedAt: string | null;
  savedAt: string | null;
  returnReason: string | null;
  scores: Record<string, ScoreRow>;
};

export type GradeSheetState = "published" | "approved" | "locked" | "returned" | "overdue" | "due-soon" | "in-progress";

export type GradeSheetSummary = {
  classSectionId: string;
  status: GradeSheetStatus;
  state: GradeSheetState;
  deadline: string;
  filledCells: number;
  totalCells: number;
};

export type LetterGrade = "A" | "B+" | "B" | "C+" | "C" | "D+" | "D" | "F";

// Ký hiệu kết quả không có điểm số: W rút học phần, I chưa hoàn thiện (hoãn thi), M miễn học phần. W, I không tính GPA/CPA, không
// tính tín chỉ tích lũy và không thay lần học trước đã có điểm; M tính tín chỉ tích lũy, không tính CPA.
export type ResultMark = "W" | "I" | "M";

export type ResultLetter = LetterGrade | ResultMark;

export type TranscriptCourseInput = {
  courseCode: string;
  courseName: string;
  credits: number;
  score10: number | null;
  letter: ResultLetter | null;
  point4: number | null;
};

// Một lần học của học phần trong bảng điểm. Điểm tính vào CPA và tín chỉ tích lũy là của lần học cuối (đã có điểm, học kỳ đã kết thúc);
// lần trước đó vẫn hiện trong bảng điểm nhưng ghi là đã được thay thế.
export type TranscriptCourse = TranscriptCourseInput & {
  // Lần học thứ mấy (1 là lần đầu).
  attempt: number;
  // Học lại sau khi trượt, hoặc học cải thiện khi lần trước đã đạt.
  retakeKind: "retake" | "improve" | null;
  // Đã có lần học sau (đã có điểm) thay thế.
  replaced: boolean;
};

// Quy đổi điểm theo bản quy chế đang áp dụng: thang điểm chữ và bước làm tròn điểm tổng kết.
export type GradingRules = {
  scale: { letter: string; min: number; point4: number }[];
  roundingStep: number;
};

export type TranscriptTerm = {
  termId: string;
  termName: string;
  courses: TranscriptCourse[];
  attemptedCredits: number;
  earnedCredits: number;
  gpa4: number | null;
  gpa10: number | null;
  cpa4: number | null;
  isInProgress: boolean;
};

export type AcademicStanding = "excellent" | "very-good" | "good" | "average" | "weak" | "poor";

export type StudentStanding = {
  studentId: string;
  // null khi chưa có học phần nào có điểm (Chưa xếp loại).
  cpa4: number | null;
  cpa10: number | null;
  earnedCredits: number;
  // Tín chỉ các học phần mà lần học cuối là F.
  failedCredits: number;
  // Tổng tín chỉ các lần học bị F (khối lượng phải học lại), dùng để xét giảm hạng tốt nghiệp.
  retakeCredits: number;
  lastTermGpa4: number | null;
  standing: AcademicStanding | null;
  // Mức cảnh báo dự báo theo điểm hiện có và ngưỡng quy chế; cảnh báo chính thức là dòng academic_warnings đã gửi.
  warningLevel: 0 | 1 | 2 | 3;
};

// Cảnh báo chính thức đang có hiệu lực: cảnh báo đã gửi thông báo của học kỳ có cảnh báo đã ban hành gần nhất.
export type CurrentWarning = { level: 1 | 2 | 3; termId: string; termName: string };

export type ExpulsionProposal = {
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  faculty: string;
  consecutiveWarnings: number;
  level: 1 | 2 | 3;
  cpa4: number;
  reasons: string[];
};

export type WarningStatus = "new" | "notified" | "resolved";

export type AcademicWarning = {
  id: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  faculty: string;
  cohort: number;
  termName: string;
  termGpa4: number;
  cpa4: number;
  failedCredits: number;
  level: 1 | 2 | 3;
  reasons: string[];
  status: WarningStatus;
  createdAt: string;
};

export type FacultyStandingSummary = {
  faculty: string;
  // Sinh viên đã xếp loại (có điểm); chưa có điểm đếm riêng ở unranked, không tính vào phân bố và CPA trung bình.
  total: number;
  unranked: number;
  averageCpa: number;
  counts: Record<AcademicStanding, number>;
  warnings: number;
};

export type GradeAmendmentSource = "regrade" | "grade-change" | "manual";

export type GradeAmendmentStatus = "pending" | "approved" | "rejected";

// Một đề nghị sửa điểm sau khi bảng điểm đã chốt hoặc công bố (một cột điểm của một sinh viên).
export type GradeAmendment = {
  id: string;
  classSectionId: string;
  classCode: string;
  courseName: string;
  termName: string;
  faculty: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  componentLabel: string;
  oldScore: number | null;
  newScore: number;
  reason: string;
  source: GradeAmendmentSource;
  requestCode: string | null;
  status: GradeAmendmentStatus;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  resultBefore: string | null;
  resultAfter: string | null;
  // Người đang xem là người đề nghị: không tự duyệt được (server cũng chặn).
  isOwn: boolean;
};
