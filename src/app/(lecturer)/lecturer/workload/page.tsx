import type { Metadata } from "next";
import Link from "next/link";
import {
  getCurrentTerm,
  getLecturerClassSections,
  getLecturerWorkloads,
  getRegistrationTargetTerm,
} from "@/modules/course-registration/course-registration.query";
import type { ClassSectionView, LecturerWorkload } from "@/modules/course-registration/course-registration.type";
import { LecturerSurveyResults } from "@/modules/surveys/components/lecturer-survey-results";
import { getFacultySurveyAverage, getSurvey, getSurveyResultsForLecturer } from "@/modules/surveys/surveys.query";
import { getCurrentLecturer } from "@/modules/users/users.query";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { periodLabel, weekdayLabel } from "@/shared/constants/period.constant";

export const metadata: Metadata = { title: "Khối lượng giảng dạy" };

const TEACHING_WEEKS = 15;

function sizeFactor(enrolled: number) {
  if (enrolled > 80) return 1.3;
  if (enrolled > 50) return 1.15;
  return 1;
}

function periodsOf(section: ClassSectionView) {
  return section.meetings.reduce((sum, meeting) => sum + meeting.endPeriod - meeting.startPeriod + 1, 0);
}

function TermLoad({ title, workload, sections }: { title: string; workload: LecturerWorkload | undefined; sections: ClassSectionView[] }) {
  const standard = workload?.standardHours ?? 0;
  const norm = workload?.normHours ?? 0;
  const ratio = norm > 0 ? Math.round((standard / norm) * 100) : 0;
  return (
    <SectionCard title={title}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <MeterBar value={standard} max={norm} tone={ratio > 130 ? "warning" : "primary"} label={`Giờ chuẩn ${title}`} />
          <span className={`shrink-0 text-sm tabular-nums ${ratio > 130 || ratio < 80 ? "text-amber-700" : "text-muted"}`}>
            {standard}/{norm} giờ chuẩn, {ratio}% định mức
          </span>
        </div>
        {sections.length === 0 ? (
          <EmptyState illustration="board" title="Chưa được phân công lớp" description="Khoa sẽ phân công trước khi mở đăng ký học phần." />
        ) : (
          <ul className="flex flex-col divide-y divide-border-strong">
            {sections.map((section) => {
              const periods = periodsOf(section);
              const hours = Math.round(periods * TEACHING_WEEKS * sizeFactor(section.enrolled));
              return (
                <li key={section.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{section.courseName}</span>
                    <span className="text-xs text-muted">
                      {section.code} ·{" "}
                      {section.meetings.map((meeting) => `${weekdayLabel(meeting.dayOfWeek)}, ${periodLabel(meeting.startPeriod, meeting.endPeriod)}`).join("; ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-4 text-sm text-muted tabular-nums sm:w-72 sm:justify-end">
                    <span>{section.enrolled} SV</span>
                    <span>{periods} tiết/tuần</span>
                    <span className="font-medium text-foreground">{hours} giờ chuẩn</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

export default async function Page() {
  const [lecturer, currentTerm, targetTerm] = await Promise.all([getCurrentLecturer(), getCurrentTerm(), getRegistrationTargetTerm()]);
  const [currentLoads, targetLoads, currentSections, targetSections, survey, mine, facultyAverage] = await Promise.all([
    getLecturerWorkloads(currentTerm.id),
    getLecturerWorkloads(targetTerm.id),
    getLecturerClassSections(lecturer.id, currentTerm.id),
    getLecturerClassSections(lecturer.id, targetTerm.id),
    getSurvey(),
    getSurveyResultsForLecturer(),
    getFacultySurveyAverage(),
  ]);
  const current = currentLoads.find((entry) => entry.lecturerId === lecturer.id);
  const target = targetLoads.find((entry) => entry.lecturerId === lecturer.id);
  const yearHours = (current?.standardHours ?? 0) + (target?.standardHours ?? 0);
  const yearNorm = (current?.normHours ?? 0) + (target?.normHours ?? 0);
  const myAverage = mine.length > 0 ? mine.reduce((sum, result) => sum + result.overall, 0) / mine.length : null;

  return (
    <>
      <PageHeader
        title="Khối lượng giảng dạy"
        description={`Giờ chuẩn quy đổi theo sĩ số lớp: trên 50 sinh viên hệ số 1,15, trên 80 sinh viên hệ số 1,3. Định mức ${lecturer.title} là ${current?.normHours ?? 135} giờ mỗi học kỳ.`}
      />
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Giờ chuẩn năm học" value={yearHours} hint={`Định mức ${yearNorm} giờ`} tone={yearHours < yearNorm * 0.8 ? "warning" : undefined} />
          <StatTile label={`Tiết mỗi tuần, ${currentTerm.shortName}`} value={current?.periodsPerWeek ?? 0} hint={`${currentSections.length} lớp`} />
          <StatTile label={`Lớp dự kiến ${targetTerm.shortName}`} value={targetSections.length} hint={`${target?.periodsPerWeek ?? 0} tiết mỗi tuần`} />
          <StatTile
            label="Đánh giá của sinh viên"
            value={myAverage === null ? "Chưa có" : `${myAverage.toFixed(2).replace(".", ",")}/5`}
            hint={facultyAverage === null ? undefined : `Trung bình khoa ${facultyAverage.toFixed(2).replace(".", ",")}`}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <TermLoad title={currentTerm.name} workload={current} sections={currentSections} />
          <TermLoad title={targetTerm.name} workload={target} sections={targetSections} />
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Kết quả khảo sát giảng dạy</h2>
            <Link href="/lecturer/classes" className="text-sm">
              Lớp học phần
            </Link>
          </div>
          {survey && <p className="max-w-prose text-sm text-pretty text-muted">{survey.title}. Kết quả chỉ giảng viên, khoa và Phòng Đào tạo xem được.</p>}
          <LecturerSurveyResults results={mine} questions={survey?.questions ?? []} facultyAverage={facultyAverage} />
        </section>
      </div>
    </>
  );
}
