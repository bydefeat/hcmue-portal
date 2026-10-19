import type { Metadata } from "next";
import { getCurrentTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { bestGrades, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { getCourses, getPrograms } from "@/modules/curriculum/curriculum.query";
import { PrintableTranscript } from "@/modules/grades/components/printable-transcript";
import { TranscriptView } from "@/modules/grades/components/transcript-view";
import { formatPoint, STANDING_LABEL, WARNING_LEVEL } from "@/modules/grades/grades.constant";
import { getStudentStandings, getTranscript } from "@/modules/grades/grades.query";
import type { TranscriptTerm } from "@/modules/grades/grades.type";
import { getCurrentStudent } from "@/modules/users/users.query";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PrintButton } from "@/shared/components/ui/print-button";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatTile } from "@/shared/components/ui/stat-tile";

export const metadata: Metadata = { title: "Kết quả học tập" };

export default async function Page() {
  const [student, term, courses, programs] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getCourses(), getPrograms()]);
  const [enrollments, transcript, [standing]] = await Promise.all([
    getStudentEnrollments(student.id, term.id),
    getTranscript(student.id),
    getStudentStandings([student.id]),
  ]);
  const timetable = pickTimetable(enrollments, bestGrades(transcript), {
    faculty: student.faculty,
    prerequisites: Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes])),
  });
  const program = programs.find((entry) => entry.majorCode === student.majorCode && entry.cohorts.includes(student.cohort));
  const totalCredits = program?.totalCredits ?? 130;
  const completed = transcript.filter((entry) => !entry.isInProgress);
  // Kỳ đang học: học phần theo thời khóa biểu, điểm lớp nào đã công bố thì hiện luôn.
  const ongoing = transcript.find((entry) => entry.isInProgress);
  const publishedOf = new Map((ongoing?.courses ?? []).map((course) => [course.courseCode, course]));
  const inProgress: TranscriptTerm = {
    termId: term.id,
    termName: term.name,
    isInProgress: true,
    courses: timetable.map(({ section }) => ({
      courseCode: section.courseCode,
      courseName: section.courseName,
      credits: section.credits,
      score10: publishedOf.get(section.courseCode)?.score10 ?? null,
      letter: publishedOf.get(section.courseCode)?.letter ?? null,
      point4: publishedOf.get(section.courseCode)?.point4 ?? null,
    })),
    attemptedCredits: timetable.reduce((sum, { section }) => sum + section.credits, 0),
    earnedCredits: 0,
    gpa4: ongoing?.gpa4 ?? null,
    gpa10: ongoing?.gpa10 ?? null,
    cpa4: null,
  };
  const terms = timetable.length > 0 ? [...completed, inProgress] : completed;
  const lastTerm = completed.at(-1);
  const percent = Math.round((standing.earnedCredits / totalCredits) * 100);

  return (
    <>
      <PrintableTranscript student={student} terms={transcript} standing={standing} />
      <div className="flex flex-col gap-4 print:hidden">
        <PageHeader
          title="Kết quả học tập"
          description="Điểm quy đổi theo thang 4 của quy chế đào tạo tín chỉ. Điểm học kỳ hiện tại hiện sau khi Phòng Đào tạo công bố."
          actions={<PrintButton label="In bảng điểm" />}
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Điểm trung bình tích lũy" value={formatPoint(standing.cpa4)} hint={`Xếp loại ${STANDING_LABEL[standing.standing]}`} />
          <StatTile
            label="Học kỳ gần nhất"
            value={formatPoint(lastTerm?.gpa4 ?? null)}
            hint={lastTerm ? lastTerm.termName.replace("Học kỳ", "HK").replace(", năm học", "") : "Chưa có"}
          />
          <StatTile label="Tín chỉ tích lũy" value={`${standing.earnedCredits}/${totalCredits}`} hint={`Đạt ${percent}% chương trình`} />
          <StatTile
            label="Tín chỉ nợ"
            value={standing.failedCredits}
            hint={standing.warningLevel > 0 ? `Đang bị cảnh báo ${WARNING_LEVEL[standing.warningLevel as 1 | 2 | 3].label.toLowerCase()}` : "Không bị cảnh báo học vụ"}
            tone={standing.warningLevel > 0 ? "danger" : standing.failedCredits > 0 ? "warning" : undefined}
          />
        </div>
        <SectionCard
          title="Tiến độ tốt nghiệp"
          extra={<span className="text-xs text-muted tabular-nums">Còn {Math.max(0, totalCredits - standing.earnedCredits)} tín chỉ</span>}
        >
          <div className="flex flex-col gap-2">
            <MeterBar value={standing.earnedCredits} max={totalCredits} label="Tín chỉ đã tích lũy" />
            <p className="text-xs text-pretty text-muted">
              {program ? `${program.name}, ${program.degree.toLowerCase()} ${program.totalCredits} tín chỉ.` : ""} Xem chi tiết từng học phần ở mục Chương trình đào tạo.
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Bảng điểm theo học kỳ" flush>
          <TranscriptView terms={terms} inCard />
        </SectionCard>
      </div>
    </>
  );
}
