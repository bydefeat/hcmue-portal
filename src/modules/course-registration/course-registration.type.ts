export type Term = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isRegistrationTarget: boolean;
};

export type RegistrationPeriodState = "upcoming" | "open" | "closing" | "closed";

export type RegistrationPeriod = {
  id: string;
  termId: string;
  name: string;
  cohorts: number[];
  opensAt: string;
  closesAt: string;
  minCredits: number;
  maxCredits: number;
  eligibleStudents: number;
  registeredStudents: number;
};

export type RegistrationPeriodView = RegistrationPeriod & {
  state: RegistrationPeriodState;
  hoursLeft: number;
};

export type ClassMeeting = {
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  room: string;
};

export type ClassSectionStatus = "draft" | "open" | "cancelled";

export type ClassSection = {
  id: string;
  code: string;
  termId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  faculty: string;
  lecturerId: string | null;
  lecturerName: string | null;
  capacity: number;
  enrolled: number;
  meetings: ClassMeeting[];
  status: ClassSectionStatus;
  startDate: string;
  endDate: string;
};

export type ClassConflict = {
  kind: "room" | "lecturer";
  withCode: string;
  message: string;
};

export type ClassSectionView = ClassSection & {
  isFull: boolean;
  conflicts: ClassConflict[];
};

export type RosterEntry = {
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  registeredAt: string;
};

export type FacultyRegistrationSummary = {
  faculty: string;
  sections: number;
  capacity: number;
  enrolled: number;
  fullSections: number;
};

export type ClassSectionFormValues = {
  courseCode: string;
  sectionNumber: number;
  lecturerId?: string;
  capacity: number;
  status: ClassSectionStatus;
  meetings: ClassMeeting[];
};

export type RegistrationPeriodFormValues = {
  name: string;
  cohorts: number[];
  range: [string, string];
  minCredits: number;
  maxCredits: number;
};
