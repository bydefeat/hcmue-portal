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

export function RegistrationReceipt({ student, termName, enrollments, confirmedAt, verificationCode, variant }: RegistrationReceiptProps) {
  const totalCredits = enrollments.reduce((sum, { section }) => sum + section.credits, 0);
  const isPrint = variant === "print";
  const cell = isPrint ? "border border-black px-1 py-0.5" : "border-b border-border-strong px-3 py-2";

  return (
    <section
      aria-hidden={isPrint || undefined}
      className={isPrint ? "hidden text-xs text-black print:block" : "rounded-xl border border-border-strong bg-surface p-4 sm:p-5"}
    >
      {isPrint && (
        <p className="mb-4 text-center font-medium uppercase">
          Trường Đại học Sư phạm Thành phố Hồ Chí Minh
          <br />
          Phòng Đào tạo
        </p>
      )}
      <h2 className={isPrint ? "text-center text-lg font-semibold uppercase" : "text-lg font-semibold"}>Phiếu đăng ký học phần</h2>
      <p className={isPrint ? "mt-1 text-center" : "text-sm text-muted"}>{termName}</p>
      <div className={`mt-3 grid gap-x-6 gap-y-1 ${isPrint ? "grid-cols-2" : "text-sm sm:grid-cols-2"}`}>
        <p>
          Họ và tên: <span className="font-medium">{student.fullName}</span>
        </p>
        <p>
          Mã sinh viên: <span className="font-mono">{student.code}</span>
        </p>
        <p>Lớp: {student.className}</p>
        <p>Ngành: {student.majorName}</p>
      </div>
      <div className={isPrint ? "mt-3" : "mt-4 overflow-x-auto"}>
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className={isPrint ? "" : "text-xs text-muted"}>
              {["Lớp học phần", "Tên học phần", "TC", "Lịch học", "Giảng viên"].map((label) => (
                <th key={label} className={`${cell} font-medium`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={isPrint ? "" : "text-sm"}>
            {enrollments.map(({ section }) => (
              <tr key={section.id}>
                <td className={`${cell} font-mono`}>{section.code}</td>
                <td className={cell}>{section.courseName}</td>
                <td className={`${cell} text-right tabular-nums`}>{section.credits}</td>
                <td className={cell}>{section.meetings.map(meetingText).join("; ")}</td>
                <td className={cell}>{section.lecturerName ?? "Chưa phân công"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-3 ${isPrint ? "" : "text-sm"}`}>
        Tổng: <span className="font-semibold tabular-nums">{enrollments.length}</span> lớp,{" "}
        <span className="font-semibold tabular-nums">{totalCredits}</span> tín chỉ. Xác nhận lúc <span className="tabular-nums">{formatDateTime(confirmedAt)}</span>.
      </p>
      <p className={`mt-1 ${isPrint ? "" : "text-xs text-muted"}`}>
        Mã xác thực <span className="font-mono">{verificationCode}</span>. Tra cứu tính hợp lệ của phiếu tại Phòng Đào tạo bằng mã này.
      </p>
    </section>
  );
}
