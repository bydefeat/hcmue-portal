"use client";

import { useState, useTransition } from "react";
import { Button, Dropdown, Form, Input, InputNumber, message, Modal, Select, type MenuProps } from "antd";
import { DotsVertical, Plus } from "defeat-icons-react";
import { toFormFields } from "@/shared/libs/form.lib";
import { SectionCard } from "@/shared/components/ui/section-card";
import { deleteProgramElectiveGroup, saveProgramElectiveGroup } from "@/modules/curriculum/curriculum.action";
import type { ElectiveGroupFormValues, ProgramDetail, ProgramElectiveGroup } from "@/modules/curriculum/curriculum.type";

type ElectiveGroupsCardProps = {
  program: ProgramDetail;
  editable: boolean;
  onChange: (program: ProgramDetail) => void;
};

// Nhóm tự chọn của khung: tên, số tín chỉ tối thiểu sinh viên phải tích lũy, các học phần tự chọn trong khung thuộc nhóm.
export function ElectiveGroupsCard({ program, editable, onChange }: ElectiveGroupsCardProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [form] = Form.useForm<ElectiveGroupFormValues>();
  const [editing, setEditing] = useState<ProgramElectiveGroup | "new" | null>(null);
  const [isPending, startTransition] = useTransition();

  const courses = program.semesters.flatMap((semester) => semester.courses);
  const courseOf = new Map(courses.map((course) => [course.code, course]));
  const groupOf = new Map(program.electiveGroups.flatMap((group) => group.courseCodes.map((code) => [code, group] as const)));
  const currentId = editing && editing !== "new" ? editing.id : null;
  const options = courses
    .filter((course) => course.type === "elective" && !course.isConditional)
    .toSorted((a, b) => a.code.localeCompare(b.code))
    .map((course) => {
      const other = groupOf.get(course.code);
      const taken = other !== undefined && other.id !== currentId;
      return { value: course.code, disabled: taken, label: `${course.code} · ${course.name} (${course.credits} TC)${taken ? `, thuộc nhóm ${other.name}` : ""}` };
    });

  const open = (group: ProgramElectiveGroup | "new") => {
    setEditing(group);
    form.resetFields();
    form.setFieldsValue(group === "new" ? { courseCodes: [] } : { name: group.name, minCredits: group.minCredits, courseCodes: group.courseCodes });
  };

  const submit = (values: ElectiveGroupFormValues) =>
    startTransition(async () => {
      const result = await saveProgramElectiveGroup(program.id, currentId, values);
      if (!result.ok) {
        if (result.fieldErrors) form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      onChange(result.data);
      setEditing(null);
      messageApi.success("Đã lưu nhóm tự chọn.");
    });

  const confirmDelete = (group: ProgramElectiveGroup) =>
    modal.confirm({
      title: `Xóa nhóm "${group.name}"?`,
      content: "Học phần của nhóm vẫn ở trong khung, chỉ bỏ yêu cầu tín chỉ tối thiểu của nhóm khi xét tốt nghiệp.",
      okText: "Xóa nhóm",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: async () => {
        const result = await deleteProgramElectiveGroup(program.id, group.id);
        if (!result.ok) {
          messageApi.error(result.message);
          return;
        }
        onChange(result.data);
        messageApi.success("Đã xóa nhóm tự chọn.");
      },
    });

  const menu = (group: ProgramElectiveGroup): MenuProps["items"] => [
    { key: "edit", label: "Sửa nhóm", onClick: () => open(group) },
    { type: "divider" },
    { key: "delete", label: "Xóa nhóm", danger: true, onClick: () => confirmDelete(group) },
  ];

  if (!editable && program.electiveGroups.length === 0) return null;

  return (
    <SectionCard
      flush
      title="Nhóm học phần tự chọn"
      extra={
        editable && (
          <Button size="small" icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => open("new")}>
            Thêm nhóm
          </Button>
        )
      }
    >
      {contextHolder}
      {modalContextHolder}
      {program.electiveGroups.length === 0 ? (
        <p className="px-4 py-3 text-sm text-pretty text-muted sm:px-5">Chưa có nhóm tự chọn. Xét tốt nghiệp chỉ kiểm tổng tín chỉ và học phần bắt buộc.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-strong">
          {program.electiveGroups.map((group) => (
            <li key={group.id} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium text-pretty">{group.name}</span>
                <span className="text-xs text-pretty text-muted">
                  {group.courseCodes.map((code) => `${code} ${courseOf.get(code)?.name ?? ""}`.trim()).join(", ") || "Chưa có học phần"}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                Tối thiểu {group.minCredits}/{group.availableCredits} TC
              </span>
              {editable && (
                <Dropdown menu={{ items: menu(group) }} trigger={["click"]}>
                  <Button type="text" size="small" aria-label={`Thao tác với nhóm ${group.name}`} icon={<DotsVertical size={16} aria-hidden className="text-zinc-500" />} />
                </Dropdown>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        title={editing === "new" ? "Thêm nhóm tự chọn" : editing ? `Sửa nhóm ${editing.name}` : undefined}
        okText={editing === "new" ? "Thêm nhóm" : "Lưu nhóm"}
        cancelText="Hủy"
        okButtonProps={{ loading: isPending }}
        mask={{ closable: false }}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <div className="grid gap-x-3 sm:grid-cols-[1fr_140px]">
            <Form.Item name="name" label="Tên nhóm" rules={[{ required: true, whitespace: true, message: "Chưa nhập tên nhóm" }]}>
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="minCredits" label="Tín chỉ tối thiểu" rules={[{ required: true, message: "Chưa nhập" }]}>
              <InputNumber min={1} max={60} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item
            name="courseCodes"
            label="Học phần của nhóm"
            rules={[{ required: true, message: "Chọn ít nhất một học phần" }]}
            extra="Chỉ học phần tự chọn đã có trong khung; mỗi học phần thuộc tối đa một nhóm."
          >
            <Select mode="multiple" showSearch={{ optionFilterProp: "label" }} options={options} />
          </Form.Item>
        </Form>
      </Modal>
    </SectionCard>
  );
}
