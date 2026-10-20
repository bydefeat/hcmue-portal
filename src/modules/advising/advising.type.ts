export type AppointmentMode = "in-person" | "online";

export type AppointmentStatus = "scheduled" | "done" | "missed" | "cancelled";

export type AppointmentAttendance = "present" | "absent";

export type AppointmentStudent = {
  id: string;
  code: string;
  fullName: string;
  className: string;
  // Có mặt hay vắng ở buổi này; null là chưa ghi nhận (buổi chưa diễn ra hoặc chưa ghi).
  attendance?: AppointmentAttendance | null;
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
  // Buổi hẹn sinh ra ghi chú; null là ghi chú độc lập.
  appointmentId: string | null;
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

// Lịch hẹn nhìn từ phía sinh viên: không có ghi chú của cố vấn, không có danh sách sinh viên khác (chỉ số người được mời).
export type StudentAppointment = {
  id: string;
  topic: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  mode: AppointmentMode;
  location: string;
  status: AppointmentStatus;
  advisor: string;
  inviteeCount: number;
};

export type StudentAdvisor = {
  className: string;
  displayName: string;
  email: string;
  phone: string;
  office: string;
  officeHours: string;
};
