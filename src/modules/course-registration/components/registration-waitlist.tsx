"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@bprogress/next/app";
import { Button, Input, message, Modal, Table, type TableColumnsType } from "antd";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { formatDateTime } from "@/shared/libs/date.lib";
import { processWaitlist, removeWaitlistEntry } from "@/modules/course-registration/course-registration.action";
import type { ClassSectionView } from "@/modules/course-registration/course-registration.type";

export type WaitlistEntryRow = {
  id: string;
  sectionId: string;
  position: number;
  studentCode: string;
  studentName: string;
  className: string;
  createdAt: string;
};

type SectionWaitlist = { section: ClassSectionView; entries: WaitlistEntryRow[] };

const NETWORK_ERROR = "Chưa thực hiện được, kiểm tra kết nối rồi thử lại.";

// Danh sách chờ theo lớp: hệ thống tự xếp người đầu danh sách đủ điều kiện khi lớp có chỗ (hủy, đổi lớp, tăng sĩ số); ở đây Phòng Đào
// tạo xem thứ tự, chạy lại việc xếp (ví dụ vừa gỡ khóa cho người đầu danh sách) hoặc đưa một sinh viên ra khỏi danh sách kèm lý do.
export function RegistrationWaitlist({ sections, entries }: { sections: ClassSectionView[]; entries: WaitlistEntryRow[] }) {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(entries);
  const [removing, setRemoving] = useState<WaitlistEntryRow | null>(null);
  const [reason, setReason] = useState("");
  const [isWorking, startWorking] = useTransition();
  const groups: SectionWaitlist[] = sections
    .map((section) => ({ section, entries: rows.filter((entry) => entry.sectionId === section.id) }))
    .filter((group) => group.entries.length > 0);

  const process = (section: ClassSectionView) =>
    startWorking(async () => {
      const result = await processWaitlist(section.id).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      messageApi.success(
        result.data.promoted > 0
          ? `Đã xếp ${result.data.promoted} sinh viên vào ${section.code}`
          : `Chưa xếp được ai vào ${section.code}: lớp hết chỗ hoặc người chờ chưa đủ điều kiện (trùng lịch, hạn mức, bị khóa).`,
      );
      router.refresh();
    });

  const remove = () =>
    startWorking(async () => {
      if (!removing) return;
      const result = await removeWaitlistEntry(removing.id, reason).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      setRows((current) => current.filter((entry) => entry.id !== removing.id));
      messageApi.success(`Đã đưa ${removing.studentName} khỏi danh sách chờ`);
      setRemoving(null);
      setReason("");
    });

  const columns: TableColumnsType<WaitlistEntryRow> = [
    { title: "Thứ tự", dataIndex: "position", width: 70, align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
    {
      title: "Sinh viên",
      key: "student",
      width: 240,
      render: (_, row) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.studentName}</span>
          <span className="text-xs text-muted tabular-nums">
            {row.studentCode} · {row.className}
          </span>
        </span>
      ),
    },
    { title: "Vào chờ lúc", dataIndex: "createdAt", width: 150, responsive: ["md"], render: (value: string) => <span className="text-xs tabular-nums">{formatDateTime(value)}</span> },
    {
      title: "",
      key: "actions",
      width: 120,
      align: "right",
      render: (_, row) => (
        <Button size="small" type="text" danger onClick={() => setRemoving(row)}>
          Đưa khỏi danh sách
        </Button>
      ),
    },
  ];

  if (groups.length === 0) {
    return <EmptyState illustration="done" title="Không có sinh viên nào đang chờ" description="Sinh viên vào danh sách chờ khi lớp đã đủ chỗ cho đối tượng của mình." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {contextHolder}
      {groups.map(({ section, entries: waiting }) => (
        <section key={section.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">
                {section.code} {section.courseName}
              </span>
              <span className="text-xs text-muted tabular-nums">
                {section.enrolled}/{section.capacity} chỗ · {waiting.length} người chờ
              </span>
            </span>
            <Button size="small" loading={isWorking} disabled={section.enrolled >= section.capacity} onClick={() => process(section)}>
              Xếp từ danh sách chờ
            </Button>
          </div>
          <Table rowKey="id" size="small" columns={columns} dataSource={waiting} pagination={false} scroll={{ x: "max-content" }} />
        </section>
      ))}
      <Modal
        open={removing !== null}
        title={removing ? `Đưa ${removing.studentName} khỏi danh sách chờ?` : ""}
        okText="Đưa khỏi danh sách"
        okButtonProps={{ danger: true, loading: isWorking, disabled: reason.trim().length < 5 }}
        cancelText="Giữ lại"
        onOk={remove}
        onCancel={() => {
          setRemoving(null);
          setReason("");
        }}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <p className="mb-3 text-sm text-pretty text-muted">Sinh viên nhận thông báo kèm lý do trên cổng.</p>
        <Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} autoSize={{ minRows: 2 }} maxLength={300} aria-label="Lý do" placeholder="Lý do" />
      </Modal>
    </div>
  );
}
