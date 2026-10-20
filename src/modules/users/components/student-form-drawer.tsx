"use client";

import { useEffect, useTransition } from "react";
import { AutoComplete, Button, Checkbox, DatePicker, Drawer, Form, Input, Radio, Select } from "antd";
import { dayjs } from "@/shared/libs/date.lib";
import { classSuggestions, cohortOptions, majorOptions } from "@/modules/users/users.constant";
import { EMAIL_MESSAGE, PHONE_MESSAGE } from "@/modules/users/users.rule";
import type { ClassRef, MajorRef, Student, StudentFormValues } from "@/modules/users/users.type";
import { formatStudentCode, isStudentCode, isStudentEmail, studentEmailOf } from "@/shared/libs/student-code.lib";
import { toFormFields } from "@/shared/libs/form.lib";

type StudentFormDrawerProps = {
  open: boolean;
  student: Student | null;
  majors: MajorRef[];
  cohorts: number[];
  classes: ClassRef[];
  onClose: () => void;
  // Trả lỗi theo ô khi server từ chối, để drawer gắn vào đúng ô.
  onSubmit: (values: StudentFormValues, options: { provisionAccount: boolean }) => Promise<Record<string, string> | undefined>;
};

type FormShape = Omit<StudentFormValues, "dateOfBirth"> & { dateOfBirth?: dayjs.Dayjs; provisionAccount?: boolean };

export function StudentFormDrawer({ open, student, majors, cohorts, classes, onClose, onSubmit }: StudentFormDrawerProps) {
  const [form] = Form.useForm<FormShape>();
  const cohort = Form.useWatch("cohort", form);
  const majorCode = Form.useWatch("majorCode", form);
  const code = Form.useWatch("code", form);
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
        initialValues={{ provisionAccount: true }}
        onFinish={({ provisionAccount, ...values }) =>
          startTransition(async () => {
            const fieldErrors = await onSubmit(
              // Ô điện thoại để trống thì antd trả undefined; server cần chuỗi.
              { ...values, phone: values.phone ?? "", personalEmail: values.personalEmail ?? "", code: formatStudentCode(values.code), dateOfBirth: values.dateOfBirth?.format("YYYY-MM-DD") ?? "" },
              { provisionAccount: !isEdit && provisionAccount === true },
            );
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
            <Select options={majorOptions(majors)} showSearch={{ optionFilterProp: "label" }} />
          </Form.Item>
          <Form.Item name="cohort" label="Khóa" rules={[{ required: true, message: "Chưa chọn khóa" }]}>
            <Select options={cohortOptions(cohorts)} />
          </Form.Item>
          <Form.Item
            name="className"
            label="Lớp sinh hoạt"
            extra="Gợi ý theo khóa và ngành đã chọn"
            rules={[{ required: true, message: "Chưa nhập lớp sinh hoạt" }]}
          >
            <AutoComplete options={classSuggestions(classes, cohort, majorCode)} />
          </Form.Item>
          <Form.Item label="Email trường" extra="Tự sinh theo mã sinh viên, tài khoản nhận thư ở đây">
            <Input value={code && isStudentCode(code) ? studentEmailOf(code) : ""} disabled />
          </Form.Item>
          <Form.Item
            name="personalEmail"
            label="Email cá nhân"
            rules={[
              { type: "email", message: EMAIL_MESSAGE },
              { validator: (_, value?: string) => (value && isStudentEmail(value) ? Promise.reject(new Error("Email cá nhân không dùng email trường")) : Promise.resolve()) },
            ]}
          >
            <Input autoComplete="off" inputMode="email" />
          </Form.Item>
          <Form.Item name="phone" label="Điện thoại" rules={[{ pattern: /^0\d{9}$/, message: PHONE_MESSAGE }]}>
            <Input autoComplete="off" inputMode="tel" className="tabular-nums" />
          </Form.Item>
        </div>
        {!isEdit && (
          <Form.Item
            name="provisionAccount"
            valuePropName="checked"
            extra="Tên đăng nhập là mã số sinh viên. Thư gửi tới email trường dạng 5001104013@student.hcmue.edu.vn để sinh viên tự đặt mật khẩu."
          >
            <Checkbox>Cấp tài khoản và gửi thư kích hoạt</Checkbox>
          </Form.Item>
        )}
      </Form>
    </Drawer>
  );
}
