"use client";

import { useEffect, useState } from "react";
import { Button, Card, Checkbox, DatePicker, Drawer, Form, Input, message, Modal, Switch } from "antd";
import { Envelope, Pin, Plus } from "defeat-icons-react";
import type { Dayjs } from "dayjs";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDateTime, formatRelative } from "@/shared/libs/date.lib";
import { CLASS_ANNOUNCEMENT_STATUS } from "../teaching.constant";
import type { ClassAnnouncement } from "../teaching.type";

type ClassAnnouncementBoardProps = {
  announcements: ClassAnnouncement[];
  classSectionId: string;
  classCode: string;
  studentCount: number;
  author: string;
};

type FormValues = {
  title: string;
  body: string;
  isPinned: boolean;
  sendEmail: boolean;
  schedule: boolean;
  publishAt?: Dayjs;
};

export function ClassAnnouncementBoard({ announcements, classSectionId, classCode, studentCount, author }: ClassAnnouncementBoardProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(announcements);
  const [editing, setEditing] = useState<ClassAnnouncement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const schedule = Form.useWatch("schedule", form);
  const sendEmail = Form.useWatch("sendEmail", form);

  useEffect(() => {
    if (!isOpen) return;
    form.resetFields();
    if (editing) {
      form.setFieldsValue({
        title: editing.title,
        body: editing.body,
        isPinned: editing.isPinned,
        sendEmail: editing.sendEmail,
        schedule: editing.status === "scheduled",
        publishAt: editing.status === "scheduled" ? dayjs(editing.publishAt) : undefined,
      });
    }
  }, [isOpen, editing, form]);

  const ordered = [...rows].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.publishAt.localeCompare(a.publishAt));

  const openCompose = (announcement: ClassAnnouncement | null) => {
    setEditing(announcement);
    setIsOpen(true);
  };

  const submit = (values: FormValues) => {
    const publishAt = values.schedule && values.publishAt ? values.publishAt.toISOString() : dayjs().toISOString();
    const next: ClassAnnouncement = {
      id: editing?.id ?? `tbl-moi-${Date.now()}`,
      classSectionId,
      title: values.title.trim(),
      body: values.body.trim(),
      isPinned: values.isPinned,
      sendEmail: values.sendEmail,
      status: values.schedule ? "scheduled" : "published",
      publishAt,
      author,
      readCount: editing?.readCount ?? 0,
    };
    setRows((current) => (editing ? current.map((row) => (row.id === editing.id ? next : row)) : [next, ...current]));
    setIsOpen(false);
    const emailText = values.sendEmail && !editing ? `, email đã gửi tới ${studentCount} sinh viên` : "";
    messageApi.success(values.schedule ? `Đã hẹn đăng lúc ${formatDateTime(publishAt)}` : `Đã đăng thông báo cho lớp ${classCode}${emailText}`);
  };

  const remove = (announcement: ClassAnnouncement) =>
    modal.confirm({
      title: "Xóa thông báo này?",
      content: "Sinh viên sẽ không còn thấy thông báo trên cổng. Email đã gửi không thu hồi được.",
      okText: "Xóa thông báo",
      okButtonProps: { danger: true },
      cancelText: "Giữ lại",
      mask: { closable: false },
      onOk: () => {
        setRows((current) => current.filter((row) => row.id !== announcement.id));
        messageApi.success("Đã xóa thông báo");
      },
    });

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      {modalContextHolder}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">
          {rows.length} thông báo · gửi tới {studentCount} sinh viên của lớp
        </span>
        <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => openCompose(null)}>
          Soạn thông báo
        </Button>
      </div>

      {ordered.length === 0 ? (
        <SectionCard flush>
          <EmptyState
            title="Lớp chưa có thông báo"
            description="Thông báo lịch nghỉ, bài tập hay tài liệu cho riêng lớp này. Có thể gửi kèm email."
          />
        </SectionCard>
      ) : (
        <ul className="flex flex-col gap-3">
          {ordered.map((announcement) => (
            <li key={announcement.id}>
              <Card size="small">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <h2 className="flex items-center gap-2 text-base font-semibold text-pretty">
                        {announcement.isPinned && <Pin size={16} aria-label="Đã ghim" className="shrink-0 text-primary" />}
                        {announcement.title}
                      </h2>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        {announcement.status === "scheduled" && <StatusTag status={CLASS_ANNOUNCEMENT_STATUS.scheduled} />}
                        <span className="tabular-nums" title={formatDateTime(announcement.publishAt)}>
                          {announcement.status === "scheduled" ? `Đăng lúc ${formatDateTime(announcement.publishAt)}` : formatRelative(announcement.publishAt)}
                        </span>
                        {announcement.sendEmail && (
                          <span className="flex items-center gap-1">
                            <Envelope size={14} aria-hidden />
                            Có gửi email
                          </span>
                        )}
                        {announcement.status === "published" && (
                          <span className="tabular-nums">
                            {announcement.readCount}/{studentCount} đã xem
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="hidden shrink-0 gap-2 sm:flex">
                      <Button size="small" onClick={() => openCompose(announcement)}>
                        Sửa
                      </Button>
                      <Button size="small" danger onClick={() => remove(announcement)}>
                        Xóa
                      </Button>
                    </div>
                  </div>
                  <p className="max-w-prose text-sm text-pretty whitespace-pre-line">{announcement.body}</p>
                  <div className="flex justify-end gap-2 sm:hidden">
                    <Button size="small" onClick={() => openCompose(announcement)}>
                      Sửa
                    </Button>
                    <Button size="small" danger onClick={() => remove(announcement)}>
                      Xóa
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={isOpen}
        onClose={() => setIsOpen(false)}
        size={520}
        destroyOnHidden
        mask={{ closable: false }}
        title={editing ? "Sửa thông báo" : `Thông báo cho lớp ${classCode}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setIsOpen(false)}>Hủy</Button>
            <Button type="primary" onClick={() => form.submit()}>
              {schedule ? "Hẹn giờ đăng" : editing ? "Lưu" : "Đăng ngay"}
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ isPinned: false, sendEmail: false, schedule: false }}>
          <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, whitespace: true, message: "Chưa nhập tiêu đề" }]}>
            <Input maxLength={120} showCount />
          </Form.Item>
          <Form.Item name="body" label="Nội dung" rules={[{ required: true, whitespace: true, message: "Chưa nhập nội dung" }]}>
            <Input.TextArea autoSize={{ minRows: 5, maxRows: 12 }} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item name="isPinned" valuePropName="checked" className="mb-2">
            <Checkbox>Ghim đầu trang lớp</Checkbox>
          </Form.Item>
          <Form.Item name="sendEmail" valuePropName="checked" className="mb-2" extra={sendEmail && editing ? "Email chỉ gửi khi đăng mới, sửa không gửi lại." : undefined}>
            <Checkbox>Gửi email cho cả lớp ({studentCount} sinh viên)</Checkbox>
          </Form.Item>
          <Form.Item name="schedule" label="Hẹn giờ đăng" valuePropName="checked">
            <Switch />
          </Form.Item>
          {schedule && (
            <Form.Item
              name="publishAt"
              label="Thời điểm đăng"
              rules={[
                { required: true, message: "Chọn thời điểm đăng" },
                { validator: (_, value?: Dayjs) => (value && value.isBefore(dayjs()) ? Promise.reject(new Error("Thời điểm đăng phải sau hiện tại")) : Promise.resolve()) },
              ]}
            >
              <DatePicker showTime={{ format: "HH:mm" }} format="HH:mm DD/MM/YYYY" className="w-full" />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
