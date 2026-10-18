export type AppointmentMode = "in-person" | "online";

export type AppointmentStatus = "scheduled" | "done" | "missed" | "cancelled";

export type AppointmentStudent = {
  id: string;
  code: string;
  fullName: string;
  className: string;
};

export type Appointment = {
  id: string;
  advisorId: string;
  students: AppointmentStudent[];
  topic: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  mode: AppointmentMode;
  location: string;
  status: AppointmentStatus;
  note: string | null;
};

export type MeetingNote = {
  id: string;
  studentId: string;
  at: string;
  author: string;
  topic: string;
  content: string;
  followUp: string | null;
};

export type AppointmentFormValues = {
  studentIds: string[];
  topic: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  mode: AppointmentMode;
  location: string;
};
