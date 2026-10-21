import type { Metadata } from "next";
import { getProgramOf } from "@/modules/curriculum/curriculum.query";
import { PrintableTranscript } from "@/modules/grades/components/printable-transcript";
import { TranscriptView } from "@/modules/grades/components/transcript-view";
import { downloadOwnTranscriptPdf } from "@/modules/grades/grades.action";
import { formatPoint, standingLabel, WARNING_LEVEL } from "@/modules/grades/grades.constant";
import { getCurrentWarnings, getStudentStandings, getTranscript } from "@/modules/grades/grades.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { DownloadPdfButton } from "@/shared/components/ui/download-pdf-button";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PrintButton } from "@/shared/components/ui/print-button";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatTile } from "@/shared/components/ui/stat-tile";

export const metadata: Metadata = { title: "Kết quả học tập" };

export default async function Page() {
  const student = await getCurrentStudent();
  const [program, transcript, [standing], warnings] = await Promise.all([
    getProgramOf(student.majorCode, student.cohort),
    getTranscript(student.id),
    getStudentStandings([student.id]),
    getCurrentWarnings([student.id]),
  ]);
  const warning = warnings[student.id];
  const totalCredits = program?.totalCredits ?? null;
  const completed = transcript.filter((entry) => !entry.isInProgress);
  const lastTerm = completed.at(-1);
  const percent = totalCredits ? Math.round((standing.earnedCredits / totalCredits) * 100) : null;

  return (
    <>
      <PrintableTranscript student={student} terms={transcript} standing={standing} />
      <div className="flex flex-col gap-4 print:hidden">
        <PageHeader
          title="Kết quả học tập"
          description="Điểm quy đổi theo thang 4 của quy chế đào tạo tín chỉ. Học phần học lại hoặc cải thiện tính điểm lần học cuối. Điểm học kỳ hiện tại hiện sau khi Phòng Đào tạo công bố."
          actions={
            <>
              <DownloadPdfButton action={downloadOwnTranscriptPdf} />
              <PrintButton label="In bảng điểm" />
            </>
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Điểm trung bình tích lũy" value={formatPoint(standing.cpa4) || "Chưa có"} hint={`Xếp loại ${standingLabel(standing.standing).toLowerCase()}`} />
          <StatTile
            label="Học kỳ gần nhất"
            value={formatPoint(lastTerm?.gpa4 ?? null)}
            hint={lastTerm ? lastTerm.termName.replace("Học kỳ", "HK").replace(", năm học", "") : "Chưa có"}
          />
          <StatTile label="Tín chỉ tích lũy" value={totalCredits ? `${standing.earnedCredits}/${totalCredits}` : standing.earnedCredits} hint={percent === null ? "Chưa có chương trình đào tạo" : `Đạt ${percent}% chương trình`} />
          <StatTile
            label="Tín chỉ nợ"
            value={standing.failedCredits}
            hint={warning ? `Đang bị cảnh báo học vụ ${WARNING_LEVEL[warning.level].label.toLowerCase()} (${warning.termName.toLowerCase()})` : "Không bị cảnh báo học vụ"}
            tone={warning ? "danger" : standing.failedCredits > 0 ? "warning" : undefined}
          />
        </div>
        {totalCredits && (
          <SectionCard title="Tiến độ tốt nghiệp" extra={<span className="text-xs text-muted tabular-nums">Còn {Math.max(0, totalCredits - standing.earnedCredits)} tín chỉ</span>}>
            <div className="flex flex-col gap-2">
              <MeterBar value={standing.earnedCredits} max={totalCredits} label="Tín chỉ đã tích lũy" />
              <p className="text-xs text-pretty text-muted">
                {program ? `${program.name}, ${program.degree.toLowerCase()} ${program.totalCredits} tín chỉ.` : ""} Xem chi tiết từng học phần ở mục Chương trình đào tạo.
              </p>
            </div>
          </SectionCard>
        )}
        <SectionCard title="Bảng điểm theo học kỳ" flush>
          <TranscriptView terms={transcript} inCard />
        </SectionCard>
      </div>
    </>
  );
}
