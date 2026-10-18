"use client";

import { useEffect } from "react";
import { Button, Drawer, Form, InputNumber, Select } from "antd";
import { Plus, Trash } from "defeat-icons-react";
import { PERIODS, WEEKDAYS } from "@/shared/constants/period.constant";
import { CLASS_SECTION_STATUS_OPTIONS, ROOMS } from "../course-registration.constant";
import type { ClassSectionFormValues, ClassSectionView } from "../course-registration.type";

export type SectionCourseOption = { code: string; name: string; credits: number; faculty: string };
export type SectionLecturerOption = { id: string; displayName: string; faculty: string };

type ClassSectionFormDrawerProps = {
  open: boolean;
  section: ClassSectionView | null;
  termName: string;
  courses: SectionCourseOption[];
  lecturers: SectionLecturerOption[];
  onClose: () => void;
  onSubmit: (values: ClassSectionFormValues) => void;
};

const DAY_OPTIONS = WEEKDAYS.map((day) => ({ value: day.value, label: day.label }));
const PERIOD_OPTIONS = PERIODS.map((item) => ({ value: item.period, label: `Tiết ${item.period} (${item.start})` }));
const ROOM_OPTIONS = ROOMS.map((room) => ({ value: room, label: room }));

const EMPTY_VALUES: Partial<ClassSectionFormValues> = {
  sectionNumber: 1,
  capacity: 45,
  status: "draft",
  meetings: [{ dayOfWeek: 2, startPeriod: 1, endPeriod: 3, room: ROOMS[0] }],
};

function toValues(section: ClassSectionView): ClassSectionFormValues {
  return {
    courseCode: section.courseCode,
    sectionNumber: Number(section.code.split(".").at(-1)),
    lecturerId: section.lecturerId ?? undefined,
    capacity: section.capacity,
    status: section.status,
    meetings: section.meetings,
  };
}

export function ClassSectionFormDrawer({ open, section, termName, courses, lecturers, onClose, onSubmit }: ClassSectionFormDrawerProps) {
  const [form] = Form.useForm<ClassSectionFormValues>();
  const courseCode = Form.useWatch("courseCode", form);
  const faculty = courses.find((course) => course.code === courseCode)?.faculty;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(section ? toValues(section) : EMPTY_VALUES);
  }, [open, section, form]);

  const lecturerOptions = [...lecturers]
    .sort((a, b) => Number(b.faculty === faculty) - Number(a.faculty === faculty))
    .map((lecturer) => ({ value: lecturer.id, label: `${lecturer.displayName} (${lecturer.faculty})` }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={600}
      destroyOnHidden
      mask={{ closable: false }}
      title={section ? `Sửa lớp ${section.code}` : `Mở lớp học phần, ${termName}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" onClick={() => form.submit()}>
            {section ? "Lưu thay đổi" : "Mở lớp"}
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <div className="grid gap-x-3 sm:grid-cols-[1fr_120px]">
          <Form.Item name="courseCode" label="Học phần" rules={[{ required: true, message: "Chưa chọn học phần" }]}>
            <Select
              disabled={Boolean(section)}
              showSearch={{ optionFilterProp: "label" }}
              options={courses.map((course) => ({ value: course.code, label: `${course.code} ${course.name} (${course.credits} TC)` }))}
            />
          </Form.Item>
          <Form.Item name="sectionNumber" label="Số thứ tự lớp" rules={[{ required: true, message: "Chưa nhập" }]}>
            <InputNumber min={1} max={99} className="w-full" disabled={Boolean(section)} />
          </Form.Item>
        </div>
        <Form.Item name="lecturerId" label="Giảng viên" extra="Để trống nếu khoa chưa phân công, lớp sẽ hiện là chưa có giảng viên.">
          <Select allowClear showSearch={{ optionFilterProp: "label" }} options={lecturerOptions} />
        </Form.Item>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item name="capacity" label="Sĩ số tối đa" rules={[{ required: true, message: "Chưa nhập sĩ số" }]}>
            <InputNumber min={section?.enrolled || 10} max={200} className="w-full" />
          </Form.Item>
          <Form.Item name="status" label="Trạng thái" rules={[{ required: true, message: "Chưa chọn trạng thái" }]}>
            <Select options={CLASS_SECTION_STATUS_OPTIONS} />
          </Form.Item>
        </div>
        <p className="mb-2 text-sm font-medium">Buổi học trong tuần</p>
        <Form.List
          name="meetings"
          rules={[
            {
              validator: (_, value: unknown[]) =>
                value && value.length > 0 ? Promise.resolve() : Promise.reject(new Error("Lớp cần ít nhất một buổi học")),
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <div className="flex flex-col gap-3">
              {fields.map((field) => (
                <div key={field.key} className="grid grid-cols-2 gap-x-3 rounded-lg border border-border-strong p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <Form.Item name={[field.name, "dayOfWeek"]} label="Thứ" rules={[{ required: true, message: "Chưa chọn" }]}>
                    <Select options={DAY_OPTIONS} />
                  </Form.Item>
                  <Form.Item name={[field.name, "room"]} label="Phòng" rules={[{ required: true, message: "Chưa chọn" }]}>
                    <Select options={ROOM_OPTIONS} />
                  </Form.Item>
                  <Form.Item name={[field.name, "startPeriod"]} label="Từ tiết" rules={[{ required: true, message: "Chưa chọn" }]}>
                    <Select options={PERIOD_OPTIONS} />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, "endPeriod"]}
                    label="Đến tiết"
                    dependencies={[["meetings", field.name, "startPeriod"]]}
                    rules={[
                      { required: true, message: "Chưa chọn" },
                      ({ getFieldValue }) => ({
                        validator: (_, value: number) =>
                          value >= getFieldValue(["meetings", field.name, "startPeriod"])
                            ? Promise.resolve()
                            : Promise.reject(new Error("Tiết kết thúc phải sau tiết bắt đầu")),
                      }),
                    ]}
                  >
                    <Select options={PERIOD_OPTIONS} />
                  </Form.Item>
                  <div className="col-span-2 flex justify-end sm:col-span-1 sm:items-start sm:pt-7">
                    <Button type="text" danger icon={<Trash size={16} aria-hidden />} aria-label="Xóa buổi học" onClick={() => remove(field.name)} />
                  </div>
                </div>
              ))}
              <Form.ErrorList errors={errors} />
              <Button icon={<Plus size={16} aria-hidden />} onClick={() => add({ dayOfWeek: 2, startPeriod: 1, endPeriod: 3, room: ROOMS[0] })} className="self-start">
                Thêm buổi học
              </Button>
            </div>
          )}
        </Form.List>
      </Form>
    </Drawer>
  );
}
