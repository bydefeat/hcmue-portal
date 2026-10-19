import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDate } from "@/shared/libs/date.lib";
import { DECISION_KIND_LABEL, DECISION_STATUS } from "@/modules/users/users.constant";
import type { StudentDecision } from "@/modules/users/users.type";

export function StudentProfileDecisions({ decisions }: { decisions: StudentDecision[] }) {
  const visible = decisions.filter((decision) => decision.status !== "draft");
  return (
    <SectionCard title="Quyết định liên quan" flush>
      {visible.length === 0 ? (
        <EmptyState illustration="document" title="Chưa có quyết định nào" description="Quyết định khen thưởng, bảo lưu, chuyển ngành sẽ hiện ở đây sau khi được ký." />
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
                {decision.number ? decision.number : "Chưa có số"} · Hiệu lực từ {formatDate(decision.effectiveDate)}
                {decision.signedBy ? ` · ${decision.signedBy}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
