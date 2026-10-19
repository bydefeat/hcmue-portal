export type CourseType = "required" | "elective";

export type KnowledgeBlock = "general" | "foundation" | "major" | "internship";

export type Course = {
  id: string;
  code: string;
  name: string;
  credits: number;
  theoryCredits: number;
  practiceCredits: number;
  faculty: string;
  type: CourseType;
  block: KnowledgeBlock;
  prerequisiteCodes: string[];
  corequisiteCodes: string[];
  equivalentCodes: string[];
  isActive: boolean;
  description: string;
};

export type ProgramStatus = "active" | "draft" | "archived";

export type Major = {
  code: string;
  name: string;
  faculty: string;
};

export type Program = {
  id: string;
  code: string;
  name: string;
  majorCode: string;
  faculty: string;
  degree: string;
  totalCredits: number;
  durationYears: number;
  cohorts: number[];
  status: ProgramStatus;
  updatedAt: string;
};

export type ProgramSummary = Program & {
  courseCount: number;
};

export type ProgramCourse = {
  courseCode: string;
  semester: number;
};

export type ProgramSemester = {
  semester: number;
  credits: number;
  courses: Course[];
};

export type ProgramDetail = Program & {
  semesters: ProgramSemester[];
  plannedCredits: number;
  creditsByBlock: { block: KnowledgeBlock; credits: number }[];
};

export type CourseFormValues = {
  code: string;
  name: string;
  credits: number;
  theoryCredits: number;
  practiceCredits: number;
  faculty: string;
  type: CourseType;
  block: KnowledgeBlock;
  prerequisiteCodes: string[];
  corequisiteCodes: string[];
  equivalentCodes: string[];
  description: string;
  isActive: boolean;
};

export type ProgramFormValues = {
  code: string;
  name: string;
  majorCode: string;
  degree: string;
  totalCredits: number;
  durationYears: number;
  cohorts: number[];
  status: ProgramStatus;
};

export type ProgramCourseChange =
  | { kind: "add"; semester: number; courseCodes: string[] }
  | { kind: "remove"; courseCode: string }
  | { kind: "move"; courseCode: string; semester: number };

export type FrameworkIssueKind = "prerequisite-order" | "prerequisite-missing" | "inactive-course" | "credits-short" | "credits-over";

export type FrameworkIssue = {
  kind: FrameworkIssueKind;
  courseCode: string | null;
  message: string;
};
