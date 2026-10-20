"use client";

import { useEffect, useState, useTransition } from "react";
import { Avatar, Button, Descriptions, Form, Input, message, Modal } from "antd";
import { Pen } from "defeat-icons-react";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { LECTURER_STATUS, LECTURER_ROLES } from "@/modules/users/users.constant";
import { saveMyLecturerContact } from "@/modules/users/users.action";
import type { Lecturer } from "@/modules/users/users.type";
import { toFormFields } from "@/shared/libs/form.lib";

type ContactValues = {
  phone: string;
  personalEmail: string;
  office: string;
  officeHours: string;
};

function initialsOf(name: string) {
  return name.trim().split(/\s+/).at(-1)?.[0]?.toUpperCase() ?? "";
}

export function LecturerProfileCard({ lecturer }: { lecturer: Lecturer }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [contact, setContact] = useState<ContactValues>({
    phone: lecturer.phone,
    personalEmail: lecturer.personalEmail,
    office: lecturer.office,
    officeHours: lecturer.officeHours,
  });
  const [isSaving, startSaving] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [form] = Form.useForm<ContactValues>();
  useEffect(() => {
    if (isOpen) form.setFieldsValue(contact);
  }, [isOpen, contact, form]);

  const roleLabels = lecturer.roles.map((role) => LECTURER_ROLES.find((entry) => entry.value === role)?.label ?? role);

  return (
    <SectionCard>
      <div className="flex flex-col gap-4">
        {contextHolder}
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size={56} className="shrink-0 bg-primary-light text-lg font-medium text-primary">
            {initialsOf(lecturer.fullName)}
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-base font-semibold">{lecturer.displayName}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {lecturer.code}
              {lecturer.status !== "active" && <StatusTag status={LECTURER_STATUS[lecturer.status]} />}
            </p>
          </div>
        </div>
        <Descriptions
          size="small"
          column={1}
          items={[
            { key: "faculty", label: "Đơn vị", children: lecturer.faculty },
            { key: "roles", label: "Vai trò", children: roleLabels.join(", ") },
            { key: "email", label: "Email công vụ", children: <span className="break-all">{lecturer.email}</span> },
            { key: "personal", label: "Email cá nhân", children: contact.personalEmail || <span className="text-muted">Chưa khai báo</span> },
            { key: "phone", label: "Điện thoại", children: <span className="tabular-nums">{contact.phone}</span> },
            { key: "office", label: "Nơi làm việc", children: contact.office },
            { key: "hours", label: "Giờ tiếp sinh viên", children: contact.officeHours },
          ]}
        />
        <Button
          icon={<Pen size={16} aria-hidden className="text-zinc-500" />}
          onClick={() => setIsOpen(true)}
          className="self-start"
        >
          Sửa thông tin liên hệ
        </Button>
        <Modal
          open={isOpen}
          title="Thông tin liên hệ"
          okText="Lưu"
          cancelText="Hủy"
          onOk={() => form.submit()}
          confirmLoading={isSaving}
          onCancel={() => setIsOpen(false)}
          mask={{ closable: false }}
          destroyOnHidden
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={(values: ContactValues) =>
              startSaving(async () => {
                const result = await saveMyLecturerContact(values).catch(() => null);
                if (!result?.ok) {
                  if (result) form.setFields(toFormFields(result.fieldErrors));
                  messageApi.error(result?.message ?? "Chưa lưu được, kiểm tra kết nối rồi thử lại.");
                  return;
                }
                setContact(values);
                setIsOpen(false);
                messageApi.success("Đã lưu thông tin liên hệ. Sinh viên cố vấn thấy giờ tiếp mới ngay.");
              })
            }
          >
            <Form.Item
              name="phone"
              label="Điện thoại"
              rules={[
                { required: true, message: "Chưa nhập số điện thoại" },
                { pattern: /^0\d{9}$/, message: "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0" },
              ]}
            >
              <Input inputMode="tel" autoComplete="tel" className="tabular-nums" />
            </Form.Item>
            <Form.Item name="personalEmail" label="Email cá nhân" rules={[{ type: "email", message: "Email cần có dấu @ và tên miền" }]}>
              <Input inputMode="email" autoComplete="email" />
            </Form.Item>
            <Form.Item name="office" label="Nơi làm việc">
              <Input />
            </Form.Item>
            <Form.Item name="officeHours" label="Giờ tiếp sinh viên">
              <Input />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </SectionCard>
  );
}
