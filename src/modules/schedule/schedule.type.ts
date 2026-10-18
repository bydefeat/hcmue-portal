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
  isTaken: boolean;
};

export type AttendanceBook = {
  classSectionId: string;
  sessions: AttendanceSession[];
  records: Record<string, Record<string, AttendanceStatus>>;
};

export type MeetingInput = {
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  room: string;
};
