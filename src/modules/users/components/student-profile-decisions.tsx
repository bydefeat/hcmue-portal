import { ScrollText } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDate } from "@/shared/libs/date.lib";
import { DECISION_KIND_LABEL, DECISION_STATUS } from "../users.constant";
import type { StudentDecision } from "../users.type";

export function StudentProfileDecisions({ decisions }: { decisions: StudentDecision[] }) {
  const visible = decisions.filter((decision) => decision.status !== "draft");
  return (
    <section className="flex flex-col rounded-xl border border-border-strong bg-surface">
      <header className="border-b border-border-strong px-4 py-3 sm:px-5">
        <h2 className="text-lg font-semibold">Quyết định liên quan</h2>
      </header>
      {visible.length === 0 ? (
        <EmptyState icon={ScrollText} title="Chưa có quyết định nào" description="Quyết định khen thưởng, bảo lưu, chuyển ngành sẽ hiện ở đây sau khi được ký." />
      ) : (
        <ul className="flex flex-col divide-y divide-border-strong">
          {visible.map((decision) => (
            <li key={decision.id} className="flex flex-col gap-1 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">{DECISION_KIND_LABEL[decision.kind]}</span>
                {decision.status !== "signed" && <StatusTag status={DECISION_STATUS[decision.status]} />}
              </div>
              <span className="font-medium text-pretty">{decision.title}</span>
              <span className="text-xs text-muted tabular-nums">
                {decision.number ? <span className="font-mono">{decision.number}</span> : "Chưa có số"} · Hiệu lực từ {formatDate(decision.effectiveDate)}
                {decision.signedBy ? ` · ${decision.signedBy}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
