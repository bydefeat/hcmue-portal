import { StarList } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import type { SectionSurveyResult, SurveyQuestion } from "../surveys.type";

type LecturerSurveyResultsProps = {
  results: SectionSurveyResult[];
  questions: SurveyQuestion[];
  facultyAverage: number | null;
};

function formatScore(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function toneOf(value: number) {
  if (value < 3.5) return "danger" as const;
  if (value < 4) return "warning" as const;
  return "primary" as const;
}

export function LecturerSurveyResults({ results, questions, facultyAverage }: LecturerSurveyResultsProps) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-border-strong bg-surface">
        <EmptyState icon={StarList} title="Chưa có kết quả khảo sát" description="Kết quả hiện sau khi đợt khảo sát đóng và có ít nhất 5 sinh viên trả lời." />
      </div>
    );
  }

  const groups = [...new Set(questions.map((question) => question.group))];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {results.map((result) => {
        const rate = result.enrolled > 0 ? Math.round((result.responses / result.enrolled) * 100) : 0;
        return (
          <section key={result.classSectionId} className="flex min-w-0 flex-col gap-4 rounded-xl border border-border-strong bg-surface p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{result.courseName}</span>
                <span className="font-mono text-xs text-muted">{result.classCode}</span>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-xl font-semibold tabular-nums">{formatScore(result.overall)}</span>
                <span className="text-xs text-muted">trên 5 điểm</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-muted tabular-nums">
                <span>Tỉ lệ phản hồi</span>
                <span>
                  {result.responses}/{result.enrolled} sinh viên, {rate}%
                </span>
              </div>
              <MeterBar value={result.responses} max={result.enrolled} tone={rate < 40 ? "warning" : "primary"} label="Tỉ lệ phản hồi" />
            </div>
            <ul className="flex flex-col gap-2">
              {groups.map((group) => {
                const ids = questions.filter((question) => question.group === group).map((question) => question.id);
                const average = ids.reduce((sum, id) => sum + (result.averages[id] ?? 0), 0) / ids.length;
                return (
                  <li key={group} className="grid grid-cols-[minmax(0,1fr)_96px_40px] items-center gap-3 text-sm">
                    <span className="truncate">{group}</span>
                    <MeterBar value={average} max={5} tone={toneOf(average)} label={group} />
                    <span className={`text-right tabular-nums ${average < 3.5 ? "text-rose-700" : ""}`}>{formatScore(average)}</span>
                  </li>
                );
              })}
            </ul>
            {facultyAverage !== null && (
              <p className="text-xs text-muted tabular-nums">
                Trung bình của khoa {formatScore(facultyAverage)}.{" "}
                {result.overall >= facultyAverage ? "Lớp này cao hơn trung bình khoa." : "Lớp này thấp hơn trung bình khoa."}
              </p>
            )}
            {result.comments.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border-strong pt-3">
                <span className="text-xs font-medium text-muted">Ý kiến sinh viên (ẩn danh)</span>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {result.comments.map((comment) => (
                    <li key={comment} className="text-pretty">
                      “{comment}”
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
