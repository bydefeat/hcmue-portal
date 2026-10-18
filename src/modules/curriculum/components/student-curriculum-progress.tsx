import { CircleCheck, CircleDashed, CircleXmark, Clock } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { COURSE_TYPE_LABEL, KNOWLEDGE_BLOCK_LABEL } from "../curriculum.constant";
import type { KnowledgeBlock, ProgramDetail } from "../curriculum.type";

export type CourseProgress = {
  status: "passed" | "failed" | "in-progress" | "not-taken";
  letter?: string;
};

type StudentCurriculumProgressProps = {
  program: ProgramDetail | null;
  progress: Record<string, CourseProgress>;
  earnedCredits: number;
};

const STATUS_VIEW = {
  passed: { icon: CircleCheck, className: "text-green-700" },
  failed: { icon: CircleXmark, className: "text-rose-700" },
  "in-progress": { icon: Clock, className: "text-amber-700" },
  "not-taken": { icon: CircleDashed, className: "text-muted" },
} as const;

function statusText(entry: CourseProgress) {
  if (entry.status === "passed") return `Đạt ${entry.letter}`;
  if (entry.status === "failed") return "Chưa đạt, cần học lại";
  if (entry.status === "in-progress") return "Đang học";
  return "Chưa học";
}

export function StudentCurriculumProgress({ program, progress, earnedCredits }: StudentCurriculumProgressProps) {
  if (!program || program.semesters.length === 0) {
    return (
      <div className="rounded-xl border border-border-strong bg-surface">
        <EmptyState title="Chưa có khung chương trình" description="Khoa chưa công bố khung chương trình cho khóa của bạn. Liên hệ cố vấn học tập để được hướng dẫn." />
      </div>
    );
  }

  const courses = program.semesters.flatMap((semester) => semester.courses);
  const statusOf = (code: string): CourseProgress => progress[code] ?? { status: "not-taken" };
  const requiredLeft = courses.filter((course) => course.type === "required" && statusOf(course.code).status !== "passed");
  const blocks = (Object.keys(KNOWLEDGE_BLOCK_LABEL) as KnowledgeBlock[])
    .map((block) => {
      const inBlock = courses.filter((course) => course.block === block);
      return {
        block,
        planned: inBlock.reduce((sum, course) => sum + course.credits, 0),
        earned: inBlock.filter((course) => statusOf(course.code).status === "passed").reduce((sum, course) => sum + course.credits, 0),
      };
    })
    .filter((entry) => entry.planned > 0);
  const remaining = Math.max(0, program.totalCredits - earnedCredits);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          {program.semesters.map((semester) => {
            const done = semester.courses.filter((course) => statusOf(course.code).status === "passed").length;
            return (
              <section key={semester.semester} className="rounded-xl border border-border-strong bg-surface">
                <header className="flex items-baseline justify-between gap-3 border-b border-border-strong px-4 py-3">
                  <h2 className="text-base font-semibold">Học kỳ {semester.semester}</h2>
                  <span className="text-xs text-muted tabular-nums">
                    {done}/{semester.courses.length} học phần · {semester.credits} TC
                  </span>
                </header>
                <ul className="flex flex-col divide-y divide-border-strong">
                  {semester.courses.map((course) => {
                    const entry = statusOf(course.code);
                    const view = STATUS_VIEW[entry.status];
                    const Icon = view.icon;
                    return (
                      <li key={course.code} className="flex items-start gap-3 px-4 py-2.5">
                        <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${view.className}`} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-pretty">{course.name}</span>
                          <span className="text-xs text-muted">
                            <span className="font-mono">{course.code}</span> · <span className="tabular-nums">{course.credits} TC</span> ·{" "}
                            {COURSE_TYPE_LABEL[course.type]}
                            {course.prerequisiteCodes.length > 0 && (
                              <>
                                {" "}
                                · Tiên quyết <span className="font-mono">{course.prerequisiteCodes.join(", ")}</span>
                              </>
                            )}
                          </span>
                        </span>
                        <span className={`shrink-0 text-xs tabular-nums ${view.className}`}>{statusText(entry)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-20">
          <section className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-4">
            <h2 className="text-base font-semibold">Điều kiện tốt nghiệp</h2>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>Tín chỉ tích lũy</span>
                <span className="tabular-nums">
                  {earnedCredits}/{program.totalCredits}
                </span>
              </div>
              <MeterBar value={earnedCredits} max={program.totalCredits} label="Tín chỉ tích lũy" />
            </div>
            <p className="text-sm text-pretty text-muted">
              {remaining === 0 && requiredLeft.length === 0
                ? "Bạn đã đủ tín chỉ và các học phần bắt buộc. Theo dõi đợt xét tốt nghiệp ở mục Thông báo."
                : `Còn ${remaining} tín chỉ và ${requiredLeft.length} học phần bắt buộc chưa đạt. Cần thêm chứng chỉ ngoại ngữ B1 và chứng chỉ ứng dụng công nghệ thông tin cơ bản.`}
            </p>
          </section>
          <section className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-4">
            <h2 className="text-base font-semibold">Theo khối kiến thức</h2>
            {blocks.map((entry) => (
              <div key={entry.block} className="flex flex-col gap-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{KNOWLEDGE_BLOCK_LABEL[entry.block]}</span>
                  <span className="shrink-0 tabular-nums">
                    {entry.earned}/{entry.planned}
                  </span>
                </div>
                <MeterBar value={entry.earned} max={entry.planned} tone={entry.earned >= entry.planned ? "success" : "primary"} label={KNOWLEDGE_BLOCK_LABEL[entry.block]} />
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
