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
  // Ngày hôm nay theo giờ Việt Nam do server tính, để giao diện không xét ngày theo giờ máy người dùng.
  today: string;
  sessions: AttendanceSession[];
  // Buổi theo lịch tuần rơi vào ngày nghỉ lễ: không có buổi học, cần xếp dạy bù.
  holidaySessions: { date: string; startPeriod: number; endPeriod: number; labGroupCode: string | null; holiday: string }[];
  records: Record<string, Record<string, AttendanceStatus>>;
  labGroupOf: Record<string, string | null>;
};

// Một buổi học thật (đã trừ ngày nghỉ lễ), dùng để xuất .ics theo đúng ngày học.
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
