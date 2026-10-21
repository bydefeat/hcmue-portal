export type ScheduleEvent = {
  id: string;
  title: string;
  code: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  room: string;
  href?: string;
};

export type AttendanceStatus = "present" | "late" | "excused" | "absent";

export type AttendanceSession = {
  id: string;
  date: string;
  startPeriod: number;
  endPeriod: number;
  room: string;
  labGroupId: string | null;
  labGroupCode: string | null;
  isTaken: boolean;
};

export type AttendanceBook = {
  classSectionId: string;
  today: string;
  sessions: AttendanceSession[];
  holidaySessions: { date: string; startPeriod: number; endPeriod: number; labGroupCode: string | null; holiday: string }[];
  records: Record<string, Record<string, AttendanceStatus>>;
  labGroupOf: Record<string, string | null>;
};

export type ScheduleSession = {
  id: string;
  date: string;
  startPeriod: number;
  endPeriod: number;
  room: string;
  title: string;
  code: string;
};

export type Timetable = {
  events: ScheduleEvent[];
  sessions: ScheduleSession[];
  sectionCount: number;
  credits: number;
};

export type SavedAttendance = {
  sessionId: string;
  records: Record<string, AttendanceStatus>;
};

export type MeetingInput = {
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  room: string;
};
