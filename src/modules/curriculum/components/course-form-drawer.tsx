"use client";

import { useEffect, useTransition } from "react";
import { Button, Drawer, Form, Input, InputNumber, Select, Switch } from "antd";
import { COURSE_TYPE_OPTIONS, KNOWLEDGE_BLOCK_OPTIONS } from "@/modules/curriculum/curriculum.constant";
import type { Course, CourseFormValues } from "@/modules/curriculum/curriculum.type";
import { toFormFields } from "@/shared/libs/form.lib";

type CourseFormDrawerProps = {
  open: boolean;
  course: Course | null;
  courses: Course[];
  faculties: string[];
  onClose: () => void;
  // Trả lỗi theo ô khi server từ chối, để drawer gắn vào đúng ô.
  onSubmit: (values: CourseFormValues) => Promise<Record<string, string> | undefined>;
};

const EMPTY_VALUES: Partial<CourseFormValues> = {
  credits: 3,
  theoryCredits: 3,
  practiceCredits: 0,
  type: "required",
  block: "major",
  prerequisiteCodes: [],
  corequisiteCodes: [],
  equivalentCodes: [],
  isActive: true,
  isConditional: false,
};

export function CourseFormDrawer({ open, course, courses, faculties, onClose, onSubmit }: CourseFormDrawerProps) {
  const [form] = Form.useForm<CourseFormValues>();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(course ?? EMPTY_VALUES);
  }, [open, course, form]);

  const prerequisiteOptions = courses
    .filter((entry) => entry.code !== course?.code)
    .map((entry) => ({ value: entry.code, label: `${entry.code} ${entry.name}` }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={560}
      destroyOnHidden
      mask={{ closable: false }}
      title={course ? `Sửa học phần ${course.code}` : "Thêm học phần"}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={isPending} onClick={() => form.submit()}>
            {course ? "Lưu thay đổi" : "Thêm học phần"}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) =>
          startTransition(async () => {
            const fieldErrors = await onSubmit(values);
            if (fieldErrors) form.setFields(toFormFields(fieldErrors));
          })
        }
      >
        <div className="grid gap-x-3 sm:grid-cols-[160px_1fr]">
          <Form.Item
            name="code"
            label="Mã học phần"
            normalize={(value: string) => value.toUpperCase()}
            rules={[
              { required: true, message: "Chưa nhập mã học phần" },
              { pattern: /^[A-Z]{4}\d{4}$/, message: "Mã gồm 4 chữ cái và 4 chữ số, ví dụ COMP1020" },
              {
                validator: (_, value: string) =>
                  !course && courses.some((entry) => entry.code === value)
                    ? Promise.reject(new Error(`Mã ${value} đã có trong danh mục`))
                    : Promise.resolve(),
              },
            ]}
          >
            <Input disabled={Boolean(course)} />
          </Form.Item>
          <Form.Item name="name" label="Tên học phần" rules={[{ required: true, whitespace: true, message: "Chưa nhập tên học phần" }]}>
            <Input />
          </Form.Item>
        </div>
        <div className="grid grid-cols-3 gap-x-3">
          <Form.Item name="credits" label="Số tín chỉ" rules={[{ required: true, message: "Chưa nhập" }]}>
            <InputNumber min={1} max={10} className="w-full" />
          </Form.Item>
          <Form.Item name="theoryCredits" label="Lý thuyết" rules={[{ required: true, message: "Chưa nhập" }]}>
            <InputNumber min={0} max={10} className="w-full" />
          </Form.Item>
          <Form.Item
            name="practiceCredits"
            label="Thực hành"
            dependencies={["credits", "theoryCredits"]}
            rules={[
              { required: true, message: "Chưa nhập" },
              ({ getFieldValue }) => ({
                validator: (_, value: number) =>
                  (getFieldValue("theoryCredits") ?? 0) + (value ?? 0) === getFieldValue("credits")
                    ? Promise.resolve()
                    : Promise.reject(new Error("Lý thuyết cộng thực hành phải bằng số tín chỉ")),
              }),
            ]}
          >
            <InputNumber min={0} max={10} className="w-full" />
          </Form.Item>
        </div>
        <Form.Item name="faculty" label="Khoa phụ trách" rules={[{ required: true, message: "Chưa chọn khoa" }]}>
          <Select options={faculties.map((value) => ({ value, label: value }))} />
        </Form.Item>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item name="type" label="Loại" rules={[{ required: true, message: "Chưa chọn loại" }]}>
            <Select options={COURSE_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="block" label="Khối kiến thức" rules={[{ required: true, message: "Chưa chọn khối" }]}>
            <Select options={KNOWLEDGE_BLOCK_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item name="prerequisiteCodes" label="Học phần tiên quyết" extra="Sinh viên phải đạt các học phần này trước khi đăng ký.">
          <Select mode="multiple" options={prerequisiteOptions} showSearch={{ optionFilterProp: "label" }} />
        </Form.Item>
        <Form.Item name="corequisiteCodes" label="Học phần song hành" extra="Phải đạt trước hoặc học cùng học kỳ, ví dụ phần thực hành đi kèm lý thuyết.">
          <Select mode="multiple" options={prerequisiteOptions} showSearch={{ optionFilterProp: "label" }} />
        </Form.Item>
        <Form.Item name="equivalentCodes" label="Học phần tương đương" extra="Đạt một học phần tương đương được tính như đã đạt học phần này, kể cả khi xét tiên quyết.">
          <Select mode="multiple" options={prerequisiteOptions} showSearch={{ optionFilterProp: "label" }} />
        </Form.Item>
        <Form.Item name="description" label="Mô tả tóm tắt">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} />
        </Form.Item>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item name="isActive" label="Đang mở giảng dạy" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="isConditional"
            label="Học phần điều kiện"
            valuePropName="checked"
            extra="Giáo dục thể chất, Giáo dục quốc phòng và an ninh: chấm Đạt/Không đạt, không tính điểm trung bình và tín chỉ tích lũy."
          >
            <Switch />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
