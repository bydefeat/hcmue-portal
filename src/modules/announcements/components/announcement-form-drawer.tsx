"use client";

import { useEffect, useTransition } from "react";
import { Button, Checkbox, DatePicker, Drawer, Form, Input, Radio, Select } from "antd";
import { dayjs } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { ANNOUNCEMENT_CATEGORY_OPTIONS } from "@/modules/announcements/announcements.constant";
import { EVERYONE } from "@/modules/announcements/announcements.rule";
import type { Announcement, AnnouncementAudienceOptions, AnnouncementFormValues } from "@/modules/announcements/announcements.type";

type FormShape = Omit<AnnouncementFormValues, "deadline" | "publishedAt" | "audience"> & {
  deadline?: dayjs.Dayjs;
  publishedAt?: dayjs.Dayjs;
  targets: ("students" | "lecturers")[];
  cohorts: number[];
  facultyIds: string[];
  majorIds: string[];
};

type AnnouncementFormDrawerProps = {
  open: boolean;
  announcement: Announcement | null;
  audienceOptions: AnnouncementAudienceOptions;
  onClose: () => void;
  onSubmit: (values: AnnouncementFormValues) => Promise<Record<string, string> | undefined>;
};

const CONTENT_LIMIT = 2000;
const SUMMARY_LIMIT = 200;

function publishModeOf(announcement: Announcement): AnnouncementFormValues["publishMode"] {
  if (announcement.status === "scheduled") return "schedule";
  if (announcement.status === "draft") return "draft";
  return "now";
}

export function AnnouncementFormDrawer({ open, announcement, audienceOptions, onClose, onSubmit }: AnnouncementFormDrawerProps) {
  const [form] = Form.useForm<FormShape>();
  const [isPending, startTransition] = useTransition();
  const publishMode = Form.useWatch("publishMode", form);
  const targets = Form.useWatch("targets", form) ?? [];
  const facultyIds = Form.useWatch("facultyIds", form) ?? [];
  const isEdit = announcement !== null;
  const wasPublished = announcement !== null && (announcement.status === "published" || announcement.status === "archived");
  const alreadySent = announcement?.notifiedAt !== null && announcement?.notifiedAt !== undefined;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (announcement) {
      const { audience, ...rest } = announcement;
      form.setFieldsValue({
        ...rest,
        targets: [...(audience.students ? ["students" as const] : []), ...(audience.lecturers ? ["lecturers" as const] : [])],
        cohorts: audience.cohorts,
        facultyIds: audience.facultyIds,
        majorIds: audience.majorIds,
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
          <Button type="primary" loading={isPending} onClick={() => form.submit()}>
            {submitLabel}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ publishMode: "now", isPinned: false, targets: ["students", "lecturers"], cohorts: EVERYONE.cohorts, facultyIds: [], majorIds: [], notifyPortal: false, notifyEmail: false }}
        onFinish={({ targets: chosen, cohorts, facultyIds: faculties, majorIds, ...values }) =>
          startTransition(async () => {
            const fieldErrors = await onSubmit({
              ...values,
              audience: { students: chosen.includes("students"), lecturers: chosen.includes("lecturers"), cohorts, facultyIds: faculties, majorIds },
              deadline: values.deadline?.toISOString(),
              publishedAt: values.publishMode === "schedule" ? values.publishedAt?.toISOString() : undefined,
            });
            if (fieldErrors) form.setFields(toFormFields(Object.fromEntries(Object.entries(fieldErrors).map(([key, value]) => [key.startsWith("audience") ? "targets" : key, value]))));
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
        <Form.Item name="targets" label="Gửi tới" rules={[{ required: true, message: "Chọn sinh viên, giảng viên hoặc cả hai" }]} extra="Thông báo chỉ gửi giảng viên không hiện trên trang công khai.">
          <Checkbox.Group
            options={[
              { value: "students", label: "Sinh viên" },
              { value: "lecturers", label: "Giảng viên" },
            ]}
          />
        </Form.Item>
        <Form.Item name="facultyIds" label="Khoa" extra="Bỏ trống là toàn trường">
          <Select mode="multiple" allowClear showSearch={{ optionFilterProp: "label" }} options={audienceOptions.faculties.map((faculty) => ({ value: faculty.id, label: faculty.name }))} />
        </Form.Item>
        {targets.includes("students") && (
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Form.Item name="cohorts" label="Khóa sinh viên" extra="Bỏ trống là mọi khóa">
              <Select mode="multiple" allowClear options={audienceOptions.cohorts.map((cohort) => ({ value: cohort, label: `Khóa ${cohort}` }))} />
            </Form.Item>
            <Form.Item name="majorIds" label="Ngành" extra="Bỏ trống là mọi ngành">
              <Select
                mode="multiple"
                allowClear
                showSearch={{ optionFilterProp: "label" }}
                options={audienceOptions.majors.filter((major) => facultyIds.length === 0 || facultyIds.includes(major.facultyId)).map((major) => ({ value: major.id, label: major.name }))}
              />
            </Form.Item>
          </div>
        )}
        <Form.Item name="summary" label="Tóm tắt" extra="Hiện trong danh sách thông báo">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={SUMMARY_LIMIT} showCount />
        </Form.Item>
        <Form.Item name="content" label="Nội dung" rules={[{ required: true, whitespace: true, message: "Chưa nhập nội dung" }]}>
          <Input.TextArea autoSize={{ minRows: 6, maxRows: 14 }} maxLength={CONTENT_LIMIT} showCount />
        </Form.Item>
        <Form.Item name="isPinned" valuePropName="checked">
          <Checkbox>Ghim lên đầu trang chủ</Checkbox>
        </Form.Item>
        <Form.Item label="Gửi kèm" extra={alreadySent ? "Thông báo đã gửi khi đăng, sửa nội dung không gửi lại." : "Gửi một lần khi đăng (bài hẹn giờ gửi khi tới giờ đăng)."}>
          <div className="flex flex-col gap-1">
            <Form.Item name="notifyPortal" valuePropName="checked" noStyle>
              <Checkbox disabled={alreadySent}>Thông báo cá nhân trên cổng của đối tượng</Checkbox>
            </Form.Item>
            <Form.Item name="notifyEmail" valuePropName="checked" noStyle>
              <Checkbox disabled={alreadySent}>Email tới hộp thư trường của đối tượng</Checkbox>
            </Form.Item>
          </div>
        </Form.Item>
        <Form.Item name="publishMode" label="Thời điểm đăng">
          <Radio.Group
            options={[
              { value: "now", label: "Đăng ngay" },
              { value: "schedule", label: "Hẹn giờ" },
              { value: "draft", label: "Lưu nháp", disabled: wasPublished },
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
