import "server-only";
import { formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { buildPdf } from "@/shared/libs/pdf.lib";
import { formatPoint, standingLabel } from "@/modules/grades/grades.constant";
import { attemptNote, CONDITIONAL_COURSE_NOTE, letterOf, resultMark, resultPoint4, weightedScore } from "@/modules/grades/grades.rule";
import type { GradeComponent, GradingRules, ScoreRow, StudentStanding, TranscriptTerm } from "@/modules/grades/grades.type";

type TranscriptStudent = { code: string; fullName: string; dateOfBirth: string; className: string; majorName: string; faculty: string; cohort: number };

// Bảng điểm cá nhân theo đúng nội dung bản in trên trang: các học kỳ đã có kết quả, mỗi kỳ một bảng kèm điểm trung bình.
export function transcriptPdf(student: TranscriptStudent, terms: TranscriptTerm[], standing: StudentStanding) {
  const completed = terms.filter((term) => !term.isInProgress);
  return buildPdf({
    title: "Bảng điểm học tập",
    subtitle: `${student.fullName} · ${student.code}`,
    unit: "Phòng Đào tạo",
    motto: true,
    blocks: [
      {
        type: "fields",
        items: [
          { label: "Họ và tên", value: student.fullName },
          { label: "Mã sinh viên", value: student.code },
          { label: "Ngày sinh", value: formatDate(student.dateOfBirth) },
          { label: "Lớp", value: student.className },
          { label: "Ngành", value: student.majorName },
          { label: "Khóa", value: String(student.cohort) },
          { label: "Khoa", value: student.faculty },
        ],
      },
      ...(completed.length === 0 ? [{ type: "paragraph" as const, text: "Chưa có học kỳ nào có kết quả." }] : []),
      ...completed.flatMap((term) => [
        {
          type: "table" as const,
          caption: term.termName,
          columns: [{ header: "Mã HP" }, { header: "Tên học phần" }, { header: "TC" }, { header: "Điểm 10" }, { header: "Điểm chữ", align: "center" as const }, { header: "Điểm 4" }],
          rows: term.courses.map((course) => [
            course.courseCode,
            `${course.courseName}${attemptNote(course)}`,
            course.credits,
            formatPoint(course.score10, 1),
            resultMark(course),
            formatPoint(resultPoint4(course), 1),
          ]),
        },
        {
          type: "paragraph" as const,
          size: 9,
          text: `Điểm trung bình học kỳ: ${formatPoint(term.gpa4)}. Điểm trung bình tích lũy: ${formatPoint(term.cpa4)}. Tín chỉ đạt: ${term.earnedCredits}/${term.attemptedCredits}.`,
        },
      ]),
      {
        type: "paragraph",
        bold: true,
        text: `Tổng số tín chỉ tích lũy: ${standing.earnedCredits}. Điểm trung bình tích lũy: ${formatPoint(standing.cpa4) || "chưa có"}. Xếp loại: ${standingLabel(standing.standing)}.`,
      },
      { type: "paragraph", size: 8.5, text: "Học phần học lại hoặc học cải thiện: điểm tính vào điểm trung bình tích lũy là điểm của lần học cuối." },
      { type: "paragraph", size: 8.5, text: `${CONDITIONAL_COURSE_NOTE}.` },
      { type: "paragraph", size: 8.5, text: "Bảng điểm tra cứu từ cổng thông tin đào tạo, dùng để tham khảo. Bản có giá trị xác nhận do Phòng Đào tạo cấp." },
    ],
  });
}

type GradeSheetPdfInput = {
  classCode: string;
  courseName: string;
  termName: string;
  lecturerName: string;
  statusLabel: string;
  lockedAt: string | null;
  components: GradeComponent[];
  students: { studentId: string; studentCode: string; fullName: string }[];
  scores: Record<string, ScoreRow>;
  grading: GradingRules;
};

// Bảng điểm lớp đã chốt để giảng viên in, ký nộp khoa: điểm thành phần, tổng, điểm chữ, thống kê đạt / không đạt.
export function gradeSheetPdf(input: GradeSheetPdfInput) {
  const totals = input.students.map((student) => weightedScore(input.components, input.scores[student.studentId] ?? {}, input.grading.roundingStep));
  const graded = totals.filter((total): total is number => total !== null);
  const failed = graded.filter((total) => letterOf(total, input.grading.scale).letter === "F").length;
  return buildPdf({
    title: "Bảng điểm lớp học phần",
    subtitle: `${input.classCode} · ${input.courseName} · ${input.termName}`,
    unit: "Phòng Đào tạo",
    // Cột điểm ngắn: khổ dọc đủ chỗ cho tới 4 cột thành phần, nhiều hơn mới xoay ngang.
    landscape: input.components.length > 4,
    blocks: [
      {
        type: "fields",
        items: [
          { label: "Lớp học phần", value: input.classCode },
          { label: "Học phần", value: input.courseName },
          { label: "Giảng viên", value: input.lecturerName },
          { label: "Học kỳ", value: input.termName },
          { label: "Trạng thái", value: input.statusLabel },
          { label: "Chốt lúc", value: input.lockedAt ? formatDateTime(input.lockedAt) : "" },
        ],
      },
      {
        type: "table",
        columns: [
          { header: "STT" },
          { header: "MSSV" },
          { header: "Họ và tên" },
          ...input.components.map((component) => ({ header: `${component.label} (${component.weight}%)` })),
          { header: "Tổng" },
          { header: "Điểm chữ", align: "center" },
        ],
        rows: input.students.map((student, index) => {
          const row = input.scores[student.studentId] ?? {};
          const total = totals[index];
          return [
            index + 1,
            student.studentCode,
            student.fullName,
            ...input.components.map((component) => formatPoint(row[component.key] ?? null, 1)),
            formatPoint(total, 1),
            total === null ? "" : resultMark({ letter: letterOf(total, input.grading.scale).letter, isConditional: input.grading.isConditional }),
          ];
        }),
        emptyText: "Lớp chưa có sinh viên.",
      },
      {
        type: "paragraph",
        text: `Sĩ số: ${input.students.length}. Có điểm tổng: ${graded.length}. Đạt: ${graded.length - failed}. Không đạt: ${failed}.`,
      },
      { type: "signature", place: `TP. Hồ Chí Minh, ngày ${formatDate(new Date())}`, lines: ["GIẢNG VIÊN"], name: input.lecturerName },
    ],
  });
}
