"use client";

import { useState } from "react";
import { Alert, Button, Form, Input, InputNumber, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { ArrowsTransaction, BookOpen, Pen, Plus, Trash } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDateTime } from "@/shared/libs/date.lib";
import { assessmentMismatches, SYLLABUS_STATUS } from "../teaching.constant";
import type { LearningOutcome, Syllabus, SyllabusAssessment, SyllabusWeek } from "../teaching.type";

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

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border-strong bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

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
    <div className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
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
        {isEditing ? (
          <>
            <Button onClick={() => setIsEditing(false)}>Hủy</Button>
            <Button type="primary" onClick={() => form.submit()}>
              Lưu
            </Button>
          </>
        ) : (
          <>
            <Button icon={<Pen size={16} aria-hidden />} onClick={startEdit}>
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
  );

  if (isEditing) {
    return (
      <div className="flex flex-col gap-4">
        {contextHolder}
        {modalContextHolder}
        {header}
        <Form form={form} layout="vertical" onFinish={save} className="flex flex-col gap-4">
          <Section title="Mô tả học phần">
            <Form.Item name="description" className="mb-0">
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={1500} showCount aria-label="Mô tả học phần" />
            </Form.Item>
          </Section>

          <Section title="Chuẩn đầu ra">
            <Form.List name="outcomes">
              {(fields, { add, remove }) => (
                <div className="flex flex-col gap-2">
                  {fields.map((field, index) => (
                    <div key={field.key} className="flex items-start gap-2">
                      <span className="w-14 shrink-0 pt-2 font-mono text-xs text-muted">CLO{index + 1}</span>
                      <Form.Item name={[field.name, "text"]} className="mb-0 min-w-0 flex-1" rules={[{ required: true, whitespace: true, message: "Chưa nhập nội dung" }]}>
                        <Input aria-label={`Chuẩn đầu ra ${index + 1}`} />
                      </Form.Item>
                      <Button type="text" aria-label="Xóa chuẩn đầu ra" icon={<Trash size={16} aria-hidden />} onClick={() => remove(field.name)} />
                    </div>
                  ))}
                  <Button icon={<Plus size={16} aria-hidden />} onClick={() => add({ code: "", text: "" })} className="self-start">
                    Thêm chuẩn đầu ra
                  </Button>
                </div>
              )}
            </Form.List>
          </Section>

          <Section
            title="Đánh giá"
            action={
              <Button size="small" icon={<ArrowsTransaction size={14} aria-hidden />} onClick={syncFromGradeSheet}>
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
                      <Button type="text" aria-label="Xóa hình thức đánh giá" icon={<Trash size={16} aria-hidden />} onClick={() => remove(field.name)} className="md:mt-8" />
                    </div>
                  ))}
                  <Button icon={<Plus size={16} aria-hidden />} onClick={() => add({ key: `custom-${Date.now()}`, label: "", weight: 0, method: "", outcomes: [] })} className="self-start">
                    Thêm hình thức đánh giá
                  </Button>
                </div>
              )}
            </Form.List>
          </Section>

          <Section title="Kế hoạch 15 tuần">
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
          </Section>

          <Section title="Tài liệu tham khảo">
            <Form.List name="references">
              {(fields, { add, remove }) => (
                <div className="flex flex-col gap-2">
                  {fields.map((field, index) => (
                    <div key={field.key} className="flex items-center gap-2">
                      <Form.Item name={[field.name, "text"]} className="mb-0 min-w-0 flex-1">
                        <Input aria-label={`Tài liệu ${index + 1}`} />
                      </Form.Item>
                      <Button type="text" aria-label="Xóa tài liệu" icon={<Trash size={16} aria-hidden />} onClick={() => remove(field.name)} />
                    </div>
                  ))}
                  <Button icon={<Plus size={16} aria-hidden />} onClick={() => add({ text: "" })} className="self-start">
                    Thêm tài liệu
                  </Button>
                </div>
              )}
            </Form.List>
          </Section>
        </Form>
      </div>
    );
  }

  const assessmentColumns: TableColumnsType<SyllabusAssessment> = [
    { title: "Hình thức", dataIndex: "label", width: 160, render: (value: string) => <span className="font-medium">{value}</span> },
    { title: "Trọng số", dataIndex: "weight", width: 96, align: "right", render: (value: number) => <span className="tabular-nums">{value}%</span> },
    {
      title: "Bảng điểm",
      key: "sheet",
      width: 110,
      align: "right",
      render: (_, row) => {
        const component = gradeComponents.find((entry) => entry.key === row.key);
        if (!component) return <span className="text-rose-700">Không có</span>;
        return <span className={`tabular-nums ${component.weight === row.weight ? "text-muted" : "text-rose-700"}`}>{component.weight}%</span>;
      },
    },
    { title: "Cách đánh giá", dataIndex: "method", width: 240, render: (value: string) => <span className="text-muted">{value}</span> },
    { title: "Chuẩn đầu ra", dataIndex: "outcomes", width: 160, render: (value: string[]) => <span className="font-mono text-xs">{value.join(", ")}</span> },
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
          <Section title="Mô tả và chuẩn đầu ra">
            <p className="max-w-prose text-sm text-pretty">{syllabus.description || <span className="text-muted">Chưa có mô tả.</span>}</p>
            <ul className="flex flex-col gap-2">
              {syllabus.outcomes.map((outcome) => (
                <li key={outcome.code} className="flex gap-3 text-sm">
                  <span className="w-12 shrink-0 font-mono text-xs text-muted">{outcome.code}</span>
                  <span className="text-pretty">{outcome.text}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Tài liệu tham khảo">
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
          </Section>
        </div>
      ) : (
        <div className="rounded-xl border border-border-strong bg-surface">
          <EmptyState
            icon={BookOpen}
            title="Lớp chưa có đề cương"
            description="Soạn mô tả, chuẩn đầu ra, cách đánh giá và kế hoạch 15 tuần rồi công bố cho sinh viên."
            action={
              <Button type="primary" onClick={startEdit}>
                Soạn đề cương
              </Button>
            }
          />
        </div>
      )}

      <Section title="Đánh giá" action={<span className={`text-sm tabular-nums ${totalWeight === 100 ? "text-muted" : "text-rose-700"}`}>Tổng {totalWeight}%</span>}>
        <Table
          rowKey="key"
          size="small"
          columns={assessmentColumns}
          dataSource={syllabus.assessments}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{ emptyText: <EmptyState title="Chưa có hình thức đánh giá" description="Bấm Sửa đề cương, chọn Lấy theo bảng điểm để điền nhanh." /> }}
        />
      </Section>

      <Section title="Kế hoạch giảng dạy">
        <Table rowKey="week" size="small" columns={WEEK_COLUMNS} dataSource={syllabus.weeks} pagination={false} scroll={{ x: 800 }} />
      </Section>
    </div>
  );
}
