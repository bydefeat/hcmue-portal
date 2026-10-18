"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, InputNumber, message, Modal, Table, type TableColumnsType } from "antd";
import { Download, FilePen, LockKey, Upload } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, daysUntil, formatDateTime } from "@/shared/libs/date.lib";
import { formatPoint, GRADE_SHEET_STATE, toLetter, weightedScore } from "../grades.constant";
import {
  NewLecturerRequestDrawer,
  type BusySlot,
  type RequestClassOption,
} from "@/modules/requests/components/new-lecturer-request-drawer";
import type { GradeSheet, GradeSheetState, ScoreRow } from "../grades.type";

export type GradingStudent = {
  studentId: string;
  studentCode: string;
  fullName: string;
};

export type GradeChangeRequestOptions = {
  classes: RequestClassOption[];
  busySlots: BusySlot[];
  rooms: string[];
  requester: { id: string; name: string; code: string; unit: string };
};

type GradingTableProps = {
  sheet: GradeSheet & { state: GradeSheetState };
  students: GradingStudent[];
  classCode: string;
  classId: string;
  returnReason?: string | null;
  requestOptions?: GradeChangeRequestOptions;
};

const EDITABLE_STATUSES: GradeSheet["status"][] = ["draft", "returned"];

const AUTOSAVE_DELAY = 1200;

function deadlineText(deadline: string) {
  const days = daysUntil(deadline);
  if (dayjs().isAfter(deadline)) return `quá hạn ${Math.max(1, -days)} ngày`;
  if (days === 0) return "hết hạn hôm nay";
  return `còn ${days} ngày`;
}

export function GradingTable({ sheet, students, classCode, classId, returnReason, requestOptions }: GradingTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [scores, setScores] = useState<Record<string, ScoreRow>>(sheet.scores);
  const [isLocked, setIsLocked] = useState(!EDITABLE_STATUSES.includes(sheet.status));
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [lockedAt, setLockedAt] = useState(sheet.lockedAt);
  const [savedAt, setSavedAt] = useState(sheet.savedAt);
  const [version, setVersion] = useState(0);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    if (version === 0) return;
    const timer = setTimeout(() => setSavedAt(new Date().toISOString()), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [version]);

  const { filled, total } = useMemo(() => {
    const values = students.flatMap((student) => sheet.components.map((component) => scores[student.studentId]?.[component.key] ?? null));
    return { filled: values.filter((value) => value !== null).length, total: values.length };
  }, [scores, sheet.components, students]);

  const state: GradeSheetState = isLocked && EDITABLE_STATUSES.includes(sheet.status) ? "locked" : sheet.state;
  const canRequestChange = sheet.status === "approved" || sheet.status === "published";
  const missing = total - filled;

  const updateScore = (studentId: string, key: string, value: number | null) => {
    setScores((current) => ({ ...current, [studentId]: { ...current[studentId], [key]: value } }));
    setVersion((value) => value + 1);
  };

  const focusCell = (rowIndex: number, columnIndex: number) => inputs.current.get(`${rowIndex}:${columnIndex}`)?.focus();

  const lock = () => {
    setIsLocked(true);
    setLockedAt(new Date().toISOString());
    setIsConfirmOpen(false);
    messageApi.success(`Đã chốt điểm lớp ${classCode}. Bảng điểm đã gửi khoa duyệt.`);
  };

  const requestLock = () => {
    if (missing > 0) {
      messageApi.error(`Còn ${missing} ô điểm trống nên chưa chốt được. Nhập đủ điểm, ô trống được tô vàng.`);
      return;
    }
    setIsConfirmOpen(true);
  };

  const columns: TableColumnsType<GradingStudent> = [
    { title: "STT", key: "index", width: 56, align: "right", fixed: "left", render: (_, __, index) => <span className="text-muted tabular-nums">{index + 1}</span> },
    {
      title: "Sinh viên",
      key: "student",
      width: 210,
      fixed: "left",
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="font-mono text-xs text-muted">{row.studentCode}</span>
        </span>
      ),
    },
    ...sheet.components.map((component, columnIndex) => ({
      title: (
        <span className="flex flex-col">
          <span>{component.label}</span>
          <span className="text-xs font-normal text-muted tabular-nums">{component.weight}%</span>
        </span>
      ),
      key: component.key,
      width: 120,
      align: "center" as const,
      render: (_: unknown, row: GradingStudent, rowIndex: number) => {
        const value = scores[row.studentId]?.[component.key] ?? null;
        if (isLocked) return <span className="tabular-nums">{formatPoint(value, 2)}</span>;
        return (
          <InputNumber
            ref={(element) => {
              const key = `${rowIndex}:${columnIndex}`;
              if (element) inputs.current.set(key, element as unknown as HTMLInputElement);
              else inputs.current.delete(key);
            }}
            min={0}
            max={10}
            step={0.25}
            precision={2}
            decimalSeparator=","
            value={value}
            aria-label={`${component.label} của ${row.fullName}`}
            status={value === null ? "warning" : undefined}
            onChange={(next) => updateScore(row.studentId, component.key, typeof next === "number" ? next : null)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              focusCell(rowIndex + 1, columnIndex);
            }}
            controls={false}
            className="w-20 tabular-nums"
          />
        );
      },
    })),
    {
      title: "Tổng",
      key: "total",
      width: 80,
      align: "right",
      render: (_, row) => <span className="font-medium tabular-nums">{formatPoint(weightedScore(sheet.components, scores[row.studentId] ?? {}), 1)}</span>,
    },
    {
      title: "Điểm chữ",
      key: "letter",
      width: 88,
      align: "center",
      render: (_, row) => {
        const totalScore = weightedScore(sheet.components, scores[row.studentId] ?? {});
        if (totalScore === null) return null;
        const letter = toLetter(totalScore).letter;
        return <span className={`font-medium ${letter === "F" ? "text-rose-700" : ""}`}>{letter}</span>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag status={GRADE_SHEET_STATE[state]} />
            {isLocked && lockedAt ? (
              <span className="text-sm text-muted">Chốt lúc {formatDateTime(lockedAt)}</span>
            ) : (
              <span className="text-sm text-muted tabular-nums">
                Hạn nhập {formatDateTime(sheet.deadline)}, {deadlineText(sheet.deadline)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-40">
              <MeterBar value={filled} max={total} tone={filled === total ? "success" : "primary"} label="Tiến độ nhập điểm" />
            </div>
            <span className="text-xs text-muted tabular-nums">
              Đã nhập {filled}/{total} ô
            </span>
            {!isLocked && savedAt && <span className="text-xs text-muted tabular-nums">Đã lưu nháp lúc {dayjs(savedAt).format("HH:mm")}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Download size={16} aria-hidden />} onClick={() => messageApi.success(`Đã xuất bảng điểm ${classCode} ra tệp Excel.`)}>
            Xuất Excel
          </Button>
          {canRequestChange && requestOptions && (
            <Button icon={<FilePen size={16} aria-hidden />} onClick={() => setIsRequestOpen(true)}>
              Đề nghị sửa điểm
            </Button>
          )}
          {!isLocked && (
            <>
              <Button icon={<Upload size={16} aria-hidden />} onClick={() => messageApi.info("Chọn tệp Excel theo mẫu đã xuất, điểm sẽ được điền vào các ô tương ứng.")}>
                Nhập từ Excel
              </Button>
              <Button type="primary" danger icon={<LockKey size={16} aria-hidden />} onClick={requestLock}>
                Chốt điểm
              </Button>
            </>
          )}
        </div>
      </div>

      {sheet.status === "returned" && !isLocked && (
        <Alert
          type="warning"
          showIcon
          title="Khoa trả lại bảng điểm để chỉnh sửa"
          description={`${returnReason ?? "Khoa chưa ghi lý do."} Sửa các ô liên quan rồi chốt lại để gửi khoa duyệt.`}
        />
      )}
      {isLocked && state === "locked" && (
        <Alert
          type="info"
          showIcon
          title="Bảng điểm đang chờ khoa duyệt"
          description="Không sửa được trong lúc chờ duyệt. Nếu phát hiện sai sót, liên hệ giáo vụ khoa để trả lại bảng điểm."
        />
      )}
      {canRequestChange && (
        <Alert
          type="info"
          showIcon
          title={sheet.status === "published" ? "Điểm đã công bố cho sinh viên" : "Khoa đã duyệt, chờ Phòng Đào tạo công bố"}
          description="Muốn sửa điểm phải gửi đơn đề nghị sửa điểm kèm minh chứng, qua Trưởng khoa và Phòng Đào tạo."
        />
      )}
      {state === "overdue" && (
        <Alert
          type="error"
          showIcon
          title="Đã quá hạn nhập điểm"
          description="Phòng Đào tạo vẫn nhận bảng điểm nhưng lớp sẽ bị ghi nhận nộp trễ. Chốt điểm sớm nhất có thể."
        />
      )}
      {!isLocked && (
        <p className="text-xs text-muted">Nhấn Tab để sang ô bên phải, Enter để xuống sinh viên kế tiếp. Điểm từ 0 đến 10, bước 0,25.</p>
      )}

      <Table
        rowKey="studentId"
        size="middle"
        columns={columns}
        dataSource={students}
        pagination={false}
        scroll={{ x: 560 + sheet.components.length * 120 }}
        locale={{ emptyText: <EmptyState title="Lớp chưa có sinh viên" description="Bảng điểm sẽ có sau khi sinh viên đăng ký học phần." /> }}
      />

      <Modal
        open={isConfirmOpen}
        title={`Chốt điểm lớp ${classCode}?`}
        okText="Chốt điểm"
        cancelText="Hủy"
        okButtonProps={{ danger: true }}
        mask={{ closable: false }}
        onOk={lock}
        onCancel={() => setIsConfirmOpen(false)}
      >
        <p className="text-sm text-pretty">
          Sau khi chốt, bảng điểm của {students.length} sinh viên được gửi khoa duyệt rồi Phòng Đào tạo công bố. Bạn không sửa được nữa, trừ
          khi khoa trả lại hoặc qua đơn đề nghị sửa điểm.
        </p>
      </Modal>

      {requestOptions && (
        <NewLecturerRequestDrawer
          open={isRequestOpen}
          onClose={() => setIsRequestOpen(false)}
          {...requestOptions}
          prefill={{ kind: "grade-change", classId }}
          onCreated={(request) => {
            setIsRequestOpen(false);
            messageApi.success(`Đã gửi đơn ${request.code}. Theo dõi tiến độ ở mục Đơn từ.`);
          }}
        />
      )}
    </div>
  );
}
