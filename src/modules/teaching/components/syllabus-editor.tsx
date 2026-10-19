"use client";

import { useState } from "react";
import { Alert, Button, Card, Form, Input, InputNumber, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { ArrowsTransaction, Pen, Plus, Trash } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDateTime } from "@/shared/libs/date.lib";
import { assessmentMismatches, SYLLABUS_STATUS } from "@/modules/teaching/teaching.constant";
import type { LearningOutcome, Syllabus, SyllabusAssessment, SyllabusWeek } from "@/modules/teaching/teaching.type";

type GradeComponentInfo = { key: string; label: string; weight: number };

type SyllabusEditorProps = {
  syllabus: Syllabus;
  gradeComponents: GradeComponentInfo[];
  classCode: string;
};

type FormValues = {
  description: string;
  outcomes: LearningOutcome[];
  weeks: SyllabusWeek[];
  assessments: SyllabusAssessment[];
  references: { text: string }[];
};

const WEEK_COLUMNS: TableColumnsType<SyllabusWeek> = [
  { title: "Tuần", dataIndex: "week", width: 64, align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
  { title: "Nội dung", dataIndex: "topic", width: 280, render: (value: string) => value || <span className="text-muted">Chưa nhập</span> },
  { title: "Hoạt động", dataIndex: "activities", width: 260, render: (value: string) => <span className="text-muted">{value}</span> },
  { title: "Tài liệu đọc", dataIndex: "readings", width: 200, render: (value: string) => <span className="text-muted">{value}</span> },
];

export function SyllabusEditor({ syllabus: initial, gradeComponents, classCode }: SyllabusEditorProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [syllabus, setSyllabus] = useState(initial);
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const mismatches = assessmentMismatches(syllabus.assessments, gradeComponents);
  const totalWeight = syllabus.assessments.reduce((sum, item) => sum + item.weight, 0);
  const emptyWeeks = syllabus.weeks.filter((week) => !week.topic.trim()).length;

  const startEdit = () => {
    form.setFieldsValue({
      description: syllabus.description,
      outcomes: syllabus.outcomes,
      weeks: syllabus.weeks,
      assessments: syllabus.assessments,
      references: syllabus.references.map((text) => ({ text })),
    });
    setIsEditing(true);
  };

  const save = (values: FormValues) => {
    setSyllabus((current) => ({
      ...current,
      description: values.description ?? "",
      outcomes: (values.outcomes ?? []).map((outcome, index) => ({ code: `CLO${index + 1}`, text: outcome.text })),
      weeks: values.weeks ?? current.weeks,
      assessments: (values.assessments ?? []).map((item) => ({ ...item, outcomes: item.outcomes ?? [] })),
      references: (values.references ?? []).map((entry) => entry.text).filter(Boolean),
      updatedAt: dayjs().toISOString(),
    }));
    setIsEditing(false);
    messageApi.success(syllabus.status === "published" ? "Đã lưu. Sinh viên thấy bản mới ngay." : "Đã lưu bản nháp đề cương.");
  };

  const publish = () => {
    if (totalWeight !== 100) {
      messageApi.error(`Tổng trọng số đánh giá đang là ${totalWeight}%, cần đúng 100% mới công bố được.`);
      return;
    }
    modal.confirm({
      title: `Công bố đề cương lớp ${classCode}?`,
      content:
        mismatches.length > 0
          ? "Trọng số trong đề cương chưa khớp bảng điểm. Sinh viên sẽ thấy cách tính điểm khác với bảng điểm cuối kỳ. Vẫn công bố?"
          : "Sinh viên trong lớp sẽ thấy đề cương trên cổng sinh viên.",
      okText: "Công bố",
      cancelText: "Để sau",
      mask: { closable: false },
      onOk: () => {
        setSyllabus((current) => ({ ...current, status: "published", publishedAt: dayjs().toISOString() }));
        messageApi.success("Đã công bố đề cương cho sinh viên.");
      },
    });
  };

  const syncFromGradeSheet = () => {
    const current: SyllabusAssessment[] = form.getFieldValue("assessments") ?? [];
    form.setFieldValue(
      "assessments",
      gradeComponents.map((component) => {
        const existing = current.find((item) => item.key === component.key);
        return { key: component.key, label: component.label, weight: component.weight, method: existing?.method ?? "", outcomes: existing?.outcomes ?? [] };
      }),
    );
    messageApi.info("Đã lấy cột điểm và trọng số từ bảng điểm. Lưu để áp dụng.");
  };

  const watchedOutcomes = Form.useWatch("outcomes", form) as LearningOutcome[] | undefined;
  const outcomeOptions = (watchedOutcomes ?? syllabus.outcomes).map((_, index) => ({
    value: `CLO${index + 1}`,
    label: `CLO${index + 1}`,
  }));

  const header = (
    <Card size="small">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag status={SYLLABUS_STATUS[syllabus.status]} />
            <span className="text-xs text-muted tabular-nums">
              {syllabus.publishedAt ? `Công bố ${formatDateTime(syllabus.publishedAt)}, ` : ""}sửa lần cuối {formatDateTime(syllabus.updatedAt)}
            </span>
          </div>
          <span className="text-sm text-muted">
            {syllabus.courseCode} {syllabus.courseName} · {syllabus.outcomes.length} chuẩn đầu ra · {syllabus.weeks.length - emptyWeeks}/{syllabus.weeks.length} tuần đã có nội dung
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEditing ? null : (
            <>
              <Button icon={<Pen size={16} aria-hidden className="text-zinc-500" />} onClick={startEdit}>
                Sửa đề cương
              </Button>
              {syllabus.status === "draft" && (
                <Button type="primary" onClick={publish}>
                  Công bố cho sinh viên
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );

  if (isEditing) {
    return (
      <div className="flex flex-col gap-4">
        {contextHolder}
        {modalContextHolder}
        {header}
        <Form form={form} layout="vertical" onFinish={save} className="flex flex-col gap-4">
          <SectionCard title="Mô tả học phần">
            <Form.Item name="description" className="mb-0">
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={1500} showCount aria-label="Mô tả học phần" />
            </Form.Item>
          </SectionCard>

          <SectionCard title="Chuẩn đầu ra">
            <Form.List name="outcomes">
              {(fields, { add, remove }) => (
                <div className="flex flex-col gap-2">
                  {fields.map((field, index) => (
                    <div key={field.key} className="flex items-start gap-2">
                      <span className="w-14 shrink-0 pt-2 text-xs text-muted">CLO{index + 1}</span>
                      <Form.Item name={[field.name, "text"]} className="mb-0 min-w-0 flex-1" rules={[{ required: true, whitespace: true, message: "Chưa nhập nội dung" }]}>
                        <Input aria-label={`Chuẩn đầu ra ${index + 1}`} />
                      </Form.Item>
                      <Button type="text" aria-label="Xóa chuẩn đầu ra" icon={<Trash size={16} aria-hidden className="text-zinc-500" />} onClick={() => remove(field.name)} />
                    </div>
                  ))}
                  <Button icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => add({ code: "", text: "" })} className="self-start">
                    Thêm chuẩn đầu ra
                  </Button>
                </div>
              )}
            </Form.List>
          </SectionCard>

          <SectionCard
            title="Đánh giá"
            extra={
              <Button size="small" icon={<ArrowsTransaction size={14} aria-hidden className="text-zinc-500" />} onClick={syncFromGradeSheet}>
                Lấy theo bảng điểm
              </Button>
            }
          >
            <Form.List name="assessments">
              {(fields, { add, remove }) => (
                <div className="flex flex-col gap-3">
                  {fields.map((field) => (
                    <div key={field.key} className="grid gap-x-2 border-b border-border-strong pb-3 md:grid-cols-[1fr_96px_1.4fr_1fr_auto] md:items-start">
                      <Form.Item name={[field.name, "label"]} label="Tên" rules={[{ required: true, message: "Chưa nhập tên" }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, "weight"]} label="Trọng số %" rules={[{ required: true, message: "Nhập %" }]}>
                        <InputNumber min={0} max={100} className="w-full tabular-nums" />
                      </Form.Item>
                      <Form.Item name={[field.name, "method"]} label="Hình thức">
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, "outcomes"]} label="Chuẩn đầu ra">
                        <Select mode="multiple" options={outcomeOptions} />
                      </Form.Item>
                      <Form.Item name={[field.name, "key"]} hidden>
                        <Input />
                      </Form.Item>
                      <Button type="text" aria-label="Xóa hình thức đánh giá" icon={<Trash size={16} aria-hidden className="text-zinc-500" />} onClick={() => remove(field.name)} className="justify-self-end md:mt-8">
                        <span className="md:hidden">Xóa hình thức này</span>
                      </Button>
                    </div>
                  ))}
                  <Button icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => add({ key: `custom-${Date.now()}`, label: "", weight: 0, method: "", outcomes: [] })} className="self-start">
                    Thêm hình thức đánh giá
                  </Button>
                </div>
              )}
            </Form.List>
          </SectionCard>

          <SectionCard title="Kế hoạch 15 tuần">
            <Form.List name="weeks">
              {(fields) => (
                <div className="flex flex-col gap-2">
                  {fields.map((field, index) => (
                    <div key={field.key} className="grid gap-2 border-b border-border-strong pb-2 md:grid-cols-[56px_1.3fr_1fr_1fr] md:items-center">
                      <span className="text-sm font-medium tabular-nums">Tuần {index + 1}</span>
                      <Form.Item name={[field.name, "topic"]} className="mb-0">
                        <Input placeholder="Nội dung" aria-label={`Nội dung tuần ${index + 1}`} />
                      </Form.Item>
                      <Form.Item name={[field.name, "activities"]} className="mb-0">
                        <Input placeholder="Hoạt động" aria-label={`Hoạt động tuần ${index + 1}`} />
                      </Form.Item>
                      <Form.Item name={[field.name, "readings"]} className="mb-0">
                        <Input placeholder="Tài liệu đọc" aria-label={`Tài liệu tuần ${index + 1}`} />
                      </Form.Item>
                    </div>
                  ))}
                </div>
              )}
            </Form.List>
          </SectionCard>

          <SectionCard title="Tài liệu tham khảo">
            <Form.List name="references">
              {(fields, { add, remove }) => (
                <div className="flex flex-col gap-2">
                  {fields.map((field, index) => (
                    <div key={field.key} className="flex items-center gap-2">
                      <Form.Item name={[field.name, "text"]} className="mb-0 min-w-0 flex-1">
                        <Input aria-label={`Tài liệu ${index + 1}`} />
                      </Form.Item>
                      <Button type="text" aria-label="Xóa tài liệu" icon={<Trash size={16} aria-hidden className="text-zinc-500" />} onClick={() => remove(field.name)} />
                    </div>
                  ))}
                  <Button icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => add({ text: "" })} className="self-start">
                    Thêm tài liệu
                  </Button>
                </div>
              )}
            </Form.List>
          </SectionCard>
          <Card size="small" className="sticky bottom-[calc(74px+env(safe-area-inset-bottom))] z-10 md:bottom-4" classNames={{ body: "flex flex-wrap items-center justify-end gap-2" }}>
            <span className="mr-auto text-sm text-muted">Đang sửa đề cương</span>
            <Button onClick={() => setIsEditing(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit">
              Lưu
            </Button>
          </Card>
        </Form>
      </div>
    );
  }

  const assessmentEmpty = <EmptyState illustration="document" title="Chưa có hình thức đánh giá" description="Bấm Sửa đề cương, chọn Lấy theo bảng điểm để điền nhanh." />;

  const assessmentColumns: TableColumnsType<SyllabusAssessment> = [
    { title: "Hình thức", dataIndex: "label", width: 160, render: (value: string) => <span className="font-medium">{value}</span> },
    { title: "Trọng số", dataIndex: "weight", width: 96, align: "right", render: (value: number) => <span className="tabular-nums">{value}%</span> },
    {
      title: "So với bảng điểm",
      key: "sheet",
      width: 140,
      align: "right",
      render: (_, row) => {
        const component = gradeComponents.find((entry) => entry.key === row.key);
        if (!component) return <span className="text-rose-700">Không có</span>;
        if (component.weight === row.weight) return <span className="text-muted">Khớp</span>;
        return <span className="text-rose-700 tabular-nums">{component.weight}%</span>;
      },
    },
    { title: "Cách đánh giá", dataIndex: "method", width: 240, render: (value: string) => <span className="text-muted">{value}</span> },
    { title: "Chuẩn đầu ra", dataIndex: "outcomes", width: 160, render: (value: string[]) => <span className="text-xs">{value.join(", ")}</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      {contextHolder}
      {modalContextHolder}
      {header}
      {mismatches.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="Cách tính điểm trong đề cương chưa khớp bảng điểm"
          description={
            <ul className="flex flex-col gap-0.5">
              {mismatches.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          }
          action={
            <Button size="small" onClick={startEdit}>
              Sửa
            </Button>
          }
        />
      )}
      {syllabus.description || syllabus.outcomes.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <SectionCard title="Mô tả và chuẩn đầu ra">
            <div className="flex flex-col gap-3">
              <p className="max-w-prose text-sm text-pretty">{syllabus.description || <span className="text-muted">Chưa có mô tả.</span>}</p>
              <ul className="flex flex-col gap-2">
                {syllabus.outcomes.map((outcome) => (
                  <li key={outcome.code} className="flex gap-3 text-sm">
                    <span className="w-12 shrink-0 text-xs text-muted">{outcome.code}</span>
                    <span className="text-pretty">{outcome.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </SectionCard>
          <SectionCard title="Tài liệu tham khảo">
            {syllabus.references.length === 0 ? (
              <p className="text-sm text-muted">Chưa có tài liệu.</p>
            ) : (
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
                {syllabus.references.map((reference) => (
                  <li key={reference} className="text-pretty">
                    {reference}
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>
      ) : (
        <SectionCard flush>
          <EmptyState
            illustration="document"
            title="Lớp chưa có đề cương"
            description="Soạn mô tả, chuẩn đầu ra, cách đánh giá và kế hoạch 15 tuần rồi công bố cho sinh viên."
            action={
              <Button type="primary" onClick={startEdit}>
                Soạn đề cương
              </Button>
            }
          />
        </SectionCard>
      )}

      <SectionCard
        title="Đánh giá"
        extra={<span className={`text-sm tabular-nums ${totalWeight === 100 ? "text-muted" : "text-rose-700"}`}>Tổng {totalWeight}%</span>}
        flush
      >
        <Table
          rowKey="key"
          size="small"
          columns={assessmentColumns}
          dataSource={syllabus.assessments}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{ emptyText: assessmentEmpty }}
          className="hidden md:block"
        />
        <div className="md:hidden">
          {syllabus.assessments.length === 0 ? (
            assessmentEmpty
          ) : (
            <ul className="flex flex-col divide-y divide-border-strong">
              {syllabus.assessments.map((row) => {
                const component = gradeComponents.find((entry) => entry.key === row.key);
                const isMismatch = !component || component.weight !== row.weight;
                return (
                  <li key={row.key} className="flex flex-col gap-1 px-4 sm:px-5 py-3">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{row.label}</span>
                      <span className="tabular-nums">{row.weight}%</span>
                    </span>
                    {row.method && <span className="text-sm text-pretty text-muted">{row.method}</span>}
                    <span className="text-xs text-muted">
                      {row.outcomes.join(", ")}
                      {isMismatch && <span className="text-rose-700"> · Bảng điểm: {component ? `${component.weight}%` : "không có"}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Kế hoạch giảng dạy" flush>
        <Table rowKey="week" size="small" columns={WEEK_COLUMNS} dataSource={syllabus.weeks} pagination={false} scroll={{ x: 800 }} className="hidden md:block" />
        <ul className="flex flex-col divide-y divide-border-strong md:hidden">
          {syllabus.weeks.map((week) => (
            <li key={week.week} className="flex flex-col gap-1 px-4 sm:px-5 py-3">
              <span className="text-xs text-muted tabular-nums">Tuần {week.week}</span>
              <span className="text-sm text-pretty">{week.topic || <span className="text-muted">Chưa nhập</span>}</span>
              {week.activities && <span className="text-xs text-pretty text-muted">{week.activities}</span>}
              {week.readings && <span className="text-xs text-pretty text-muted">Đọc: {week.readings}</span>}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
