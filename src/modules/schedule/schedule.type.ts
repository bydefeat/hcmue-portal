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
  // Buổi thực hành chỉ điểm danh sinh viên của nhóm đó; null là buổi của cả lớp.
  labGroupId: string | null;
  labGroupCode: string | null;
  isTaken: boolean;
};

export type AttendanceBook = {
  classSectionId: string;
  sessions: AttendanceSession[];
  records: Record<string, Record<string, AttendanceStatus>>;
  labGroupOf: Record<string, string | null>;
};

export type Timetable = {
  events: ScheduleEvent[];
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
