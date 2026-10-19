import { Table } from "antd";
import { SectionCard } from "@/shared/components/ui/section-card";
import { formatDateTime } from "@/shared/libs/date.lib";
import { meetingText } from "../course-registration.constant";
import type { StudentEnrollment } from "../course-registration.type";

type ReceiptStudent = {
  code: string;
  fullName: string;
  className: string;
  majorName: string;
};

type RegistrationReceiptProps = {
  student: ReceiptStudent;
  termName: string;
  enrollments: StudentEnrollment[];
  confirmedAt: string;
  verificationCode: string;
  variant: "screen" | "print";
};

const SCREEN_COLUMNS = [
  { title: "Lớp học phần", dataIndex: "code", key: "code" },
  { title: "Tên học phần", dataIndex: "courseName", key: "courseName" },
  { title: "TC", dataIndex: "credits", key: "credits", align: "right" as const, className: "tabular-nums" },
  { title: "Lịch học", dataIndex: "schedule", key: "schedule" },
  { title: "Giảng viên", dataIndex: "lecturer", key: "lecturer" },
];

export function RegistrationReceipt({ student, termName, enrollments, confirmedAt, verificationCode, variant }: RegistrationReceiptProps) {
  const totalCredits = enrollments.reduce((sum, { section }) => sum + section.credits, 0);
  const rows = enrollments.map(({ section }) => ({
    key: section.id,
    code: section.code,
    courseName: section.courseName,
    credits: section.credits,
    schedule: section.meetings.map(meetingText).join("; "),
    lecturer: section.lecturerName ?? "Chưa phân công",
  }));

  if (variant === "screen") {
    return (
      <SectionCard title="Phiếu đăng ký học phần" extra={<span className="text-xs text-muted">{termName}</span>}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <p>
              Họ và tên: <span className="font-medium">{student.fullName}</span>
            </p>
            <p>
              Mã sinh viên: {student.code}
            </p>
            <p>Lớp: {student.className}</p>
            <p>Ngành: {student.majorName}</p>
          </div>
          <Table size="small" columns={SCREEN_COLUMNS} dataSource={rows} pagination={false} scroll={{ x: 560 }} />
          <div className="flex flex-col gap-1">
            <p className="text-sm">
              Tổng: <span className="font-semibold tabular-nums">{enrollments.length}</span> lớp,{" "}
              <span className="font-semibold tabular-nums">{totalCredits}</span> tín chỉ. Xác nhận lúc <span className="tabular-nums">{formatDateTime(confirmedAt)}</span>.
            </p>
            <p className="text-xs text-muted">
              Mã xác thực {verificationCode}. Tra cứu tính hợp lệ của phiếu tại Phòng Đào tạo bằng mã này.
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const cell = "border border-black px-1 py-0.5";

  return (
    <section aria-hidden className="hidden text-xs text-black print:block">
      <p className="mb-4 text-center font-medium uppercase">
        Trường Đại học Sư phạm Thành phố Hồ Chí Minh
        <br />
        Phòng Đào tạo
      </p>
      <h2 className="text-center text-lg font-semibold uppercase">Phiếu đăng ký học phần</h2>
      <p className="mt-1 text-center">{termName}</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
        <p>
          Họ và tên: <span className="font-medium">{student.fullName}</span>
        </p>
        <p>
          Mã sinh viên: {student.code}
        </p>
        <p>Lớp: {student.className}</p>
        <p>Ngành: {student.majorName}</p>
      </div>
      <div className="mt-3">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {SCREEN_COLUMNS.map((column) => (
                <th key={column.key} className={`${cell} font-medium`}>
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className={cell}>{row.code}</td>
                <td className={cell}>{row.courseName}</td>
                <td className={`${cell} text-right tabular-nums`}>{row.credits}</td>
                <td className={cell}>{row.schedule}</td>
                <td className={cell}>{row.lecturer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3">
        Tổng: <span className="font-semibold tabular-nums">{enrollments.length}</span> lớp,{" "}
        <span className="font-semibold tabular-nums">{totalCredits}</span> tín chỉ. Xác nhận lúc <span className="tabular-nums">{formatDateTime(confirmedAt)}</span>.
      </p>
      <p className="mt-1">
        Mã xác thực {verificationCode}. Tra cứu tính hợp lệ của phiếu tại Phòng Đào tạo bằng mã này.
      </p>
    </section>
  );
}
