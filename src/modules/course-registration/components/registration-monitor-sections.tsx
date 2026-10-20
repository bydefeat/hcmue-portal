"use client";

import { useState, useTransition } from "react";
import { Button, Card, message, Modal, Segmented, Table, type TableColumnsType } from "antd";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { CLASS_SECTION_STATUS, meetingText } from "@/modules/course-registration/course-registration.constant";
import type { ClassSectionView } from "@/modules/course-registration/course-registration.type";
import { cancelSections, moveCancelledStudents, openExtraSections } from "@/modules/course-registration/course-registration.action";

export const MIN_CLASS_SIZE = 15;
const NEAR_FULL_RATIO = 0.9;

type CancelOutcome = {
  section: ClassSectionView;
  alternatives: ClassSectionView[];
  movedTo: string | null;
};

type Bucket = "full" | "near" | "under";

function bucketOf(section: ClassSectionView): Bucket | null {
  if (section.status !== "open") return null;
  if (section.enrolled >= section.capacity) return "full";
  if (section.enrolled >= section.capacity * NEAR_FULL_RATIO) return "near";
  if (section.enrolled < (section.minEnrollment ?? MIN_CLASS_SIZE)) return "under";
  return null;
}

const NETWORK_ERROR = "Chưa thực hiện được, kiểm tra kết nối rồi thử lại.";

export function RegistrationMonitorSections({ sections }: { sections: ClassSectionView[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(sections);
  const [bucket, setBucket] = useState<Bucket>("full");
  const [selected, setSelected] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<CancelOutcome[]>([]);
  const [isWorking, startWorking] = useTransition();
  const counts = { full: 0, near: 0, under: 0 };
  for (const section of rows) {
    const value = bucketOf(section);
    if (value) counts[value] += 1;
  }
  const visible = rows.filter((section) => bucketOf(section) === bucket);
  const chosen = rows.filter((section) => selected.includes(section.id));

  const openExtra = () =>
    startWorking(async () => {
      const result = await openExtraSections(selected).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      const created = result.data;
      setRows((current) => [...current, ...created]);
      setSelected([]);
      messageApi.success(`Đã tạo ${created.length} lớp nháp (${created.map((section) => section.code).join(", ")}) cùng sĩ số, đối tượng. Xếp lịch, phòng, giảng viên ở mục Lớp học phần rồi mở đăng ký.`);
    });

  const cancel = () =>
    modal.confirm({
      title: `Hủy ${chosen.length} lớp dưới sĩ số tối thiểu?`,
      content: `${chosen.reduce((sum, section) => sum + section.enrolled, 0)} sinh viên đã đăng ký sẽ bị rút khỏi lớp và nhận thông báo để chọn lớp khác. Không hoàn tác được.`,
      okText: "Hủy lớp",
      okButtonProps: { danger: true },
      cancelText: "Giữ lớp",
      mask: { closable: false },
      onOk: async () => {
        const result = await cancelSections(selected).catch(() => null);
        if (!result?.ok) {
          messageApi.error(result?.message ?? NETWORK_ERROR);
          return;
        }
        setRows((current) => current.map((section) => (selected.includes(section.id) ? { ...section, status: "cancelled" } : section)));
        setOutcomes(
          chosen.map((section) => ({
            section,
            movedTo: null,
            alternatives: rows.filter(
              (entry) =>
                entry.courseCode === section.courseCode && entry.id !== section.id && entry.status === "open" && !selected.includes(entry.id) && entry.enrolled < entry.capacity,
            ),
          })),
        );
        messageApi.success(`Đã hủy ${chosen.length} lớp, rút ${result.data.dropped} sinh viên khỏi lớp`);
        setSelected([]);
      },
    });

  const moveAll = (outcome: CancelOutcome, target: ClassSectionView) =>
    startWorking(async () => {
      const result = await moveCancelledStudents(outcome.section.id, target.id).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      const { moved, remaining, skipped } = result.data;
      setRows((current) =>
        current.map((section) =>
          section.id === target.id ? { ...section, enrolled: section.enrolled + moved, isFull: section.enrolled + moved >= section.capacity } : section,
        ),
      );
      setOutcomes((current) => current.map((entry) => (entry.section.id === outcome.section.id ? { ...entry, movedTo: target.code } : entry)));
      if (remaining > 0) {
        modal.info({
          title: `Đã chuyển ${moved} sinh viên sang ${target.code}, còn ${remaining} sinh viên chưa chuyển được`,
          content: (
            <ul className="flex flex-col gap-1 text-sm">
              {skipped.map((entry) => (
                <li key={entry.studentName}>
                  {entry.studentName}: {entry.reason}
                </li>
              ))}
            </ul>
          ),
          okText: "Đã hiểu",
        });
      } else {
        messageApi.success(`Đã chuyển cả ${moved} sinh viên sang ${target.code}`);
      }
    });

  const columns: TableColumnsType<ClassSectionView> = [
    {
      title: "Lớp học phần",
      key: "section",
      width: 220,
      render: (_, section) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-xs">{section.code}</span>
          <span className="truncate">{section.courseName}</span>
          <span className="mt-1 text-xs text-muted tabular-nums md:hidden">
            {section.enrolled}/{section.capacity} sinh viên
          </span>
        </span>
      ),
    },
    { title: "Khoa", dataIndex: "faculty", width: 180, responsive: ["lg"] },
    { title: "Giảng viên", dataIndex: "lecturerName", width: 180, responsive: ["lg"], render: (value: string | null) => value ?? <span className="text-amber-700">Chưa phân công</span> },
    {
      title: "Đã đăng ký",
      key: "fill",
      width: 200,
      responsive: ["md"],
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
    { title: "", key: "status", width: 120, responsive: ["md"], render: (_, section) => (section.status === "open" ? null : <StatusTag status={CLASS_SECTION_STATUS[section.status]} />) },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      {modalContextHolder}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Bucket>
          className="max-w-full"
          value={bucket}
          onChange={(value) => {
            setBucket(value);
            setSelected([]);
          }}
          options={[
            { value: "full", label: `Đủ chỗ (${counts.full})` },
            { value: "near", label: `Sắp đủ (${counts.near})` },
            { value: "under", label: `Thiếu sĩ số (${counts.under})`, title: `Dưới ${MIN_CLASS_SIZE} sinh viên` },
          ]}
        />
        <div className="flex gap-2 sm:ml-auto">
          {bucket !== "under" ? (
            <Button loading={isWorking} disabled={chosen.length === 0} onClick={openExtra}>
              Mở thêm lớp {chosen.length > 0 ? `(${chosen.length})` : ""}
            </Button>
          ) : (
            <Button danger disabled={chosen.length === 0 || isWorking} onClick={cancel}>
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
        scroll={{ x: "max-content" }}
        pagination={false}
        locale={{ emptyText: <EmptyState illustration="done" title="Không có lớp trong nhóm này" /> }}
      />
      <Modal
        open={outcomes.length > 0}
        title="Kết quả hủy lớp"
        onCancel={() => setOutcomes([])}
        footer={<Button onClick={() => setOutcomes([])}>Xong</Button>}
        width={640}
        destroyOnHidden
      >
        <ul className="flex flex-col gap-3">
          {outcomes.map((outcome) => (
            <li key={outcome.section.id}>
              <Card size="small" classNames={{ body: "flex flex-col gap-2" }}>
                <span className="text-sm">
                  {outcome.section.code} đã hủy. Đã gửi thông báo cho{" "}
                  <span className="tabular-nums">{outcome.section.enrolled}</span> sinh viên kèm gợi ý lớp thay thế.
                </span>
                {outcome.movedTo ? (
                  <span className="text-sm text-green-700">Đã chuyển sinh viên sang {outcome.movedTo}</span>
                ) : outcome.alternatives.length === 0 ? (
                  <span className="text-sm text-amber-700">
                    Không còn lớp nào cùng học phần còn chỗ. Sinh viên được nhắc đăng ký học phần khác hoặc gửi đơn xin mở lớp.
                  </span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {outcome.alternatives.map((target) => (
                      <li key={target.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="min-w-0">
                          {target.code} · {target.meetings.map(meetingText).join("; ")} ·{" "}
                          <span className="tabular-nums">còn {target.capacity - target.enrolled} chỗ</span>
                        </span>
                        <Button size="small" loading={isWorking} onClick={() => moveAll(outcome, target)}>
                          Chuyển sinh viên sang lớp này
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
