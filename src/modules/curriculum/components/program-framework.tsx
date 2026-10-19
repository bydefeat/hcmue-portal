"use client";

import { useMemo, useState, useTransition } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Alert, Button, Card, Dropdown, message, Modal, Select, Table, type MenuProps, type TableColumnsType } from "antd";
import { DotsVertical, GripDotsVertical, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { SectionCard } from "@/shared/components/ui/section-card";
import { changeProgramCourses } from "@/modules/curriculum/curriculum.action";
import { COURSE_TYPE_LABEL, KNOWLEDGE_BLOCK_LABEL } from "@/modules/curriculum/curriculum.constant";
import { frameworkIssues, programSemesterLimit } from "@/modules/curriculum/curriculum.rule";
import type { Course, CourseType, ProgramCourseChange, ProgramDetail, ProgramSemester } from "@/modules/curriculum/curriculum.type";

type ProgramFrameworkProps = {
  program: ProgramDetail;
  // Có danh mục học phần nghĩa là người xem được sửa khung (chương trình chưa ngừng áp dụng, đúng khoa).
  catalog?: Course[];
};

const COLUMNS: TableColumnsType<Course> = [
  { title: "Mã HP", dataIndex: "code", width: 110, responsive: ["sm"], render: (code: string) => <span className="text-xs">{code}</span> },
  { title: "Tên học phần", dataIndex: "name", render: (name: string) => <span className="text-pretty">{name}</span> },
  { title: <span className="whitespace-nowrap">TC</span>, dataIndex: "credits", width: 56, align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
  {
    title: <span className="whitespace-nowrap">LT/TH</span>,
    key: "split",
    width: 80,
    responsive: ["md"],
    align: "right",
    render: (_, row) => (
      <span className="text-muted tabular-nums">
        {row.theoryCredits}/{row.practiceCredits}
      </span>
    ),
  },
  { title: "Loại", dataIndex: "type", width: 96, responsive: ["md"], render: (value: CourseType) => COURSE_TYPE_LABEL[value] },
  {
    title: "Tiên quyết",
    dataIndex: "prerequisiteCodes",
    width: 180,
    responsive: ["lg"],
    render: (codes: string[]) =>
      codes.length > 0 ? <span className="text-xs">{codes.join(", ")}</span> : <span className="text-muted">Không</span>,
  },
];

function DragHandle({ course, semester }: { course: Course; semester: number }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: course.code, data: { semester } });
  return (
    <Button
      ref={setNodeRef}
      type="text"
      size="small"
      aria-label={`Kéo ${course.name} sang học kỳ khác`}
      className="cursor-grab touch-none"
      icon={<GripDotsVertical size={16} aria-hidden className="text-zinc-500" />}
      {...listeners}
      {...attributes}
    />
  );
}

function SemesterDrop({ semester, children }: { semester: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `semester:${semester}`, data: { semester } });
  return (
    <div ref={setNodeRef} className={`rounded-xl border transition-colors ${isOver ? "border-primary" : "border-transparent"}`}>
      {children}
    </div>
  );
}

// Học kỳ hiện trên trang: khi sửa thì đủ các học kỳ của chương trình (kể cả học kỳ trống) để thêm hoặc kéo học phần vào.
function visibleSemesters(program: ProgramDetail, editable: boolean): ProgramSemester[] {
  if (!editable) return program.semesters;
  const limit = programSemesterLimit(program.durationYears);
  const numbers = [...new Set([...Array.from({ length: limit }, (_, index) => index + 1), ...program.semesters.map((entry) => entry.semester)])].toSorted(
    (a, b) => a - b,
  );
  return numbers.map((semester) => program.semesters.find((entry) => entry.semester === semester) ?? { semester, credits: 0, courses: [] });
}

export function ProgramFramework({ program: initialProgram, catalog }: ProgramFrameworkProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [program, setProgram] = useState(initialProgram);
  const [adding, setAdding] = useState<{ semester: number; codes: string[] } | null>(null);
  const [dragging, setDragging] = useState<Course | null>(null);
  const [isPending, startTransition] = useTransition();
  const editable = catalog !== undefined;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

  const semesters = visibleSemesters(program, editable);
  const issues = useMemo(() => frameworkIssues(program), [program]);
  const semesterOf = useMemo(() => new Map(program.semesters.flatMap((entry) => entry.courses.map((course) => [course.code, entry.semester] as const))), [program]);
  const limit = programSemesterLimit(program.durationYears);

  const apply = (change: ProgramCourseChange, done?: () => void) =>
    startTransition(async () => {
      const result = await changeProgramCourses(program.id, change);
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      const before = new Set(frameworkIssues(program).map((issue) => issue.message));
      const added = frameworkIssues(result.data).filter((issue) => issue.courseCode !== null && !before.has(issue.message));
      setProgram(result.data);
      done?.();
      if (added.length > 0) messageApi.warning(added.map((issue) => issue.message).join(" "));
      else messageApi.success("Đã lưu khung chương trình.");
    });

  const confirmRemove = (course: Course) =>
    modal.confirm({
      title: `Bỏ ${course.code} khỏi khung?`,
      content: `${course.name} (${course.credits} tín chỉ) sẽ không còn trong khung của chương trình. Kết quả đã học của sinh viên không bị ảnh hưởng.`,
      okText: "Bỏ khỏi khung",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: () => apply({ kind: "remove", courseCode: course.code }),
    });

  const rowMenu = (course: Course, semester: number): MenuProps["items"] => [
    {
      key: "move",
      label: "Chuyển sang học kỳ",
      children: Array.from({ length: limit }, (_, index) => index + 1)
        .filter((target) => target !== semester)
        .map((target) => ({ key: `move:${target}`, label: `Học kỳ ${target}`, onClick: () => apply({ kind: "move", courseCode: course.code, semester: target }) })),
    },
    { type: "divider" },
    { key: "remove", label: "Bỏ khỏi khung", danger: true, onClick: () => confirmRemove(course) },
  ];

  const columnsFor = (semester: number): TableColumnsType<Course> =>
    editable
      ? [
          { key: "drag", width: 40, render: (_, course) => <DragHandle course={course} semester={semester} /> },
          ...COLUMNS,
          {
            key: "actions",
            width: 48,
            align: "right",
            render: (_, course) => (
              <Dropdown menu={{ items: rowMenu(course, semester) }} trigger={["click"]}>
                <Button type="text" size="small" aria-label={`Thao tác với ${course.name}`} icon={<DotsVertical size={16} aria-hidden className="text-zinc-500" />} />
              </Dropdown>
            ),
          },
        ]
      : COLUMNS;

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const from = event.active.data.current?.semester as number | undefined;
    const to = event.over?.data.current?.semester as number | undefined;
    if (from === undefined || to === undefined || from === to) return;
    apply({ kind: "move", courseCode: String(event.active.id), semester: to });
  };

  const addOptions = (catalog ?? [])
    .filter((course) => !semesterOf.has(course.code))
    .map((course) => ({
      value: course.code,
      disabled: !course.isActive,
      label: `${course.code} · ${course.name} (${course.credits} TC)${course.isActive ? "" : ", ngừng mở"}`,
    }));

  if (!editable && program.semesters.length === 0) {
    return (
      <SectionCard flush>
        <EmptyState
          illustration="document"
          title="Chưa có khung chương trình"
          description="Chương trình này chưa được gán học phần theo học kỳ. Sinh viên các khóa áp dụng sẽ chưa thấy tiến độ đào tạo."
        />
      </SectionCard>
    );
  }

  const semesterCards = semesters.map((semester) => {
    const card = (
      <SectionCard
        key={semester.semester}
        flush
        title={`Học kỳ ${semester.semester}`}
        extra={
          <span className="flex items-center gap-3">
            <span className="text-sm font-normal text-muted tabular-nums">
              {semester.courses.length} học phần · {semester.credits} tín chỉ
            </span>
            {editable && (
              <Button size="small" icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => setAdding({ semester: semester.semester, codes: [] })}>
                Thêm
              </Button>
            )}
          </span>
        }
      >
        {semester.courses.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">Chưa có học phần.</p>
        ) : (
          <Table rowKey="code" size="small" columns={columnsFor(semester.semester)} dataSource={semester.courses} pagination={false} scroll={{ x: "max-content" }} />
        )}
      </SectionCard>
    );
    return editable ? (
      <SemesterDrop key={semester.semester} semester={semester.semester}>
        {card}
      </SemesterDrop>
    ) : (
      card
    );
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px] lg:items-start">
      {contextHolder}
      {modalContextHolder}
      <div className="flex min-w-0 flex-col gap-4">
        {editable ? (
          <DndContext
            id="program-framework"
            sensors={sensors}
            onDragStart={(event) => setDragging((catalog ?? []).find((course) => course.code === event.active.id) ?? null)}
            onDragCancel={() => setDragging(null)}
            onDragEnd={onDragEnd}
          >
            {semesterCards}
            <DragOverlay>
              {dragging && (
                <Card size="small" classNames={{ body: "flex items-center gap-2 p-2.5" }}>
                  <GripDotsVertical size={16} aria-hidden className="text-zinc-500" />
                  <span className="text-sm">
                    {dragging.code} · {dragging.name}
                  </span>
                </Card>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          semesterCards
        )}
      </div>
      <SectionCard className="lg:sticky lg:top-20">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Tín chỉ đã xếp vào khung</span>
            <span className="text-xl font-semibold tabular-nums">
              {program.plannedCredits}/{program.totalCredits}
            </span>
            <MeterBar value={program.plannedCredits} max={program.totalCredits} tone={program.plannedCredits === program.totalCredits ? "success" : "primary"} label="Tín chỉ đã xếp" />
          </div>
          <ul className="flex flex-col gap-3">
            {program.creditsByBlock.map((entry) => (
              <li key={entry.block} className="flex flex-col gap-1">
                <span className="flex justify-between gap-2 text-sm">
                  {KNOWLEDGE_BLOCK_LABEL[entry.block]}
                  <span className="tabular-nums">{entry.credits} TC</span>
                </span>
                <MeterBar value={entry.credits} max={program.plannedCredits} label={KNOWLEDGE_BLOCK_LABEL[entry.block]} />
              </li>
            ))}
          </ul>
          {issues.length > 0 && (
            <Alert
              type="warning"
              showIcon
              title={`${issues.length} điểm cần xem lại`}
              description={
                <ul className="flex max-h-72 flex-col gap-1 overflow-auto text-xs text-pretty">
                  {issues.map((issue) => (
                    <li key={issue.message}>{issue.message}</li>
                  ))}
                </ul>
              }
            />
          )}
          {!editable && program.status === "archived" && <p className="text-xs text-pretty text-muted">Chương trình đã ngừng áp dụng nên khung chỉ xem được.</p>}
        </div>
      </SectionCard>

      <Modal
        open={adding !== null}
        title={adding ? `Thêm học phần vào học kỳ ${adding.semester}` : undefined}
        okText="Thêm vào khung"
        cancelText="Hủy"
        okButtonProps={{ disabled: !adding || adding.codes.length === 0, loading: isPending }}
        onOk={() => adding && apply({ kind: "add", semester: adding.semester, courseCodes: adding.codes }, () => setAdding(null))}
        onCancel={() => setAdding(null)}
        destroyOnHidden
      >
        <div className="flex flex-col gap-2">
          <Select
            mode="multiple"
            showSearch={{ optionFilterProp: "label" }}
            aria-label="Học phần"
            className="w-full"
            value={adding?.codes ?? []}
            onChange={(codes: string[]) => setAdding((current) => (current ? { ...current, codes } : current))}
            options={addOptions}
            placeholder="Tìm theo mã hoặc tên học phần"
          />
          <p className="text-xs text-pretty text-muted">Danh sách chỉ gồm học phần chưa có trong khung. Học phần ngừng mở không thêm được.</p>
        </div>
      </Modal>
    </div>
  );
}
