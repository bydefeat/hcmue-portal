"use client";

import { useEffect, useTransition } from "react";
import { AutoComplete, Button, DatePicker, Drawer, Form, Input, Radio, Select } from "antd";
import { dayjs } from "@/shared/libs/date.lib";
import { MOCK_MAJORS } from "@/shared/libs/mock.lib";
import { COHORT_OPTIONS, MAJOR_OPTIONS, STUDENT_STATUS_OPTIONS } from "@/modules/users/users.constant";
import type { Student, StudentFormValues } from "@/modules/users/users.type";
import { formatStudentCode, isStudentCode } from "@/shared/libs/student-code.lib";
import { toFormFields } from "@/shared/libs/form.lib";

type StudentFormDrawerProps = {
  open: boolean;
  student: Student | null;
  onClose: () => void;
  // Trả lỗi theo ô khi server từ chối, để drawer gắn vào đúng ô.
  onSubmit: (values: StudentFormValues) => Promise<Record<string, string> | undefined>;
};

type FormShape = Omit<StudentFormValues, "dateOfBirth"> & { dateOfBirth?: dayjs.Dayjs };

function classSuggestions(cohort?: number, majorCode?: string) {
  const major = MOCK_MAJORS.find((entry) => entry.code === majorCode);
  if (!cohort || !major) return [];
  return ["A", "B", "C"].map((section) => ({ value: `${cohort}.01.${major.short}.${section}` }));
}

export function StudentFormDrawer({ open, student, onClose, onSubmit }: StudentFormDrawerProps) {
  const [form] = Form.useForm<FormShape>();
  const cohort = Form.useWatch("cohort", form);
  const majorCode = Form.useWatch("majorCode", form);
  const isEdit = student !== null;
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (student) form.setFieldsValue({ ...student, dateOfBirth: dayjs(student.dateOfBirth) });
  }, [open, student, form]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={560}
      mask={{ closable: false }}
      destroyOnHidden
      title={isEdit ? `Sửa hồ sơ ${student.fullName}` : "Thêm sinh viên"}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={isPending} onClick={() => form.submit()}>
            {isEdit ? "Lưu thay đổi" : "Thêm sinh viên"}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ status: "studying" }}
        onFinish={(values) =>
          startTransition(async () => {
            const fieldErrors = await onSubmit({ ...values, code: formatStudentCode(values.code), dateOfBirth: values.dateOfBirth?.format("YYYY-MM-DD") ?? "" });
            if (fieldErrors) form.setFields(toFormFields(fieldErrors));
          })
        }
      >
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item
            name="code"
            label="Mã sinh viên"
            rules={[
              { required: true, message: "Chưa nhập mã sinh viên" },
              {
                validator: (_, value?: string) =>
                  !value || isStudentCode(value) ? Promise.resolve() : Promise.reject(new Error("Mã sinh viên gồm 10 chữ số, ví dụ 49.01.104.012")),
              },
            ]}
          >
            <Input inputMode="decimal" placeholder="49.01.104.012" disabled={isEdit} />
          </Form.Item>
          <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, whitespace: true, message: "Chưa nhập họ và tên" }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="gender" label="Giới tính" rules={[{ required: true, message: "Chưa chọn giới tính" }]}>
            <Radio.Group
              options={[
                { value: "female", label: "Nữ" },
                { value: "male", label: "Nam" },
              ]}
            />
          </Form.Item>
          <Form.Item name="dateOfBirth" label="Ngày sinh" rules={[{ required: true, message: "Chưa chọn ngày sinh" }]}>
            <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày" className="w-full" />
          </Form.Item>
          <Form.Item name="majorCode" label="Ngành" rules={[{ required: true, message: "Chưa chọn ngành" }]}>
            <Select options={MAJOR_OPTIONS} showSearch={{ optionFilterProp: "label" }} />
          </Form.Item>
          <Form.Item name="cohort" label="Khóa" rules={[{ required: true, message: "Chưa chọn khóa" }]}>
            <Select options={COHORT_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="className"
            label="Lớp sinh hoạt"
            extra="Gợi ý theo khóa và ngành đã chọn"
            rules={[{ required: true, message: "Chưa nhập lớp sinh hoạt" }]}
          >
            <AutoComplete options={classSuggestions(cohort, majorCode)} />
          </Form.Item>
          <Form.Item name="status" label="Tình trạng">
            <Select options={STUDENT_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: "Chưa nhập email" },
              { type: "email", message: "Email cần có dấu @ và tên miền" },
            ]}
          >
            <Input autoComplete="off" inputMode="email" />
          </Form.Item>
          <Form.Item name="phone" label="Điện thoại" rules={[{ pattern: /^0\d{9}$/, message: "Số điện thoại gồm 10 số, bắt đầu bằng 0" }]}>
            <Input autoComplete="off" inputMode="tel" className="tabular-nums" />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
