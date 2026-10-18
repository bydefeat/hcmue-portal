"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Segmented } from "antd";
import { CalendarCheck, CircleWarning } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { daysUntil, dayjs } from "@/shared/libs/date.lib";
import { EXAM_FORMAT_LABEL, EXAM_KIND_LABEL } from "../exams.constant";
import type { ExamKind, ExamSession } from "../exams.type";

export type StudentExamItem = {
  exam: ExamSession;
  absences: number;
  sessionsHeld: number;
  isBanned: boolean;
};

type Filter = "upcoming" | ExamKind | "all";

function whenText(date: string) {
  const days = daysUntil(date);
  if (days < 0) return { text: "Đã thi", className: "text-muted" };
  if (days === 0) return { text: "Hôm nay", className: "text-amber-700 font-medium" };
  if (days === 1) return { text: "Ngày mai", className: "text-amber-700 font-medium" };
  return { text: `Còn ${days} ngày`, className: days <= 7 ? "text-amber-700" : "text-muted" };
}

function endTime(start: string, minutes: number) {
  return dayjs(`2000-01-01T${start}`).add(minutes, "minute").format("HH:mm");
}

export function StudentExamList({ items, absenceLimitPercent }: { items: StudentExamItem[]; absenceLimitPercent: number }) {
  const [filter, setFilter] = useState<Filter>("upcoming");
  const banned = items.filter((item) => item.isBanned && daysUntil(item.exam.date) >= 0);
  const visible = items.filter(({ exam }) => {
    if (filter === "upcoming") return daysUntil(exam.date) >= 0 && exam.status !== "draft";
    if (filter === "all") return true;
    return exam.kind === filter;
  });

  return (
    <div className="flex flex-col gap-3">
      {banned.length > 0 && (
        <Alert
          type="error"
          showIcon
          title={`Bạn có nguy cơ bị cấm thi ${banned.length} học phần`}
          description={`Số buổi vắng đã từ ${absenceLimitPercent}% số buổi học. Liên hệ giảng viên phụ trách hoặc gửi đơn kèm minh chứng trước ngày thi.`}
          action={<Link href="/application/requests">Gửi đơn</Link>}
        />
      )}
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "upcoming", label: "Sắp thi" },
          { value: "midterm", label: EXAM_KIND_LABEL.midterm },
          { value: "final", label: EXAM_KIND_LABEL.final },
          { value: "all", label: "Tất cả" },
        ]}
        className="self-start"
      />
      {visible.length === 0 ? (
        <div className="rounded-xl border border-border-strong bg-surface">
          <EmptyState icon={CalendarCheck} title="Không có lịch thi sắp tới" description="Lịch thi cuối kỳ được Phòng Khảo thí công bố trước kỳ thi 2 tuần." />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map(({ exam, absences, sessionsHeld, isBanned }) => {
            const when = whenText(exam.date);
            const isDraft = exam.status === "draft";
            return (
              <li key={exam.id} className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-4 sm:flex-row sm:items-start">
                <div className="flex w-24 shrink-0 flex-row items-baseline gap-2 sm:flex-col sm:gap-0">
                  <span className="text-lg font-semibold tabular-nums">{dayjs(exam.date).format("DD/MM")}</span>
                  <span className="text-xs text-muted capitalize">{dayjs(exam.date).format("dddd")}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted">{exam.classCode}</span>
                    <span className="text-xs text-muted">
                      {EXAM_KIND_LABEL[exam.kind]} · {EXAM_FORMAT_LABEL[exam.format]}
                    </span>
                    {isDraft && <StatusTag status={{ label: "Dự kiến", tone: "neutral" }} />}
                  </div>
                  <span className="font-medium text-pretty">{exam.courseName}</span>
                  <span className="text-sm text-muted tabular-nums">
                    {exam.startTime} - {endTime(exam.startTime, exam.durationMinutes)} · Phòng {exam.room} · {exam.durationMinutes} phút
                  </span>
                  <span className={`text-xs tabular-nums ${isBanned ? "text-rose-700" : "text-muted"}`}>
                    {isBanned && <CircleWarning size={14} aria-hidden className="mr-1 inline align-[-2px]" />}
                    Đã vắng {absences}/{sessionsHeld} buổi
                    {isBanned ? ", thuộc diện cấm thi nếu không có minh chứng" : ""}
                  </span>
                </div>
                <span className={`shrink-0 text-sm tabular-nums ${when.className}`}>{when.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-pretty text-muted">
        Mang thẻ sinh viên và có mặt trước giờ thi 15 phút. Vắng thi có lý do chính đáng thì gửi đơn hoãn thi ở mục Đơn từ.
      </p>
    </div>
  );
}
