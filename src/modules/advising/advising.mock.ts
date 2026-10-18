import { mockDate, mockLecturerIdentity, mockStudentIdentity } from "@/shared/libs/mock.lib";
import type { Appointment, AppointmentStudent, MeetingNote } from "./advising.type";

const ADVISOR = mockLecturerIdentity(0);

function student(index: number): AppointmentStudent {
  const identity = mockStudentIdentity(index);
  return { id: identity.id, code: identity.code, fullName: identity.fullName, className: identity.className };
}

function dateOnly(offset: number) {
  return mockDate(offset, "00:00").slice(0, 10);
}

export const APPOINTMENTS: Appointment[] = [
  { id: "lh-01", advisorId: ADVISOR.id, students: [student(6)], topic: "Trao đổi về kết quả học tập và rút học phần", date: dateOnly(0), startTime: "14:00", durationMinutes: 30, mode: "in-person", location: "Văn phòng khoa, phòng B.201", status: "scheduled", note: null },
  { id: "lh-02", advisorId: ADVISOR.id, students: [student(54)], topic: "Tư vấn kế hoạch học tập học kỳ 2", date: dateOnly(0), startTime: "16:00", durationMinutes: 30, mode: "online", location: "Google Meet", status: "scheduled", note: null },
  { id: "lh-03", advisorId: ADVISOR.id, students: [student(12), student(60), student(108)], topic: "Sinh hoạt lớp định kỳ", date: dateOnly(2), startTime: "17:30", durationMinutes: 60, mode: "in-person", location: "Phòng B.405", status: "scheduled", note: null },
  { id: "lh-04", advisorId: ADVISOR.id, students: [student(102)], topic: "Hỗ trợ đăng ký học phần", date: dateOnly(4), startTime: "09:00", durationMinutes: 15, mode: "online", location: "Microsoft Teams", status: "scheduled", note: null },
  { id: "lh-05", advisorId: ADVISOR.id, students: [student(60)], topic: "Trao đổi hồ sơ bảo lưu", date: dateOnly(-3), startTime: "10:00", durationMinutes: 30, mode: "in-person", location: "Văn phòng khoa, phòng B.201", status: "done", note: "Sinh viên đã có giấy xác nhận của bệnh viện, hướng dẫn nộp đơn bảo lưu trên cổng." },
  { id: "lh-06", advisorId: ADVISOR.id, students: [student(6)], topic: "Trao đổi về cảnh báo học vụ", date: dateOnly(-9), startTime: "15:00", durationMinutes: 30, mode: "in-person", location: "Văn phòng khoa, phòng B.201", status: "missed", note: "Sinh viên không đến, đã nhắn tin hẹn lại." },
  { id: "lh-07", advisorId: ADVISOR.id, students: [student(156)], topic: "Định hướng chuyên ngành, thực tập", date: dateOnly(-14), startTime: "08:30", durationMinutes: 45, mode: "online", location: "Google Meet", status: "done", note: "Giới thiệu 3 doanh nghiệp nhận thực tập mảng web." },
  { id: "lh-08", advisorId: ADVISOR.id, students: [student(150)], topic: "Tư vấn kế hoạch học tập học kỳ 2", date: dateOnly(-1), startTime: "13:30", durationMinutes: 15, mode: "online", location: "Zalo", status: "cancelled", note: "Sinh viên xin dời lịch." },
];

export const MEETING_NOTES: MeetingNote[] = [
  { id: "gc-01", studentId: "sv-60", at: mockDate(-3, "10:30"), author: ADVISOR.displayName, topic: "Bảo lưu", content: "Sinh viên điều trị dài ngày, đề nghị bảo lưu 1 học kỳ. Đã kiểm tra học phí đã đóng đủ.", followUp: "Theo dõi đơn bảo lưu tại khoa" },
  { id: "gc-02", studentId: "sv-6", at: mockDate(-9, "15:30"), author: ADVISOR.displayName, topic: "Cảnh báo học vụ", content: "Sinh viên vắng buổi hẹn. CPA 1,87, nợ môn Xác suất thống kê.", followUp: "Hẹn lại trong tuần" },
  { id: "gc-03", studentId: "sv-156", at: mockDate(-14, "09:15"), author: ADVISOR.displayName, topic: "Thực tập", content: "Sinh viên muốn thực tập mảng phát triển web. Đã giới thiệu doanh nghiệp đối tác của khoa.", followUp: null },
  { id: "gc-04", studentId: "sv-12", at: mockDate(-30, "16:00"), author: ADVISOR.displayName, topic: "Học vượt", content: "Sinh viên học lực xuất sắc, muốn đăng ký 28 tín chỉ học kỳ 2. Đồng ý hướng dẫn làm đơn.", followUp: null },
];
