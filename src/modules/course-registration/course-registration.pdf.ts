import "server-only";
import { formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { buildPdf } from "@/shared/libs/pdf.lib";
import { meetingText } from "@/modules/course-registration/course-registration.constant";
import type { ClassSectionView, RosterEntry, StudentEnrollment } from "@/modules/course-registration/course-registration.type";

type ReceiptInput = {
  student: { code: string; fullName: string; className: string; majorName: string };
  termName: string;
  enrollments: StudentEnrollment[];
  confirmedAt: string;
  verificationCode: string;
};

// Phiếu đăng ký học phần, cùng nội dung bản in trên trang (mã xác thực để Phòng Đào tạo đối chiếu).
export function registrationReceiptPdf({ student, termName, enrollments, confirmedAt, verificationCode }: ReceiptInput) {
  const totalCredits = enrollments.reduce((sum, { section }) => sum + section.credits, 0);
  return buildPdf({
    title: "Phiếu đăng ký học phần",
    subtitle: termName,
    unit: "Phòng Đào tạo",
    blocks: [
      {
        type: "fields",
        items: [
          { label: "Họ và tên", value: student.fullName },
          { label: "Mã sinh viên", value: student.code },
          { label: "Lớp", value: student.className },
          { label: "Ngành", value: student.majorName },
        ],
      },
      {
        type: "table",
        columns: [{ header: "Lớp học phần" }, { header: "Tên học phần" }, { header: "TC" }, { header: "Lịch học" }, { header: "Giảng viên" }],
        rows: enrollments.map(({ section }) => [
          section.code,
          section.courseName,
          section.credits,
          section.meetings.map(meetingText).join("; "),
          section.lecturerName ?? "Chưa phân công",
        ]),
        emptyText: "Chưa đăng ký lớp học phần nào trong học kỳ này.",
      },
      { type: "paragraph", text: `Tổng: ${enrollments.length} lớp, ${totalCredits} tín chỉ. Xác nhận lúc ${formatDateTime(confirmedAt)}.` },
      { type: "paragraph", bold: true, text: `Mã xác thực ${verificationCode}.` },
      { type: "paragraph", size: 9, text: "Tra cứu tính hợp lệ của phiếu tại Phòng Đào tạo bằng mã này." },
    ],
  });
}

// Danh sách lớp để giảng viên in: điểm danh tay, ký nhận. Cột ghi chú để trống cho giảng viên ghi.
export function classRosterPdf(section: Pick<ClassSectionView, "code" | "courseName" | "credits" | "lecturerName" | "meetings">, termName: string, roster: RosterEntry[]) {
  return buildPdf({
    title: "Danh sách lớp học phần",
    subtitle: `${section.code} · ${section.courseName} · ${termName}`,
    unit: "Phòng Đào tạo",
    blocks: [
      {
        type: "fields",
        items: [
          { label: "Lớp học phần", value: section.code },
          { label: "Học phần", value: `${section.courseName} (${section.credits} tín chỉ)` },
          { label: "Giảng viên", value: section.lecturerName ?? "Chưa phân công" },
          { label: "Sĩ số", value: String(roster.length) },
          { label: "Lịch học", value: section.meetings.map(meetingText).join("; ") },
        ],
      },
      {
        type: "table",
        columns: [{ header: "STT" }, { header: "Mã sinh viên" }, { header: "Họ và tên" }, { header: "Lớp sinh hoạt" }, { header: "Ngày đăng ký" }, { header: "Ghi chú", minWidth: 120 }],
        rows: roster.map((entry, index) => [index + 1, entry.studentCode, entry.fullName, entry.className, formatDate(entry.registeredAt), ""]),
        emptyText: "Lớp chưa có sinh viên.",
      },
    ],
  });
}
