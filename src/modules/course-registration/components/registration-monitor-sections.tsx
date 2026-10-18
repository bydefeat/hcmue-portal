"use client";

import { useState } from "react";
import { Button, message, Modal, Segmented, Table, type TableColumnsType } from "antd";
import { CircleCheck } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { CLASS_SECTION_STATUS } from "../course-registration.constant";
import type { ClassSectionView } from "../course-registration.type";

export const MIN_CLASS_SIZE = 15;
const NEAR_FULL_RATIO = 0.9;

type Bucket = "full" | "near" | "under";

function bucketOf(section: ClassSectionView): Bucket | null {
  if (section.status !== "open") return null;
  if (section.enrolled >= section.capacity) return "full";
  if (section.enrolled >= section.capacity * NEAR_FULL_RATIO) return "near";
  if (section.enrolled < MIN_CLASS_SIZE) return "under";
  return null;
}

export function RegistrationMonitorSections({ sections }: { sections: ClassSectionView[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(sections);
  const [bucket, setBucket] = useState<Bucket>("full");
  const [selected, setSelected] = useState<string[]>([]);
  const counts = { full: 0, near: 0, under: 0 };
  for (const section of rows) {
    const value = bucketOf(section);
    if (value) counts[value] += 1;
  }
  const visible = rows.filter((section) => bucketOf(section) === bucket);
  const chosen = rows.filter((section) => selected.includes(section.id));

  const openExtra = () => {
    const created = chosen.map((section) => {
      const siblings = rows.filter((entry) => entry.courseCode === section.courseCode).length;
      const code = `${section.courseCode}.${String(siblings + 1).padStart(2, "0")}`;
      return { ...section, id: `${section.id}-moi`, code, enrolled: 0, lecturerId: null, lecturerName: null, status: "draft" as const, conflicts: [], isFull: false };
    });
    setRows((current) => [...current, ...created]);
    setSelected([]);
    messageApi.success(`Đã tạo ${created.length} lớp nháp (${created.map((section) => section.code).join(", ")}). Phân công giảng viên và xếp phòng ở mục Lớp học phần rồi mở đăng ký.`);
  };

  const cancel = () =>
    modal.confirm({
      title: `Hủy ${chosen.length} lớp dưới sĩ số tối thiểu?`,
      content: `${chosen.reduce((sum, section) => sum + section.enrolled, 0)} sinh viên đã đăng ký sẽ bị rút khỏi lớp và nhận thông báo để chọn lớp khác. Không hoàn tác được.`,
      okText: "Hủy lớp",
      okButtonProps: { danger: true },
      cancelText: "Giữ lớp",
      mask: { closable: false },
      onOk: () => {
        setRows((current) => current.map((section) => (selected.includes(section.id) ? { ...section, status: "cancelled" } : section)));
        messageApi.success(`Đã hủy ${chosen.length} lớp và gửi thông báo cho sinh viên`);
        setSelected([]);
      },
    });

  const columns: TableColumnsType<ClassSectionView> = [
    {
      title: "Lớp học phần",
      key: "section",
      width: 260,
      render: (_, section) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-xs">{section.code}</span>
          <span className="truncate">{section.courseName}</span>
        </span>
      ),
    },
    { title: "Khoa", dataIndex: "faculty", width: 200 },
    { title: "Giảng viên", dataIndex: "lecturerName", width: 200, render: (value: string | null) => value ?? <span className="text-amber-700">Chưa phân công</span> },
    {
      title: "Đã đăng ký",
      key: "fill",
      width: 200,
      sorter: (a, b) => a.enrolled / a.capacity - b.enrolled / b.capacity,
      render: (_, section) => (
        <span className="flex items-center gap-2">
          <MeterBar value={section.enrolled} max={section.capacity} tone={section.enrolled >= section.capacity ? "warning" : section.enrolled < MIN_CLASS_SIZE ? "danger" : "primary"} label={`Đã đăng ký ${section.code}`} />
          <span className="shrink-0 text-xs tabular-nums">
            {section.enrolled}/{section.capacity}
          </span>
        </span>
      ),
    },
    { title: "", key: "status", width: 120, render: (_, section) => (section.status === "open" ? null : <StatusTag status={CLASS_SECTION_STATUS[section.status]} />) },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      {modalContextHolder}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Bucket>
          value={bucket}
          onChange={(value) => {
            setBucket(value);
            setSelected([]);
          }}
          options={[
            { value: "full", label: `Đã đủ chỗ (${counts.full})` },
            { value: "near", label: `Sắp đủ (${counts.near})` },
            { value: "under", label: `Dưới ${MIN_CLASS_SIZE} sinh viên (${counts.under})` },
          ]}
        />
        <div className="flex gap-2 sm:ml-auto">
          {bucket !== "under" ? (
            <Button disabled={chosen.length === 0} onClick={openExtra}>
              Mở thêm lớp {chosen.length > 0 ? `(${chosen.length})` : ""}
            </Button>
          ) : (
            <Button danger disabled={chosen.length === 0} onClick={cancel}>
              Hủy lớp {chosen.length > 0 ? `(${chosen.length})` : ""}
            </Button>
          )}
        </div>
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={visible}
        rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
        scroll={{ x: 1000 }}
        pagination={false}
        locale={{ emptyText: <EmptyState icon={CircleCheck} title="Không có lớp trong nhóm này" /> }}
      />
    </div>
  );
}
