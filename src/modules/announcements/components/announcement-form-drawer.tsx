"use client";

import { useEffect } from "react";
import { Button, Checkbox, DatePicker, Drawer, Form, Input, Radio, Select } from "antd";
import { dayjs } from "@/shared/libs/date.lib";
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_CATEGORY_OPTIONS } from "@/modules/announcements/announcements.constant";
import type { Announcement, AnnouncementFormValues } from "@/modules/announcements/announcements.type";

type FormShape = Omit<AnnouncementFormValues, "deadline" | "publishedAt"> & {
  deadline?: dayjs.Dayjs;
  publishedAt?: dayjs.Dayjs;
};

type AnnouncementFormDrawerProps = {
  open: boolean;
  announcement: Announcement | null;
  onClose: () => void;
  onSubmit: (values: AnnouncementFormValues) => void;
};

const CONTENT_LIMIT = 2000;
const SUMMARY_LIMIT = 200;

function publishModeOf(announcement: Announcement): AnnouncementFormValues["publishMode"] {
  if (announcement.status === "scheduled") return "schedule";
  if (announcement.status === "draft") return "draft";
  return "now";
}

export function AnnouncementFormDrawer({ open, announcement, onClose, onSubmit }: AnnouncementFormDrawerProps) {
  const [form] = Form.useForm<FormShape>();
  const publishMode = Form.useWatch("publishMode", form);
  const isEdit = announcement !== null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (announcement) {
      form.setFieldsValue({
        ...announcement,
        publishMode: publishModeOf(announcement),
        deadline: announcement.deadline ? dayjs(announcement.deadline) : undefined,
        publishedAt: announcement.publishedAt ? dayjs(announcement.publishedAt) : undefined,
      });
    }
  }, [open, announcement, form]);

  const submitLabel = publishMode === "draft" ? "Lưu nháp" : publishMode === "schedule" ? "Hẹn giờ đăng" : "Đăng ngay";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={640}
      mask={{ closable: false }}
      destroyOnHidden
      title={isEdit ? "Sửa thông báo" : "Soạn thông báo"}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" onClick={() => form.submit()}>
            {submitLabel}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ publishMode: "now", isPinned: false }}
        onFinish={(values) =>
          onSubmit({
            ...values,
            deadline: values.deadline?.toISOString(),
            publishedAt: values.publishMode === "schedule" ? values.publishedAt?.toISOString() : undefined,
          })
        }
      >
        <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, whitespace: true, message: "Chưa nhập tiêu đề" }]}>
          <Input maxLength={160} showCount />
        </Form.Item>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item name="category" label="Loại thông báo" rules={[{ required: true, message: "Chưa chọn loại" }]}>
            <Select options={ANNOUNCEMENT_CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="deadline" label="Hạn chót" extra="Bỏ trống nếu thông báo không có hạn">
            <DatePicker showTime={{ format: "HH:mm" }} format="HH:mm DD/MM/YYYY" placeholder="Chọn ngày giờ" className="w-full" />
          </Form.Item>
        </div>
        <Form.Item name="audiences" label="Đối tượng" rules={[{ required: true, message: "Chọn ít nhất một đối tượng" }]}>
          <Select mode="multiple" options={ANNOUNCEMENT_AUDIENCES.map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="summary" label="Tóm tắt" extra="Hiện trong danh sách thông báo và email gửi đi">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={SUMMARY_LIMIT} showCount />
        </Form.Item>
        <Form.Item name="content" label="Nội dung" rules={[{ required: true, whitespace: true, message: "Chưa nhập nội dung" }]}>
          <Input.TextArea autoSize={{ minRows: 6, maxRows: 14 }} maxLength={CONTENT_LIMIT} showCount />
        </Form.Item>
        <Form.Item name="isPinned" valuePropName="checked">
          <Checkbox>Ghim lên đầu trang chủ</Checkbox>
        </Form.Item>
        <Form.Item name="publishMode" label="Thời điểm đăng">
          <Radio.Group
            options={[
              { value: "now", label: "Đăng ngay" },
              { value: "schedule", label: "Hẹn giờ" },
              { value: "draft", label: "Lưu nháp" },
            ]}
          />
        </Form.Item>
        {publishMode === "schedule" && (
          <Form.Item
            name="publishedAt"
            label="Đăng lúc"
            rules={[
              { required: true, message: "Chưa chọn thời điểm đăng" },
              {
                validator: (_, value?: dayjs.Dayjs) =>
                  !value || value.isAfter(dayjs()) ? Promise.resolve() : Promise.reject(new Error("Thời điểm đăng phải sau hiện tại")),
              },
            ]}
          >
            <DatePicker showTime={{ format: "HH:mm" }} format="HH:mm DD/MM/YYYY" placeholder="Chọn ngày giờ" className="w-full" />
          </Form.Item>
        )}
      </Form>
    </Drawer>
  );
}
