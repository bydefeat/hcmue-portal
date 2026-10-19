"use client";

import { useState } from "react";
import { Alert, Button, Drawer, Input, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { ClipboardCheck, Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime } from "@/shared/libs/date.lib";
import { formatPoint, GRADE_SHEET_STATE, LETTER_SCALE } from "../grades.constant";
import type { GradeSheetState } from "../grades.type";

export type PublishingRow = {
  classSectionId: string;
  code: string;
  courseName: string;
  faculty: string;
  lecturerName: string | null;
  state: GradeSheetState;
  deadline: string;
  filledCells: number;
  totalCells: number;
  studentCount: number;
  letterCounts: Record<string, number>;
  average: number | null;
  passRate: number | null;
  returnReason: string | null;
};

type GradePublishingTableProps = {
  rows: PublishingRow[];
  canApprove: boolean;
  canPublish: boolean;
};

const STATE_ORDER: GradeSheetState[] = ["locked", "approved", "returned", "overdue", "due-soon", "in-progress", "published"];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function GradePublishingTable({ rows: initialRows, canApprove, canPublish }: GradePublishingTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<GradeSheetState | undefined>(canApprove && !canPublish ? "locked" : undefined);
  const [faculty, setFaculty] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [returning, setReturning] = useState<PublishingRow | null>(null);
  const [reason, setReason] = useState("");
  const faculties = [...new Set(rows.map((row) => row.faculty))];
  const preview = rows.find((row) => row.classSectionId === previewId) ?? null;
  const visible = rows
    .filter(
      (row) =>
        (!state || row.state === state) &&
        (!faculty || row.faculty === faculty) &&
        (!query.trim() || normalize(`${row.code} ${row.courseName} ${row.lecturerName ?? ""}`).includes(normalize(query.trim()))),
    )
    .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
  const chosen = rows.filter((row) => selected.includes(row.classSectionId));
  const approvable = chosen.filter((row) => row.state === "locked");
  const publishable = chosen.filter((row) => row.state === "approved");

  const setStateOf = (ids: string[], next: GradeSheetState, returnReason: string | null = null) =>
    setRows((current) => current.map((row) => (ids.includes(row.classSectionId) ? { ...row, state: next, returnReason } : row)));

  const approve = (targets: PublishingRow[]) => {
    setStateOf(targets.map((row) => row.classSectionId), "approved");
    setSelected([]);
    messageApi.success(`Khoa đã duyệt ${targets.length} bảng điểm, chuyển Phòng Đào tạo công bố`);
  };

  const publish = (targets: PublishingRow[]) =>
    modal.confirm({
      title: `Công bố điểm ${targets.length} lớp học phần?`,
      content: `${targets.reduce((sum, row) => sum + row.studentCount, 0)} sinh viên sẽ thấy điểm và nhận thông báo. Sau khi công bố, sửa điểm phải qua đơn Sửa điểm sau khi chốt.`,
      okText: "Công bố",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: () => {
        setStateOf(targets.map((row) => row.classSectionId), "published");
        setSelected([]);
        messageApi.success(`Đã công bố điểm ${targets.length} lớp`);
      },
    });

  const confirmReturn = () => {
    if (!returning) return;
    if (!reason.trim()) {
      messageApi.warning("Ghi lý do trả lại để giảng viên biết cần sửa gì");
      return;
    }
    setStateOf([returning.classSectionId], "returned", reason.trim());
    messageApi.success(`Đã trả bảng điểm ${returning.code} về giảng viên`);
    setReturning(null);
    setReason("");
  };

  const columns: TableColumnsType<PublishingRow> = [
    {
      title: "Lớp học phần",
      key: "section",
      width: 200,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <Button type="link" size="small" onClick={() => setPreviewId(row.classSectionId)} className="h-auto max-w-full flex-col items-start gap-0 p-0 text-left">
            <span className="text-xs">{row.code}</span>
            <span className="max-w-full truncate text-foreground">{row.courseName}</span>
          </Button>
          <span className="md:hidden">
            <StatusTag status={GRADE_SHEET_STATE[row.state]} />
          </span>
        </span>
      ),
    },
    { title: "Giảng viên", dataIndex: "lecturerName", width: 170, responsive: ["lg"], render: (value: string | null) => value ?? <span className="text-muted">Chưa phân công</span> },
    {
      title: "Đã nhập",
      key: "filled",
      width: 140,
      responsive: ["md"],
      render: (_, row) => (
        <span className="flex items-center gap-2">
          <MeterBar value={row.filledCells} max={row.totalCells} label={`Đã nhập ${row.code}`} />
          <span className="shrink-0 text-xs tabular-nums">{row.totalCells > 0 ? Math.round((row.filledCells / row.totalCells) * 100) : 0}%</span>
        </span>
      ),
    },
    { title: "ĐTB", dataIndex: "average", width: 70, align: "right", responsive: ["lg"], render: (value: number | null) => <span className="tabular-nums">{formatPoint(value, 1)}</span> },
    { title: <span className="whitespace-nowrap">Tỉ lệ đạt</span>, dataIndex: "passRate", width: 100, align: "right", responsive: ["lg"], render: (value: number | null) => <span className="tabular-nums">{value === null ? "" : `${value}%`}</span> },
    {
      title: "Trạng thái",
      key: "state",
      width: 180,
      responsive: ["md"],
      render: (_, row) => (
        <span className="flex flex-col items-start gap-1">
          <StatusTag status={GRADE_SHEET_STATE[row.state]} />
          {row.state === "returned" && row.returnReason && <span className="text-xs text-pretty text-muted">{row.returnReason}</span>}
          {(row.state === "overdue" || row.state === "due-soon") && <span className="text-xs text-muted tabular-nums">Hạn {formatDateTime(row.deadline)}</span>}
        </span>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 120,
      align: "right",
      fixed: "right",
      render: (_, row) => (
        <div className="flex flex-wrap justify-end gap-1">
          {row.state === "locked" && canApprove && (
            <>
              <Button size="small" type="text" onClick={() => setReturning(row)}>
                Trả lại
              </Button>
              <Button size="small" type="text" onClick={() => approve([row])}>
                Duyệt
              </Button>
            </>
          )}
          {row.state === "approved" && canPublish && (
            <Button size="small" type="text" onClick={() => publish([row])}>
              Công bố
            </Button>
          )}
        </div>
      ),
    },
  ];

  const maxCount = preview ? Math.max(1, ...Object.values(preview.letterCounts)) : 1;

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      {modalContextHolder}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Mã lớp, học phần, giảng viên" aria-label="Tìm lớp" className="col-span-2 w-full sm:w-64" />
        <Select allowClear value={state} onChange={setState} placeholder="Mọi trạng thái" aria-label="Trạng thái" options={STATE_ORDER.map((value) => ({ value, label: GRADE_SHEET_STATE[value].label }))} className="min-w-0 sm:w-52" />
        <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={faculties.map((value) => ({ value, label: value }))} className="min-w-0 sm:w-56" />
        <div className="col-span-2 flex gap-2 sm:ml-auto">
          {canApprove && (
            <Button disabled={approvable.length === 0} onClick={() => approve(approvable)}>
              Duyệt {approvable.length > 0 ? `(${approvable.length})` : ""}
            </Button>
          )}
          {canPublish && (
            <Button type="primary" disabled={publishable.length === 0} onClick={() => publish(publishable)}>
              Công bố {publishable.length > 0 ? `(${publishable.length})` : ""}
            </Button>
          )}
        </div>
      </div>
      <Table
        rowKey="classSectionId"
        size="small"
        columns={columns}
        dataSource={visible}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
          getCheckboxProps: (row) => ({ disabled: !((row.state === "locked" && canApprove) || (row.state === "approved" && canPublish)) }),
        }}
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        locale={{ emptyText: <EmptyState icon={ClipboardCheck} title="Không có bảng điểm ở trạng thái này" /> }}
      />

      <Drawer open={preview !== null} onClose={() => setPreviewId(null)} size={480} destroyOnHidden title={preview ? `Bảng điểm ${preview.code}` : ""}>
        {preview && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="font-medium">{preview.courseName}</span>
              <span className="text-sm text-muted">{preview.lecturerName ?? "Chưa phân công giảng viên"}</span>
              <StatusTag status={GRADE_SHEET_STATE[preview.state]} className="mt-1 w-fit" />
            </div>
            {preview.average === null ? (
              <Alert type="info" showIcon title="Chưa đủ điểm để tính phân bố" description="Phân bố điểm chữ hiện khi giảng viên nhập đủ các cột điểm của ít nhất một sinh viên." />
            ) : (
              <>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted">Sinh viên</dt>
                    <dd className="text-lg font-semibold tabular-nums">{preview.studentCount}</dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted">Điểm trung bình</dt>
                    <dd className="text-lg font-semibold tabular-nums">{formatPoint(preview.average, 1)}</dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted">Tỉ lệ đạt</dt>
                    <dd className="text-lg font-semibold tabular-nums">{preview.passRate}%</dd>
                  </div>
                </dl>
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">Phân bố điểm chữ</h3>
                  <ul className="flex flex-col gap-1.5">
                    {LETTER_SCALE.map((step) => {
                      const count = preview.letterCounts[step.letter] ?? 0;
                      return (
                        <li key={step.letter} className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2 text-sm">
                          <span className="font-medium">{step.letter}</span>
                          <MeterBar value={count} max={maxCount} tone={step.letter === "F" ? "danger" : "primary"} label={`Số sinh viên đạt ${step.letter}`} />
                          <span className="text-right tabular-nums">{count}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={returning !== null}
        onCancel={() => setReturning(null)}
        title={returning ? `Trả lại bảng điểm ${returning.code}` : ""}
        okText="Trả lại"
        okButtonProps={{ danger: true }}
        cancelText="Hủy"
        onOk={confirmReturn}
        mask={{ closable: false }}
        destroyOnHidden
        width={480}
      >
        <p className="mb-3 text-sm text-pretty text-muted">Bảng điểm mở khóa để giảng viên sửa, giảng viên nhận thông báo kèm lý do.</p>
        <Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} maxLength={300} showCount placeholder="Ví dụ: cột giữa kỳ của 3 sinh viên vượt 10 điểm" aria-label="Lý do trả lại" className="mb-6" />
      </Modal>
    </div>
  );
}
