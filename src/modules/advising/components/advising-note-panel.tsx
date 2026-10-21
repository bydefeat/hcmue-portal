"use client";

import { useState, useTransition } from "react";
import { Button, Form, Input, message, Modal } from "antd";
import { Notes, Plus } from "defeat-icons-react";
import { SectionCard } from "@/shared/components/ui/section-card";
import { formatDateTime } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { createAdvisingNote } from "@/modules/advising/advising.action";
import type { MeetingNote } from "@/modules/advising/advising.type";

type Values = { topic: string; content: string; followUp?: string };

export function AdvisingNotePanel({ studentId, notes: initial }: { studentId: string; notes: MeetingNote[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [notes, setNotes] = useState(initial);
  const [isOpen, setIsOpen] = useState(false);
  const [form] = Form.useForm<Values>();
  const [isSaving, startSaving] = useTransition();

  const submit = (values: Values) =>
    startSaving(async () => {
      const result = await createAdvisingNote({ studentId, topic: values.topic, content: values.content, followUp: values.followUp ?? null }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      setNotes((current) => [result.data, ...current]);
      setIsOpen(false);
      form.resetFields();
      messageApi.success("Đã thêm ghi chú vào hồ sơ cố vấn");
    });

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Notes size={18} aria-hidden className="text-muted" />
          Ghi chú cố vấn
        </span>
      }
      extra={
        <Button size="small" icon={<Plus size={14} aria-hidden className="text-zinc-500" />} onClick={() => setIsOpen(true)}>
          Thêm ghi chú
        </Button>
      }
    >
      {contextHolder}
      {notes.length === 0 ? (
        <p className="text-sm text-muted">Chưa có ghi chú. Ghi chú tạo ra khi ghi nhận buổi gặp hoặc thêm trực tiếp ở đây.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-strong">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-1 py-3">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{note.topic}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">{formatDateTime(note.at)}</span>
              </span>
              <span className="text-xs text-muted">
                {note.author} · {note.appointmentId ? "Từ buổi hẹn" : "Ghi chú độc lập"}
              </span>
              <p className="text-sm text-pretty">{note.content}</p>
              {note.followUp && <p className="text-xs text-amber-700">Việc tiếp theo: {note.followUp}</p>}
            </li>
          ))}
        </ul>
      )}
      <Modal open={isOpen} title="Thêm ghi chú cố vấn" okText="Lưu ghi chú" cancelText="Hủy" onOk={() => form.submit()} confirmLoading={isSaving} onCancel={() => setIsOpen(false)} mask={{ closable: false }} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="topic" label="Chủ đề" rules={[{ required: true, whitespace: true, message: "Nhập chủ đề" }]}>
            <Input maxLength={200} placeholder="Ví dụ: Gọi điện nhắc đăng ký học lại" />
          </Form.Item>
          <Form.Item name="content" label="Nội dung" rules={[{ required: true, whitespace: true, message: "Nhập nội dung" }]}>
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} showCount />
          </Form.Item>
          <Form.Item name="followUp" label="Việc cần theo dõi">
            <Input maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>
    </SectionCard>
  );
}
