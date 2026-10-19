"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Alert, Button, Card, Dropdown, Form, Input, message, type MenuProps } from "antd";
import { DotsVertical, GripDotsVertical } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDateTime } from "@/shared/libs/date.lib";
import { STUDY_PLAN_STATUS } from "@/modules/study-plan/study-plan.constant";
import type { StudyPlan, StudyPlanCourse, StudyPlanStatus } from "@/modules/study-plan/study-plan.type";
import { SectionCard } from "@/shared/components/ui/section-card";

type StudyPlanEditorProps = {
  plan: StudyPlan | null;
  termNames: string[];
  pool: StudyPlanCourse[];
  passedGrades: Record<string, string>;
  prerequisites: Record<string, string[]>;
  limits: { min: number; max: number };
  advisorName: string | null;
};

const POOL = "pool";

function initialColumns(plan: StudyPlan | null, termNames: string[]) {
  return Object.fromEntries(termNames.map((name) => [name, plan?.terms.find((term) => term.termName === name)?.courses.map((course) => course.code) ?? []]));
}

type CardProps = {
  course: StudyPlanCourse;
  warning?: string;
  handle: React.ReactNode;
  menu?: React.ReactNode;
  isDragging?: boolean;
};

function CourseCardView({ course, warning, handle, menu, isDragging = false }: CardProps) {
  return (
    <Card
      size="small"
      className={`${warning ? "border-amber-300" : ""} ${isDragging ? "opacity-40" : ""}`}
      classNames={{ body: "flex items-start gap-2 p-2.5" }}
    >
      {handle}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm text-pretty">{course.name}</span>
        <span className="text-xs text-muted">
          {course.code} · <span className="tabular-nums">{course.credits} TC</span>
        </span>
        {warning && <span className="text-xs text-pretty text-amber-700">{warning}</span>}
      </span>
      {menu}
    </Card>
  );
}

function CourseCard({
  course,
  column,
  columns,
  warning,
  onMove,
}: {
  course: StudyPlanCourse;
  column: string;
  columns: string[];
  warning?: string;
  onMove: (code: string, target: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: course.code, data: { column } });
  const items: MenuProps["items"] = [...columns.filter((name) => name !== column), ...(column === POOL ? [] : [POOL])].map((name) => ({
    key: name,
    label: name === POOL ? "Bỏ khỏi kế hoạch" : `Chuyển sang ${name}`,
    onClick: () => onMove(course.code, name),
  }));

  return (
    <div ref={setNodeRef}>
      <CourseCardView
        course={course}
        warning={warning}
        isDragging={isDragging}
        handle={
          <Button
            type="text"
            size="small"
            aria-label={`Kéo ${course.name}`}
            className="shrink-0 cursor-grab touch-none text-muted"
            icon={<GripDotsVertical size={16} aria-hidden className="text-zinc-500" />}
            {...listeners}
            {...attributes}
          />
        }
        menu={
          <Dropdown menu={{ items }} trigger={["click"]}>
            <Button type="text" size="small" aria-label={`Chuyển ${course.name}`} icon={<DotsVertical size={16} aria-hidden className="text-zinc-500" />} />
          </Dropdown>
        }
      />
    </div>
  );
}

function Column({
  id,
  title,
  children,
  footer,
  className = "",
  listClassName = "flex flex-col",
}: {
  id: string;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  listClassName?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <Card
      ref={setNodeRef}
      size="small"
      className={`min-w-0 transition-colors ${isOver ? "border-primary bg-primary-light" : ""} ${className}`}
      classNames={{ body: "flex flex-col gap-2" }}
    >
      <header className="flex flex-col gap-1">{title}</header>
      <div className={`min-h-24 gap-2 ${listClassName}`}>{children}</div>
      {footer}
    </Card>
  );
}

export function StudyPlanEditor({ plan, termNames, pool, passedGrades, prerequisites, limits, advisorName }: StudyPlanEditorProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [columns, setColumns] = useState<Record<string, string[]>>(() => initialColumns(plan, termNames));
  const [status, setStatus] = useState<StudyPlanStatus>(plan?.status ?? "draft");
  const [submittedAt, setSubmittedAt] = useState(plan?.submittedAt ?? null);
  const [note, setNote] = useState(plan?.studentNote ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const catalog = useMemo(() => {
    const planned = plan?.terms.flatMap((term) => term.courses) ?? [];
    return new Map([...pool, ...planned].map((course) => [course.code, course]));
  }, [plan, pool]);
  const plannedCodes = new Set(Object.values(columns).flat());
  const poolCodes = [...catalog.keys()].filter((code) => !plannedCodes.has(code));

  const move = (code: string, target: string) => {
    setColumns((current) => {
      const next = Object.fromEntries(Object.entries(current).map(([name, codes]) => [name, codes.filter((entry) => entry !== code)]));
      if (target !== POOL) next[target] = [...(next[target] ?? []), code];
      return next;
    });
    setIsDirty(true);
    if (status !== "draft") setStatus("draft");
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveCode(null);
    if (!event.over) return;
    const target = String(event.over.id);
    const from = (event.active.data.current as { column: string }).column;
    if (target !== from) move(String(event.active.id), target);
  };

  const warningFor = (code: string, termIndex: number) => {
    const passed = passedGrades[code];
    if (passed && passed !== "F") return `Đã đạt điểm ${passed}, bỏ khỏi kế hoạch nếu không học cải thiện.`;
    const earlier = new Set(termNames.slice(0, termIndex).flatMap((name) => columns[name] ?? []));
    const missing = (prerequisites[code] ?? []).filter((entry) => (!passedGrades[entry] || passedGrades[entry] === "F") && !earlier.has(entry));
    if (missing.length > 0) return `Cần học trước ${missing.join(", ")} ở học kỳ trước đó.`;
    return undefined;
  };

  const creditsOf = (name: string) => (columns[name] ?? []).reduce((sum, code) => sum + (catalog.get(code)?.credits ?? 0), 0);
  const termProblems = termNames
    .map((name) => ({ name, credits: creditsOf(name) }))
    .filter((entry) => entry.credits < limits.min || entry.credits > limits.max);

  const save = () => {
    setIsDirty(false);
    messageApi.success("Đã lưu nháp kế hoạch học tập");
  };

  const submit = () => {
    if (termProblems.length > 0) {
      const first = termProblems[0];
      messageApi.error(`${first.name} có ${first.credits} tín chỉ, cần từ ${limits.min} đến ${limits.max}. Điều chỉnh rồi gửi lại.`);
      return;
    }
    setStatus("pending");
    setSubmittedAt(dayjs().toISOString());
    setIsDirty(false);
    messageApi.success(advisorName ? `Đã gửi kế hoạch cho ${advisorName} duyệt` : "Đã gửi kế hoạch cho cố vấn học tập duyệt");
  };

  const activeCourse = activeCode ? catalog.get(activeCode) : null;

  return (
    <div className="flex flex-col gap-4">
      {contextHolder}
      <Card size="small" classNames={{ body: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" }}>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <StatusTag status={STUDY_PLAN_STATUS[status]} />
            {isDirty && <span className="text-xs text-amber-700">Có thay đổi chưa lưu</span>}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {submittedAt && status !== "draft" ? `Gửi lúc ${formatDateTime(submittedAt)}` : "Chưa gửi cố vấn"}
            {advisorName ? ` · Cố vấn: ${advisorName}` : ""}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button onClick={save} disabled={!isDirty}>
            Lưu nháp
          </Button>
          <Button type="primary" onClick={submit} disabled={status === "pending" || status === "approved"}>
            {status === "pending" ? "Đang chờ cố vấn duyệt" : status === "approved" ? "Đã được duyệt" : "Gửi cố vấn duyệt"}
          </Button>
        </div>
      </Card>

      {plan?.advisorComment && status !== "draft" && (
        <Alert
          type={plan.status === "returned" ? "warning" : "success"}
          showIcon
          title={plan.status === "returned" ? "Cố vấn trả lại kế hoạch" : "Nhận xét của cố vấn"}
          description={plan.advisorComment}
        />
      )}
      {status === "draft" && plan && plan.status === "approved" && (
        <Alert type="info" showIcon title="Kế hoạch đã duyệt đang được chỉnh sửa" description="Sau khi sửa, gửi lại để cố vấn duyệt phiên bản mới." />
      )}

      <p className="text-xs text-pretty text-muted">
        Kéo học phần giữa các cột, hoặc bấm nút ba chấm trên thẻ để chuyển. Mỗi học kỳ từ {limits.min} đến {limits.max} tín chỉ.
      </p>

      <DndContext id="study-plan-editor" sensors={sensors} onDragStart={(event) => setActiveCode(String(event.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveCode(null)}>
        <div className="grid gap-3 lg:grid-cols-3">
          {termNames.map((name, termIndex) => {
            const credits = creditsOf(name);
            const outOfRange = credits < limits.min || credits > limits.max;
            return (
              <Column
                key={name}
                id={name}
                title={
                  <>
                    <h2 className="text-base font-semibold">{name}</h2>
                    <span className={`text-xs tabular-nums ${outOfRange ? "text-amber-700" : "text-muted"}`}>
                      {credits} tín chỉ{credits < limits.min ? `, thiếu ${limits.min - credits}` : credits > limits.max ? `, vượt ${credits - limits.max}` : ""}
                    </span>
                    <MeterBar value={credits} max={limits.max} tone={outOfRange ? "warning" : "primary"} label={`Tín chỉ ${name}`} />
                  </>
                }
              >
                {(columns[name] ?? []).length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted">Kéo học phần vào đây</p>
                ) : (
                  (columns[name] ?? []).map((code) => {
                    const course = catalog.get(code);
                    return course ? (
                      <CourseCard key={code} course={course} column={name} columns={termNames} warning={warningFor(code, termIndex)} onMove={move} />
                    ) : null;
                  })
                )}
              </Column>
            );
          })}
          <Column
            id={POOL}
            className="lg:col-span-3"
            listClassName="grid sm:grid-cols-2 lg:grid-cols-3"
            title={
              <>
                <h2 className="text-base font-semibold">Học phần còn lại trong chương trình</h2>
                <span className="text-xs text-muted tabular-nums">{poolCodes.length} học phần chưa xếp</span>
              </>
            }
          >
            {poolCodes.length === 0 ? (
              <EmptyState illustration="document" title="Đã xếp hết học phần" />
            ) : (
              poolCodes.map((code) => {
                const course = catalog.get(code)!;
                return <CourseCard key={code} course={course} column={POOL} columns={termNames} onMove={move} />;
              })
            )}
          </Column>
        </div>
        <DragOverlay>
          {activeCourse ? <CourseCardView course={activeCourse} handle={<GripDotsVertical size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />} /> : null}
        </DragOverlay>
      </DndContext>

      <SectionCard title="Ghi chú cho cố vấn">
        <Form layout="vertical">
          <Form.Item label="Nội dung ghi chú" className="mb-0">
            <Input.TextArea
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setIsDirty(true);
              }}
              autoSize={{ minRows: 2, maxRows: 5 }}
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>
      </SectionCard>
    </div>
  );
}
