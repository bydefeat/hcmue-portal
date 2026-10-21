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

export type ResultMark = "W" | "I" | "M";

export type ResultLetter = LetterGrade | ResultMark;

export type TranscriptCourseInput = {
  courseCode: string;
  courseName: string;
  credits: number;
  score10: number | null;
  letter: ResultLetter | null;
  point4: number | null;
  isConditional?: boolean;
};

export type TranscriptCourse = TranscriptCourseInput & {
  attempt: number;
  retakeKind: "retake" | "improve" | null;
  replaced: boolean;
};

export type GradingRules = {
  scale: { letter: string; min: number; point4: number }[];
  roundingStep: number;
  isConditional?: boolean;
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
  cpa4: number | null;
  cpa10: number | null;
  earnedCredits: number;
  failedCredits: number;
  retakeCredits: number;
  lastTermGpa4: number | null;
  standing: AcademicStanding | null;
  warningLevel: 0 | 1 | 2 | 3;
};

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
  total: number;
  unranked: number;
  averageCpa: number;
  counts: Record<AcademicStanding, number>;
  warnings: number;
};

export type GradeAmendmentSource = "regrade" | "grade-change" | "manual";

export type GradeAmendmentStatus = "pending" | "approved" | "rejected";

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
  isOwn: boolean;
};
