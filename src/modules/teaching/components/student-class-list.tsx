import Link from "next/link";
import { Badge } from "antd";
import { ChevronRight } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import type { StudentClass } from "@/modules/teaching/teaching.type";

export function StudentClassList({ classes }: { classes: StudentClass[] }) {
  if (classes.length === 0) {
    return (
      <SectionCard flush>
        <EmptyState illustration="board" title="Học kỳ này bạn chưa học lớp nào" description="Lớp đã đăng ký thành công sẽ hiện ở đây cùng thông báo và đề cương của giảng viên." />
      </SectionCard>
    );
  }
  return (
    <SectionCard flush>
      <ul className="flex flex-col divide-y divide-border-strong">
        {classes.map((section) => (
          <li key={section.id}>
            <Link
              href={`/application/classes/${section.id}`}
              className="flex cursor-pointer items-center gap-3 px-4 py-3 text-foreground transition-colors hover:bg-surface-hover sm:px-5"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium text-pretty">{section.courseName}</span>
                <span className="text-xs text-muted">
                  {section.code} · <span className="tabular-nums">{section.credits}</span> tín chỉ · {section.lecturer?.displayName ?? "Chưa phân công giảng viên"}
                </span>
              </span>
              <span className="shrink-0 text-xs">
                {section.unreadCount > 0 ? (
                  <Badge status="processing" text={<span className="tabular-nums">{section.unreadCount} thông báo chưa đọc</span>} />
                ) : (
                  <span className="text-muted">{section.announcementCount > 0 ? "Đã đọc hết thông báo" : "Chưa có thông báo"}</span>
                )}
              </span>
              <ChevronRight size={16} aria-hidden className="shrink-0 text-zinc-500" />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
