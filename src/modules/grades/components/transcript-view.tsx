"use client";

import { Collapse, Table, type TableColumnsType } from "antd";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { formatPoint, letterTextClass } from "@/modules/grades/grades.constant";
import type { TranscriptCourse, TranscriptTerm } from "@/modules/grades/grades.type";

// Học lại, học cải thiện: điểm tính tích lũy là lần học cuối; lần trước đó vẫn hiện nhưng ghi đã được thay thế.
function AttemptTags({ course }: { course: TranscriptCourse }) {
  if (!course.retakeKind && !course.replaced) return null;
  return (
    <span className="flex flex-wrap gap-x-2 text-xs text-muted">
      {course.retakeKind && <span className="font-medium text-foreground">{course.retakeKind === "retake" ? `Học lại lần ${course.attempt}` : "Học cải thiện"}</span>}
      {course.replaced && <span>Đã học lại, không tính tích lũy</span>}
    </span>
  );
}

const COLUMNS: TableColumnsType<TranscriptCourse> = [
  { title: "Mã HP", dataIndex: "courseCode", width: 110, render: (code: string) => <span className="text-xs">{code}</span> },
  {
    title: "Tên học phần",
    dataIndex: "courseName",
    render: (name: string, row) => (
      <span className={`flex flex-col text-pretty ${row.replaced ? "text-muted" : ""}`}>
        {name}
        <AttemptTags course={row} />
      </span>
    ),
  },
  { title: "TC", dataIndex: "credits", width: 56, align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
  {
    title: "Thang 10",
    dataIndex: "score10",
    width: 88,
    align: "right",
    render: (value: number | null, row) => <span className={`tabular-nums ${letterTextClass(row.letter)}`}>{formatPoint(value, 1)}</span>,
  },
  {
    title: "Điểm chữ",
    dataIndex: "letter",
    width: 88,
    align: "center",
    render: (letter: string | null) => (
      <span className={`font-medium tabular-nums ${letterTextClass(letter)}`}>{letter ?? ""}</span>
    ),
  },
  {
    title: "Thang 4",
    dataIndex: "point4",
    width: 80,
    align: "right",
    render: (value: number | null, row) => <span className={`tabular-nums ${letterTextClass(row.letter)}`}>{formatPoint(value, 1)}</span>,
  },
];

function CourseList({ courses }: { courses: TranscriptCourse[] }) {
  if (courses.length === 0) return <div className="md:hidden"><EmptyState illustration="document" title="Không có học phần" /></div>;
  return (
    <ul className="flex flex-col divide-y divide-border md:hidden">
      {courses.map((course) => (
        <li key={course.courseCode} className="flex items-start gap-3 py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`text-sm text-pretty ${course.replaced ? "text-muted" : ""}`}>{course.courseName}</span>
            <AttemptTags course={course} />
            <span className="text-xs text-muted tabular-nums">
              {course.courseCode} · {course.credits} TC
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className={`text-sm font-medium tabular-nums ${letterTextClass(course.letter)}`}>{course.letter ?? "Chưa có điểm"}</span>
            {course.score10 !== null && (
              <span className={`text-xs tabular-nums ${letterTextClass(course.letter)}`}>
                {formatPoint(course.score10, 1)} · {formatPoint(course.point4, 1)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TermSummary({ term }: { term: TranscriptTerm }) {
  if (term.isInProgress) {
    return <span className="text-xs text-muted tabular-nums">Đang học · {term.attemptedCredits} tín chỉ</span>;
  }
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
      <span>
        ĐTB <span className="font-medium text-foreground">{formatPoint(term.gpa4)}</span>
      </span>
      <span>
        CPA <span className="font-medium text-foreground">{formatPoint(term.cpa4)}</span>
      </span>
      <span>
        Đạt {term.earnedCredits}/{term.attemptedCredits} TC
      </span>
    </span>
  );
}

export function TranscriptView({ terms, inCard = false }: { terms: TranscriptTerm[]; inCard?: boolean }) {
  if (terms.length === 0) {
    return <EmptyState illustration="document" title="Chưa có kết quả học tập" description="Sinh viên chưa hoàn thành học kỳ nào." />;
  }
  const ordered = [...terms].toReversed();
  const defaultOpen = ordered.find((term) => !term.isInProgress)?.termId;

  return (
    <Collapse
      bordered={!inCard}
      ghost={inCard}
      defaultActiveKey={defaultOpen ? [defaultOpen] : []}
      items={ordered.map((term) => ({
        key: term.termId,
        label: (
          <span className="flex min-w-0 flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-4">
            <span className="font-medium">{term.termName}</span>
            <TermSummary term={term} />
          </span>
        ),
        children: (
          <>
            <CourseList courses={term.courses} />
            <Table
            className="hidden md:block"
            rowKey="courseCode"
            size="small"
            columns={COLUMNS}
            dataSource={term.courses}
            pagination={false}
            scroll={{ x: 560 }}
            locale={{ emptyText: <EmptyState illustration="document" title="Không có học phần" /> }}
          />
          </>
        ),
      }))}
    />
  );
}
