"use client";

import { useState } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal } from "antd";
import { Plus, Trash } from "defeat-icons-react";
import { MAX_GRADE_COMPONENTS } from "@/modules/grades/grades.rule";
import type { GradeComponent } from "@/modules/grades/grades.type";

type EditableComponent = { key: string | null; label: string; weight: number | null };

type GradeComponentsEditorProps = {
  open: boolean;
  components: GradeComponent[];
  suggested: GradeComponent[] | null;
  scoredCount: Record<string, number>;
  onCancel: () => void;
  onSave: (components: { key: string | null; label: string; weight: number }[], confirmDropScores: boolean) => Promise<string | null>;
};

export function GradeComponentsEditor({ open, components, suggested, scoredCount, onCancel, onSave }: GradeComponentsEditorProps) {
  const [form] = Form.useForm<{ components: EditableComponent[] }>();
  const [modal, modalContextHolder] = Modal.useModal();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const watched = Form.useWatch("components", form) ?? [];
  const total = watched.reduce((sum, component) => sum + (component?.weight ?? 0), 0);

  const applySyllabus = () => {
    if (!suggested) return;
    const existing = new Set(components.map((component) => component.key));
    form.setFieldValue(
      "components",
      suggested.map((component) => ({ key: existing.has(component.key) ? component.key : null, label: component.label, weight: component.weight })),
    );
  };

  const submit = async () => {
    const values = await form.validateFields();
    const next = values.components.map((component) => ({ key: component.key, label: component.label.trim(), weight: component.weight ?? 0 }));
    const keptKeys = new Set(next.flatMap((component) => (component.key ? [component.key] : [])));
    const dropped = components.filter((component) => !keptKeys.has(component.key) && (scoredCount[component.key] ?? 0) > 0);
    const save = async (confirm: boolean) => {
      setIsSaving(true);
      setError(await onSave(next, confirm));
      setIsSaving(false);
    };
    if (dropped.length === 0) {
      await save(false);
      return;
    }
    modal.confirm({
      title: `Xóa ${dropped.length === 1 ? "cột" : `${dropped.length} cột`} đã có điểm?`,
      content: `${dropped.map((component) => `${component.label} (${scoredCount[component.key]} điểm)`).join(", ")} sẽ bị xóa cùng toàn bộ điểm đã nhập của cột. Không hoàn tác được.`,
      okText: "Xóa cột và điểm",
      okButtonProps: { danger: true },
      cancelText: "Giữ lại",
      onOk: () => save(true),
    });
  };

  return (
    <Modal
      open={open}
      title="Sửa cột điểm"
      okText="Lưu cột điểm"
      cancelText="Hủy"
      okButtonProps={{ disabled: total !== 100, loading: isSaving }}
      onOk={() => void submit()}
      onCancel={onCancel}
      afterOpenChange={(visible) => {
        if (visible) setError(null);
      }}
      destroyOnHidden
    >
      {modalContextHolder}
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ components }} className="flex flex-col gap-3">
        {suggested && (
          <Alert
            type="info"
            showIcon
            title="Đề cương đã công bố có cách đánh giá riêng"
            description={
              <span className="flex flex-col items-start gap-2">
                <span className="text-pretty">{suggested.map((component) => `${component.label} ${component.weight}%`).join(", ")}</span>
                <Button size="small" onClick={applySyllabus}>
                  Dùng cột theo đề cương
                </Button>
              </span>
            }
          />
        )}
        <Form.List name="components">
          {(fields, { add, remove }) => (
            <div className="flex flex-col gap-2">
              {fields.map((field, index) => {
                const key = (watched[index]?.key ?? null) as string | null;
                const scored = key ? (scoredCount[key] ?? 0) : 0;
                return (
                  <div key={field.key} className="flex items-start gap-2">
                    <Form.Item name={[field.name, "key"]} hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "label"]}
                      className="mb-0 min-w-0 flex-1"
                      rules={[
                        { required: true, whitespace: true, message: "Chưa nhập tên cột" },
                        { max: 40, message: "Tối đa 40 ký tự" },
                      ]}
                      extra={scored > 0 ? <span className="text-xs tabular-nums">{scored} điểm đã nhập</span> : key === null ? <span className="text-xs">Cột mới</span> : undefined}
                    >
                      <Input aria-label={`Tên cột ${index + 1}`} />
                    </Form.Item>
                    <Form.Item name={[field.name, "weight"]} className="mb-0 w-28" rules={[{ required: true, message: "Nhập trọng số" }]}>
                      <InputNumber aria-label={`Trọng số cột ${index + 1}`} min={1} max={100} precision={0} suffix="%" className="w-full tabular-nums" />
                    </Form.Item>
                    <Button
                      type="text"
                      aria-label={`Xóa cột ${index + 1}`}
                      disabled={fields.length === 1}
                      icon={<Trash size={16} aria-hidden className="text-zinc-500" />}
                      onClick={() => remove(field.name)}
                    />
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  icon={<Plus size={16} aria-hidden className="text-zinc-500" />}
                  disabled={fields.length >= MAX_GRADE_COMPONENTS}
                  onClick={() => add({ key: null, label: "", weight: Math.max(1, 100 - total) })}
                >
                  Thêm cột
                </Button>
                <span className={`text-sm tabular-nums ${total === 100 ? "text-muted" : "font-medium text-amber-700"}`}>
                  Tổng trọng số {total}%{total === 100 ? "" : `, cần đúng 100%`}
                </span>
              </div>
            </div>
          )}
        </Form.List>
        {error && <Alert type="error" showIcon title={error} />}
      </Form>
    </Modal>
  );
}
