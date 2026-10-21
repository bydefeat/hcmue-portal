import Link from "next/link";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatPoint, WARNING_LEVEL } from "@/modules/grades/grades.constant";
import type { ExpulsionProposal } from "@/modules/grades/grades.type";

export function ExpulsionProposalList({ proposals, studentHrefBase, expelAfterWarnings }: { proposals: ExpulsionProposal[]; studentHrefBase: string; expelAfterWarnings: number }) {
  if (proposals.length === 0) {
    return <EmptyState illustration="done" title="Không có sinh viên thuộc diện xét buộc thôi học" description={`Theo quy chế: bị cảnh báo ${expelAfterWarnings} học kỳ chính liên tiếp hoặc cảnh báo mức 3.`} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-pretty text-muted">
        {proposals.length} sinh viên bị cảnh báo từ {expelAfterWarnings} học kỳ chính liên tiếp hoặc ở mức 3. Xem hồ sơ và lập quyết định buộc thôi học ở mục Quyết định sinh viên nếu Hội đồng thống nhất.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {proposals.map((proposal) => (
          <li key={proposal.studentId} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <Link href={`${studentHrefBase}${proposal.studentCode}`} className="flex min-w-0 flex-col">
              <span className="font-medium">{proposal.fullName}</span>
              <span className="text-xs text-muted">
                {proposal.studentCode} · {proposal.className} · {proposal.faculty}
              </span>
            </Link>
            <span className="flex min-w-0 flex-col gap-1 sm:items-end">
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted tabular-nums">
                <StatusTag status={WARNING_LEVEL[proposal.level]} />
                CPA {formatPoint(proposal.cpa4)}
              </span>
              <span className="text-xs text-pretty text-muted sm:text-right">{proposal.reasons.join("; ")}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
