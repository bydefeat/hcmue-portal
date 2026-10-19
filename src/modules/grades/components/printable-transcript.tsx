import { dayjs, formatDate } from "@/shared/libs/date.lib";
import { formatPoint, STANDING_LABEL } from "../grades.constant";
import type { StudentStanding, TranscriptTerm } from "../grades.type";

type PrintableStudent = {
  code: string;
  fullName: string;
  dateOfBirth: string;
  className: string;
  majorName: string;
  faculty: string;
  cohort: number;
};

type PrintableTranscriptProps = {
  student: PrintableStudent;
  terms: TranscriptTerm[];
  standing: StudentStanding;
};

export function PrintableTranscript({ student, terms, standing }: PrintableTranscriptProps) {
  const completed = terms.filter((term) => !term.isInProgress);
  return (
    <section aria-hidden className="hidden text-xs text-black print:block">
      <div className="flex justify-between gap-4">
        <p className="text-center font-medium uppercase">
          Trường Đại học Sư phạm
          <br />
          Thành phố Hồ Chí Minh
        </p>
        <p className="text-center font-medium">
          CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
          <br />
          Độc lập, Tự do, Hạnh phúc
        </p>
      </div>
      <h1 className="mt-6 text-center text-lg font-semibold uppercase">Bảng điểm học tập</h1>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1">
        <p>Họ và tên: {student.fullName}</p>
        <p>Mã sinh viên: {student.code}</p>
        <p>Ngày sinh: {formatDate(student.dateOfBirth)}</p>
        <p>Lớp: {student.className}</p>
        <p>Ngành: {student.majorName}</p>
        <p>Khóa: {student.cohort}</p>
      </div>
      {completed.map((term) => (
        <div key={term.termId} className="mt-4 break-inside-avoid">
          <p className="font-semibold">{term.termName}</p>
          <table className="mt-1 w-full border-collapse">
            <thead>
              <tr>
                {["Mã HP", "Tên học phần", "TC", "Điểm 10", "Điểm chữ", "Điểm 4"].map((label) => (
                  <th key={label} className="border border-black px-1 py-0.5 text-left font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {term.courses.map((course) => (
                <tr key={course.courseCode}>
                  <td className="border border-black px-1 py-0.5 font-mono">{course.courseCode}</td>
                  <td className="border border-black px-1 py-0.5">{course.courseName}</td>
                  <td className="border border-black px-1 py-0.5 text-right">{course.credits}</td>
                  <td className="border border-black px-1 py-0.5 text-right">{formatPoint(course.score10, 1)}</td>
                  <td className="border border-black px-1 py-0.5 text-center">{course.letter}</td>
                  <td className="border border-black px-1 py-0.5 text-right">{formatPoint(course.point4, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1">
            Điểm trung bình học kỳ: {formatPoint(term.gpa4)}. Điểm trung bình tích lũy: {formatPoint(term.cpa4)}. Tín chỉ đạt: {term.earnedCredits}/
            {term.attemptedCredits}.
          </p>
        </div>
      ))}
      <p className="mt-4 font-medium">
        Tổng số tín chỉ tích lũy: {standing.earnedCredits}. Điểm trung bình tích lũy: {formatPoint(standing.cpa4)}. Xếp loại: {STANDING_LABEL[standing.standing]}.
      </p>
      <div className="mt-8 flex justify-end">
        <p className="w-64 text-center">
          TP. Hồ Chí Minh, ngày in {formatDate(dayjs())}
          <br />
          TL. HIỆU TRƯỞNG
          <br />
          TRƯỞNG PHÒNG ĐÀO TẠO
        </p>
      </div>
    </section>
  );
}
