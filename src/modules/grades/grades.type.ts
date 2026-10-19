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

export type TranscriptCourse = {
  courseCode: string;
  courseName: string;
  credits: number;
  score10: number | null;
  letter: LetterGrade | null;
  point4: number | null;
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
  cpa4: number;
  cpa10: number;
  earnedCredits: number;
  failedCredits: number;
  lastTermGpa4: number;
  standing: AcademicStanding;
  warningLevel: 0 | 1 | 2 | 3;
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
  averageCpa: number;
  counts: Record<AcademicStanding, number>;
  warnings: number;
};
