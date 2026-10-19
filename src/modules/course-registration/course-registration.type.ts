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
  minEnrollment: number;
  audience: SectionAudience | null;
  reservedSeats: ReservedSeat[];
  labGroups: LabGroup[];
};

export type SectionAudience = {
  majorCodes: string[];
  cohorts: number[];
  note: string;
};

export type ReservedSeat = {
  label: string;
  seats: number;
  taken: number;
  majorCodes: string[];
  cohorts: number[];
};

export type LabGroup = {
  id: string;
  code: string;
  meeting: ClassMeeting;
  capacity: number;
  enrolled: number;
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
  minEnrollment: number;
  audienceMajors: string[];
  audienceCohorts: number[];
  audienceNote?: string;
  reservedSeats: { label: string; seats: number; majorCodes: string[]; cohorts: number[] }[];
  labGroups: { code: string; dayOfWeek: number; startPeriod: number; endPeriod: number; room: string; capacity: number }[];
};

export type RegistrationPeriodFormValues = {
  name: string;
  cohorts: number[];
  range: [string, string];
  minCredits: number;
  maxCredits: number;
};

export type StudentEnrollment = {
  section: ClassSectionView;
  registeredAt: string;
};

export type LecturerWorkload = {
  lecturerId: string;
  lecturerName: string;
  faculty: string;
  title: string;
  sectionCodes: string[];
  periodsPerWeek: number;
  teachingHours: number;
  standardHours: number;
  normHours: number;
};

export type HoldKind = "tuition" | "discipline" | "documents" | "academic-status" | "advisor";

export type RegistrationHold = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  className: string;
  faculty: string;
  kind: HoldKind;
  blocking: boolean;
  reason: string;
  resolveHint: string;
  createdAt: string;
  createdBy: string;
  releasedAt: string | null;
  releasedBy: string | null;
};

export type RegistrationEventKind = "add" | "drop" | "swap" | "waitlist" | "waitlist-promoted" | "admin-add" | "admin-drop" | "section-cancelled";

export type RegistrationEvent = {
  id: string;
  at: string;
  kind: RegistrationEventKind;
  sectionCode: string;
  courseName: string;
  actor: string;
  channel: string;
  note: string;
};

export type RegistrationQueueStatus = {
  waiting: number;
  activeSessions: number;
  sessionLimit: number;
  admittedPerMinute: number;
  averageWaitSeconds: number;
  peakWaitingToday: number;
};
