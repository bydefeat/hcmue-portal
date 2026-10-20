"use client";

import { Steps } from "antd";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime } from "@/shared/libs/date.lib";
import { STEP_STATUS } from "@/modules/requests/requests.constant";
import type { ApprovalStep, StepStatus } from "@/modules/requests/requests.type";

const STEP_STATE: Record<StepStatus, "wait" | "process" | "finish" | "error"> = {
  waiting: "wait",
  pending: "process",
  approved: "finish",
  rejected: "error",
  skipped: "finish",
};

export function ApprovalSteps({ steps, submittedAt, requesterName }: { steps: ApprovalStep[]; submittedAt: string; requesterName: string }) {
  return (
    <Steps
      orientation="vertical"
      size="small"
      current={steps.findIndex((step) => step.status === "pending") + 1}
      items={[
        {
          title: "Gửi đơn",
          status: "finish",
          content: (
            <span className="text-xs text-muted tabular-nums">
              {requesterName} · {formatDateTime(submittedAt)}
            </span>
          ),
        },
        ...steps.map((step) => ({
          title: (
            <span className="flex flex-wrap items-center gap-2">
              <span>{step.label}</span>
              <StatusTag status={STEP_STATUS[step.status]} />
            </span>
          ),
          status: STEP_STATE[step.status],
          content: (
            <span className="flex flex-col gap-1 pb-2 text-xs text-muted">
              {step.assigneeName && <span>Người xử lý: {step.assigneeName}</span>}
              {step.reassigned && (
                <span className="text-pretty">
                  {step.reassigned.byName} chuyển người xử lý lúc {formatDateTime(step.reassigned.at)}: {step.reassigned.reason}
                </span>
              )}
              {step.actedAt && (
                <span className="tabular-nums">
                  {step.actorName}
                  {step.onBehalf && " (Phòng Đào tạo xử lý thay)"} · {formatDateTime(step.actedAt)}
                </span>
              )}
              {step.status === "pending" && step.dueAt && <span className="tabular-nums">Hạn xử lý {formatDateTime(step.dueAt)}</span>}
              {step.comment && <span className="text-sm text-pretty text-foreground">“{step.comment}”</span>}
            </span>
          ),
        })),
      ]}
    />
  );
}
